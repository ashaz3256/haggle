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
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const listing = await db.listing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const neg = await db.negotiation.create({ data: parsed.data });
  return NextResponse.json({ id: neg.id });
}
