import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const rows = await db.negotiation.findMany({
    include: {
      listing: { select: { title: true, askingPrice: true } },
      turns: { select: { idx: true, role: true, action: true, price: true, days: true, message: true, reason: true }, orderBy: { idx: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    rows.map((n) => {
      // needs_human also stores the terms on the table in agreedPrice; only a real deal counts here.
      const dealt = n.status === "agreed" || n.status === "paid";
      const agreed = dealt ? n.agreedPrice : null;
      return {
      id: n.id,
      listing: n.listing.title,
      buyer: n.buyerName,
      asking: n.listing.askingPrice,
      budget: n.buyerMax,
      agreed,
      savedVsAsking: agreed ? n.listing.askingPrice - agreed : null,
      underBudget: agreed ? n.buyerMax - agreed : null,
      days: dealt ? n.agreedDays : null,
      rounds: n.rounds,
      guardBlocks: n.guardBlocks,
      status: n.status,
      paypalOrderId: n.paypalOrderId,
      createdAt: n.createdAt,
      mode: n.mode,
      endReason: n.endReason,
      turns: n.turns,
      };
    })
  );
}
