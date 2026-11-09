import Link from "next/link";
import { db } from "@/lib/db";
import CopyLink from "./CopyLink";

const PILL: Record<string, string> = {
  pending: "bg-mist text-muted", negotiating: "bg-blue/10 text-blue", agreed: "bg-green/10 text-green",
  walked: "bg-red/10 text-red", paid: "bg-green text-white", needs_human: "bg-amber/15 text-amber",
};
const LABEL: Record<string, string> = { needs_human: "needs a decision", walked: "no deal" };

/**
 * What the owner of a listing sees instead of the buyer brief. Rendered on the server only for the browser
 * holding the listing's owner cookie, so the private limits below never reach anyone else.
 */
export default async function SellerPanel({ listing, posted }: {
  listing: { id: string; floorPrice: number; earliestDays: number; sellerNotes: string; category: string };
  posted: boolean;
}) {
  const deals = await db.negotiation.findMany({
    where: { listingId: listing.id },
    orderBy: { createdAt: "desc" },
    include: { turns: { where: { role: { in: ["buyer", "seller"] } }, orderBy: { idx: "desc" }, take: 1 } },
  });
  const readyLabel = listing.category === "item" ? "Ready to hand over in" : "Earliest delivery";
  const testHref = `/listing/${listing.id}?as=buyer`;

  return (
    <div className="space-y-4 md:sticky md:top-20">
      {posted && (
        <div className="rounded-2xl bg-green/10 text-green px-4 py-3 text-sm font-semibold">✓ Posted. Your listing is live.</div>
      )}

      <div className="card p-5 space-y-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-blue">You&apos;re the seller</div>
          <h2 className="font-bold text-navy text-lg">Your agent is on duty</h2>
        </div>
        <p className="text-sm text-muted">
          You don&apos;t brief anyone here. Buyers brief <em>their</em> agents, and your agent negotiates with each of them
          inside the limits below. Nothing is sold until you approve the deal.
        </p>
        <CopyLink path={`/listing/${listing.id}`} />
      </div>

      <div className="card p-5 space-y-2.5 border-amber/40 bg-amber/5">
        <h3 className="font-bold text-navy text-sm flex items-center gap-2">
          Your agent&apos;s limits <span className="pill bg-amber/15 text-amber">private</span>
        </h3>
        <div className="flex justify-between text-sm"><span className="text-muted">Lowest you&apos;d accept</span><span className="font-semibold">£{listing.floorPrice}</span></div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">{readyLabel}</span>
          <span className="font-semibold">{listing.earliestDays} day{listing.earliestDays === 1 ? "" : "s"}</span>
        </div>
        {listing.sellerNotes && <div className="text-sm"><span className="text-muted">Notes: </span>{listing.sellerNotes}</div>}
        <p className="text-[11px] text-muted">Only you can see this. Buyers and their agents never do.</p>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-bold text-navy text-sm">
          Buyers so far {deals.length > 0 && <span className="text-muted font-normal">({deals.length})</span>}
        </h3>
        {deals.length === 0 ? (
          <p className="text-sm text-muted">
            No buyers yet. Share the link, or <Link href={testHref} className="text-blue font-semibold">test it as a buyer yourself →</Link>
          </p>
        ) : (
          <ul className="divide-y divide-line -mx-1">
            {deals.map((d) => {
              const price = d.agreedPrice ?? d.turns[0]?.price ?? null;
              return (
                <li key={d.id}>
                  <Link href={`/deal/${d.id}`} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-mist rounded-lg">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-navy truncate">{d.buyerName}</div>
                      <div className="text-xs text-muted">
                        {d.rounds > 0 ? `${d.rounds} round${d.rounds === 1 ? "" : "s"}` : "in progress"}
                        {price != null ? ` · £${price}` : ""}
                      </div>
                    </div>
                    <span className={`pill shrink-0 ${PILL[d.status] ?? ""}`}>{LABEL[d.status] ?? d.status}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {deals.length > 0 && (
          <Link href={testHref} className="block text-xs font-semibold text-muted hover:text-blue">Test it as a buyer yourself →</Link>
        )}
      </div>
    </div>
  );
}
