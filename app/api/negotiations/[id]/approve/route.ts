import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Each human must explicitly approve the deal their agent reached. Nothing moves to PayPal without both. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = (await req.json()) as { role: "buyer" | "seller" };
  if (role !== "buyer" && role !== "seller") return NextResponse.json({ error: "role must be buyer|seller" }, { status: 400 });

  const neg = await db.negotiation.findUnique({ where: { id } });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (neg.status !== "agreed") return NextResponse.json({ error: "Deal is not in agreed state" }, { status: 409 });

  const updated = await db.negotiation.update({
    where: { id },
    data: role === "buyer" ? { buyerApproved: true } : { sellerApproved: true },
  });
  return NextResponse.json({ buyerApproved: updated.buyerApproved, sellerApproved: updated.sellerApproved });
}
