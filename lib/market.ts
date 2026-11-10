import { db } from "@/lib/db";

/** One comparable product from Channel3: what the same kind of item sells for at real UK retailers. */
export type Comp = { title: string; price: number; currency: string; condition: string | null; domain: string; url: string; image: string | null };
export type Market = { query: string; fetchedAt: string; comps: Comp[] };

type ListingLike = { id: string; title: string; category: string; askingPrice: number; marketData: string | null };

type C3Offer = { url: string; domain: string; price?: { price: number; currency: string }; condition?: string | null; availability?: string };
type C3Product = { title: string; offers?: C3Offer[]; images?: { url: string; cleaned_url?: string | null; is_main_image?: boolean }[] };

/** Strip words that describe this copy of the item rather than the product, so retail search finds the product. */
function toQuery(title: string) {
  return title
    .replace(/\b(used|second[- ]?hand|pre[- ]?owned|barely|like new|good condition|mint)\b/gi, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[—–\-,()|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Market prices for a physical item, via Channel3 product search (UK, GBP).
 * Fetched once per listing and cached on it. Services/freelance work have no retail comparables, so they get none.
 * Never throws: a missing key or a failed call just means the agents negotiate without a market reference.
 */
export async function getMarket(listing: ListingLike): Promise<Market | null> {
  if (listing.category !== "item") return null;
  if (listing.marketData) {
    try { return JSON.parse(listing.marketData) as Market; } catch { /* refetch */ }
  }
  const key = process.env.CHANNEL3_API_KEY;
  if (!key) return null;
  const query = toQuery(listing.title);
  if (!query) return null;
  try {
    const res = await fetch("https://api.trychannel3.com/v1/search", {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 12, filters: { conditions: ["new", "used"], availability: ["InStock"] }, config: { country: "GB", currency: "GBP" } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.warn(`[market] Channel3 ${res.status}`); return null; }
    const data = (await res.json()) as { products?: C3Product[] };
    // These are new-retail reference prices, and a listing normally asks less than new. Keeping prices from the
    // asking price up to 5x drops accessories and kids' versions (cheaper) and flagship models (far dearer).
    const lo = listing.askingPrice * 1.05, hi = listing.askingPrice * 5;
    const comps: Comp[] = [];
    for (const p of data.products ?? []) {
      const o = (p.offers ?? []).find((x) => x.price && x.price.currency === "GBP");
      if (!o?.price || o.price.price < lo || o.price.price > hi) continue;
      const img = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
      comps.push({ title: p.title, price: o.price.price, currency: o.price.currency, condition: o.condition ?? null, domain: o.domain, url: o.url, image: img?.cleaned_url ?? img?.url ?? null });
      if (comps.length === 4) break;
    }
    const market: Market = { query, fetchedAt: new Date().toISOString(), comps };
    await db.listing.update({ where: { id: listing.id }, data: { marketData: JSON.stringify(market) } });
    return market;
  } catch (e) {
    console.warn("[market] Channel3 lookup failed:", (e as Error).message);
    return null;
  }
}

/** Public market reference for the agents' prompts (both sides see the same facts). */
export function marketBlock(m: Market | null): string {
  if (!m || m.comps.length === 0) return "";
  const lines = m.comps.map((c) => `- ${c.title}: £${c.price.toFixed(0)}${c.condition === "used" ? " (used)" : " new"} at ${c.domain}`);
  return `\nMARKET REFERENCE (live UK retail prices from Channel3 product search; public, both sides can see it)\n${lines.join("\n")}\nA used item typically sells well below the new retail price. Mention this market reference at least once in your messages (for example what it costs new) to justify your position.\n`;
}
