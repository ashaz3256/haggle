import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkBuyerDraft, type Move } from "@/lib/negotiate";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), message: z.string().trim().min(1).max(1000), price: z.number().positive() }),
  z.object({ action: z.literal("redo") }),
]);

/**
 * Co-pilot mode: the buyer approves (optionally editing) or discards their agent's drafted move.
 * An approved draft is checked by the same guard as model output, then the engine sends it on the next run.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Send needs a message and a price" }, { status: 400 });
  const neg = await db.negotiation.findUnique({ where: { id } });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (neg.mode !== "copilot" || !neg.draftMove || neg.status !== "negotiating")
    return NextResponse.json({ error: "No draft is waiting for you" }, { status: 409 });

  if (parsed.data.action === "redo") {
    await db.negotiation.update({ where: { id }, data: { draftMove: null } });
    return NextResponse.json({ ok: true });
  }

  const draft = JSON.parse(neg.draftMove) as Move;
  const { message, price } = parsed.data;
  // Changing the price of an accept turns it into a counter-offer.
  const action = draft.action === "accept" && price !== draft.price ? "counter" : draft.action;
  const res = await checkBuyerDraft(id, { ...draft, message, price, action });
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  await db.negotiation.update({ where: { id }, data: { draftMove: JSON.stringify({ ...res.move, approved: true }) } });
  return NextResponse.json({ ok: true });
}
