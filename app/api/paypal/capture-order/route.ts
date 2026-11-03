import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { captureOrder } from "@/lib/paypal";

export async function POST(req: Request) {
  const { negotiationId, orderId } = (await req.json()) as { negotiationId: string; orderId: string };
  const neg = await db.negotiation.findUnique({ where: { id: negotiationId } });
  if (!neg || neg.paypalOrderId !== orderId) return NextResponse.json({ error: "Order mismatch" }, { status: 400 });

  const result = await captureOrder(orderId);
  const captureId = result.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;

  if (result.status === "COMPLETED") {
    await db.negotiation.update({ where: { id: neg.id }, data: { status: "paid", paypalCaptureId: captureId } });
  }
  return NextResponse.json({ status: result.status, captureId });
}
