import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createOrder } from "@/lib/paypal";

export async function POST(req: Request) {
  const { negotiationId } = (await req.json()) as { negotiationId: string };
  const neg = await db.negotiation.findUnique({ where: { id: negotiationId }, include: { listing: true } });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Hard gate: agents reached a deal AND both humans approved it.
  if (neg.status !== "agreed" || !neg.buyerApproved || !neg.sellerApproved)
    return NextResponse.json({ error: "Both parties must approve the deal before checkout" }, { status: 409 });
  if (!neg.agreedPrice) return NextResponse.json({ error: "No agreed price" }, { status: 409 });

  const deliverables: string[] = neg.agreedDeliverables ? JSON.parse(neg.agreedDeliverables) : [];
  const order = await createOrder({
    amount: neg.agreedPrice,
    referenceId: neg.id,
    description: `${neg.listing.title} — ${neg.agreedDays}d — ${deliverables.join(", ")}`,
  });

  await db.negotiation.update({ where: { id: neg.id }, data: { paypalOrderId: order.id } });
  return NextResponse.json({ id: order.id });
}
