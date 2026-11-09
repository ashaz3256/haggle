import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  category: z.string().default("service"),
  askingPrice: z.number().positive(),
  floorPrice: z.number().positive(),
  earliestDays: z.number().int().positive(),
  sellerNotes: z.string().default(""),
  sellerName: z.string().default("Seller"),
  imageData: z.string().startsWith("data:image/").max(600_000).optional(),
});

export async function GET() {
  const listings = await db.listing.findMany({ orderBy: { createdAt: "desc" } });
  // Strip private seller fields before sending to the client.
  return NextResponse.json(
    listings.map(({ floorPrice, earliestDays, sellerNotes, imageData, ownerToken, ...pub }) => ({ ...pub, hasImage: imageData != null }))
  );
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.floorPrice > parsed.data.askingPrice)
    return NextResponse.json({ error: "Floor price can't exceed asking price" }, { status: 400 });
  const ownerToken = crypto.randomUUID();
  const listing = await db.listing.create({ data: { ...parsed.data, ownerToken } });
  // The posting browser becomes the listing's owner: it sees the seller view instead of the buyer brief.
  const res = NextResponse.json({ id: listing.id });
  res.cookies.set(`haggle_own_${listing.id}`, ownerToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
