import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Pause or unpause a running negotiation. The engine checks the flag before every turn. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { paused } = (await req.json()) as { paused?: unknown };
  if (typeof paused !== "boolean") return NextResponse.json({ error: "paused must be a boolean" }, { status: 400 });
  const neg = await db.negotiation.findUnique({ where: { id } });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (neg.status !== "pending" && neg.status !== "negotiating") return NextResponse.json({ error: `Negotiation already ${neg.status}` }, { status: 409 });
  await db.negotiation.update({ where: { id }, data: { paused } });
  return NextResponse.json({ paused });
}
