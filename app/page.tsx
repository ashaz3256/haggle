import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const listings = await db.listing.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-8">
      <section className="card p-8 md:p-10 bg-gradient-to-br from-navy to-navy-2 text-white border-0 overflow-hidden relative">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-sky/20 blur-3xl" />
        <p className="text-sky text-xs font-semibold uppercase tracking-widest mb-3">Agentic commerce</p>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight max-w-2xl">
          Your agent haggles. Their agent haggles back. You both approve. PayPal settles.
        </h1>
        <p className="mt-4 max-w-xl text-white/80">
          Set a budget and a deadline. Two AI agents negotiate price, timeline and deliverables inside hard limits
          neither side can see. Nothing is paid until both humans sign off.
        </p>
        <div className="mt-6 flex gap-3">
          <a href="#listings" className="btn bg-white text-navy hover:bg-mist">Browse listings</a>
          <Link href="/sell" className="btn border border-white/30 text-white hover:bg-white/10">Post a listing</Link>
        </div>
      </section>

      <section id="listings" className="space-y-4">
        <h2 className="text-xl font-bold text-navy">Open listings</h2>
        {listings.length === 0 && (
          <div className="card p-8 text-center text-muted">
            No listings yet. <Link className="text-blue font-semibold" href="/sell">Post one</Link> or run <code>npm run db:seed</code>.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {listings.map((l) => (
            <Link key={l.id} href={`/listing/${l.id}`} className="card p-5 hover:-translate-y-0.5 transition block">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="pill bg-mist text-muted">{l.category}</span>
                  <h3 className="mt-2 font-bold text-lg text-navy">{l.title}</h3>
                  <p className="mt-1 text-sm text-muted line-clamp-2">{l.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-muted">Asking</div>
                  <div className="text-2xl font-extrabold text-navy">£{l.askingPrice}</div>
                </div>
              </div>
              <div className="mt-4 text-sm font-semibold text-blue">Send your agent →</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
