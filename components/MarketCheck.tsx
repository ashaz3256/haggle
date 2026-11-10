import type { Market } from "@/lib/market";

/** Public market comparables from Channel3, shown to humans the same way the agents see them. */
export default function MarketCheck({ market, askingPrice }: { market: Market; askingPrice: number }) {
  if (market.comps.length === 0) return null;
  const newPrices = market.comps.filter((c) => c.condition !== "used").map((c) => c.price);
  const lowestNew = newPrices.length ? Math.min(...newPrices) : null;
  return (
    <div className="mt-6 rounded-xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-navy">Market check</h2>
        <span className="text-xs text-muted">live UK prices via Channel3</span>
      </div>
      {lowestNew != null && (
        <p className="mt-1 text-sm text-muted">
          New from <b className="text-navy">£{lowestNew.toFixed(0)}</b>
          {askingPrice < lowestNew && <> · this listing asks <b className="text-green">{Math.round((1 - askingPrice / lowestNew) * 100)}% less</b></>}
          . Both agents see these prices and can cite them.
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {market.comps.map((c) => (
          <li key={c.url} className="flex items-center gap-3">
            {c.image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.image} alt="" className="h-10 w-10 rounded-lg object-contain bg-mist shrink-0" loading="lazy" />
              : <div className="h-10 w-10 rounded-lg bg-mist shrink-0" />}
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-sm">
              <span className="block truncate font-semibold text-navy hover:text-blue">{c.title}</span>
              <span className="block text-xs text-muted">{c.domain}{c.condition === "used" ? " · used" : ""}</span>
            </a>
            <span className="font-bold text-navy">£{c.price.toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
