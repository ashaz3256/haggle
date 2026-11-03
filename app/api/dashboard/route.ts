import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const rows = await db.negotiation.findMany({
    include: { listing: { select: { title: true, askingPrice: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    rows.map((n) => ({
      id: n.id,
      listing: n.listing.title,
      buyer: n.buyerName,
      asking: n.listing.askingPrice,
      budget: n.buyerMax,
      agreed: n.agreedPrice,
      savedVsAsking: n.agreedPrice ? n.listing.askingPrice - n.agreedPrice : null,
      underBudget: n.agreedPrice ? n.buyerMax - n.agreedPrice : null,
      days: n.agreedDays,
      rounds: n.rounds,
      guardBlocks: n.guardBlocks,
      status: n.status,
      paypalOrderId: n.paypalOrderId,
      createdAt: n.createdAt,
    }))
  );
}
