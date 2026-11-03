import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const neg = await db.negotiation.findUnique({
    where: { id },
    include: { listing: true, turns: { orderBy: { idx: "asc" } } },
  });
  if (!neg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Public view only: no private limits from either side.
  const { floorPrice, earliestDays, sellerNotes, ...listing } = neg.listing;
  const { buyerMax, buyerDeadlineDays, buyerMustHaves, ...rest } = neg;
  return NextResponse.json({ ...rest, listing, buyerMax, buyerDeadlineDays, buyerMustHaves });
}
