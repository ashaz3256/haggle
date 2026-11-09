import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({ buyerMax: z.number().positive().max(1_000_000) });

/**
 * The buyer changes their max budget while the agents are negotiating.
 * The engine picks it up before the buyer agent's next turn; the guard enforces the new number.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "buyerMax must be a positive number" }, { status: 400 });
  const neg = await db.negotiation.findUnique({ where: { id } });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (neg.status !== "pending" && neg.status !== "negotiating")
    return NextResponse.json({ error: `Negotiation already ${neg.status}` }, { status: 409 });
  if (parsed.data.buyerMax === neg.buyerMax) return NextResponse.json({ buyerMax: neg.buyerMax });
  await db.negotiation.update({ where: { id }, data: { buyerMax: parsed.data.buyerMax } });
  // Log it for the humans. Agents only ever see buyer/seller turns, so the seller's agent never learns this.
  const last = await db.turn.findFirst({ where: { negotiationId: id }, orderBy: { idx: "desc" }, select: { idx: true } });
  await db.turn.create({
    data: {
      negotiationId: id,
      idx: (last?.idx ?? -1) + 1,
      role: "system",
      action: "info",
      message: `${neg.buyerName} changed their max budget from £${neg.buyerMax} to £${parsed.data.buyerMax}. Private: the seller's agent can't see this.`,
    },
  });
  return NextResponse.json({ buyerMax: parsed.data.buyerMax });
}
