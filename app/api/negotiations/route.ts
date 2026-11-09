import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({
  listingId: z.string(),
  buyerName: z.string().default("Buyer"),
  buyerMax: z.number().positive(),
  buyerDeadlineDays: z.number().int().positive(),
  buyerMustHaves: z.string().default(""),
  buyerStyle: z.enum(["friendly", "firm", "aggressive"]).default("friendly"),
  mode: z.enum(["auto", "copilot"]).default("auto"),
});

/** Per-IP cap on starting negotiations (each one costs ~a dozen LLM calls). In-memory, per server process. */
const RATE_LIMIT = Number(process.env.NEG_RATE_LIMIT ?? 12);
const RATE_WINDOW_MS = 60 * 60 * 1000;
const starts = new Map<string, number[]>();

function overLimit(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (starts.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  starts.set(ip, recent);
  return false;
}

export async function POST(req: Request) {
  if (overLimit(req)) {
    return NextResponse.json({ error: `Rate limit: at most ${RATE_LIMIT} negotiations per hour from one address. Try again later.` }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const listing = await db.listing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const neg = await db.negotiation.create({ data: parsed.data });
  return NextResponse.json({ id: neg.id });
}
