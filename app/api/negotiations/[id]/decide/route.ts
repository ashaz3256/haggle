import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * A human resolves a negotiation the agents parked as `needs_human`.
 *   approve → take the terms on the table (a knowing stretch past the brief); the deal still needs both approvals + PayPal.
 *   walk    → decline; no deal.
 * The agent never gets to make this call itself.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision } = (await req.json()) as { decision: "approve" | "walk" };
  if (decision !== "approve" && decision !== "walk") return NextResponse.json({ error: "decision must be approve|walk" }, { status: 400 });

  const neg = await db.negotiation.findUnique({ where: { id }, include: { turns: { select: { idx: true }, orderBy: { idx: "desc" }, take: 1 } } });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (neg.status !== "needs_human") return NextResponse.json({ error: "Negotiation is not waiting on a human" }, { status: 409 });

  const who = neg.endedBy === "seller" ? "Seller" : "Buyer";
  const idx = (neg.turns[0]?.idx ?? -1) + 1;
  const message =
    decision === "approve"
      ? `${who} (human) approved the escalated terms: £${neg.agreedPrice} / ${neg.agreedDays} days. The agent's limits were stretched on purpose.`
      : `${who} (human) declined the escalated terms: £${neg.agreedPrice} / ${neg.agreedDays} days. No deal.`;

  await db.turn.create({ data: { negotiationId: id, idx, role: "system", action: "info", message } });
  const updated = await db.negotiation.update({
    where: { id },
    data: decision === "approve" ? { status: "agreed" } : { status: "walked", endReason: message },
  });
  return NextResponse.json({ status: updated.status });
}
