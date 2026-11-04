import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const steps = [
  {
    n: 1,
    title: "Brief your agent",
    body: "Pick a listing and tell your agent your real limits: max budget, deadline, must-haves, and how firm to be. These numbers are private. The seller's agent never sees them, and the seller set a private floor your agent never sees.",
    tip: "Try a max a little under the asking price. Agents usually land between the two.",
  },
  {
    n: 2,
    title: "Watch the agents negotiate",
    body: "Two AI agents take turns in a deal room. Each only knows the public listing, its own side's limits, and the transcript so far. Every move is a structured offer: price, delivery days, what's included, and a short message.",
    tip: "A full negotiation takes 10 to 60 seconds. Reload the page any time; it picks up where it left off.",
  },
  {
    n: 3,
    title: "The guard keeps them honest",
    body: "Before any move is shown, the server checks it against that side's hard limits. A buyer agent offering above your max, or a seller agent going below its floor, gets blocked and told to try again. Two violations in a row and the agent is forced to walk.",
    tip: "Blocked moves appear as red Guard rows in the transcript and are counted in the side panel.",
  },
  {
    n: 4,
    title: "One of three endings",
    body: "Agents are not allowed to haggle forever. If the price gap stops closing, the server steps in. The result is always one of three clearly labelled outcomes, each with a reason you can read.",
    tip: null,
  },
  {
    n: 5,
    title: "Humans approve, PayPal settles",
    body: "A deal the agents reached is only a proposal. Both the buyer and the seller click Approve. Only then does the server create a PayPal order, and only after PayPal confirms payment is the deal marked paid.",
    tip: "This runs on the PayPal sandbox. Use a sandbox personal account to pay; no real money moves.",
  },
];

const outcomes = [
  {
    label: "Deal",
    tone: "border-green/30",
    pill: "bg-green/10 text-green",
    title: "The agents found overlap",
    body: "One side accepts the other's last offer. You see the agreed price, delivery, and deliverables, how far under asking and under your max it landed, and the approve buttons.",
  },
  {
    label: "Needs you",
    tone: "border-amber/40",
    pill: "bg-amber/15 text-amber",
    title: "Close, but outside the brief",
    body: "The other side's best offer is just over your limit (within 15%). Your agent will not stretch your limit on its own. It stops, shows you the terms, and leaves a private note explaining the gap. You choose: stretch and take it, or walk away.",
  },
  {
    label: "No deal",
    tone: "border-red/30",
    pill: "bg-red/10 text-red",
    title: "Walking away was the right call",
    body: "An agent decides the gap cannot close, or the server notices two rounds with no movement and ends it. The card says who ended it and why. No deal is better than a bad deal.",
  },
];

export default async function HowItWorks() {
  const listings = await db.listing.findMany({ orderBy: { createdAt: "asc" } });
  const bike = listings.find((l) => /bike/i.test(l.title)) ?? listings[0];
  const tryIt = bike
    ? [
        { max: Math.round(bike.askingPrice * 0.8), want: "a deal", pill: "bg-green/10 text-green" },
        { max: Math.round(bike.askingPrice * 0.7), want: "an escalation to you", pill: "bg-amber/15 text-amber" },
        { max: Math.round(bike.askingPrice * 0.5), want: "a walk-away", pill: "bg-red/10 text-red" },
      ]
    : [];

  return (
    <div className="space-y-10">
      <section className="max-w-2xl">
        <p className="text-blue text-xs font-semibold uppercase tracking-widest mb-2">Tutorial</p>
        <h1 className="text-3xl font-extrabold text-navy tracking-tight">How Haggle works</h1>
        <p className="mt-3 text-muted">
          Five steps from a listing to a PayPal payment, with AI agents doing the haggling and humans keeping the final say.
          Takes about two minutes to try.
        </p>
      </section>

      <ol className="space-y-4">
        {steps.map((s) => (
          <li key={s.n} className="card p-6 flex gap-5">
            <div className="shrink-0 w-10 h-10 rounded-full bg-navy text-white font-extrabold flex items-center justify-center">{s.n}</div>
            <div className="space-y-2">
              <h2 className="font-bold text-navy text-lg">{s.title}</h2>
              <p className="text-sm leading-relaxed">{s.body}</p>
              {s.n === 4 && (
                <div className="grid gap-3 md:grid-cols-3 pt-2">
                  {outcomes.map((o) => (
                    <div key={o.label} className={`rounded-xl border bg-mist p-4 ${o.tone}`}>
                      <span className={`pill ${o.pill}`}>{o.label}</span>
                      <div className="mt-2 font-semibold text-navy text-sm">{o.title}</div>
                      <p className="mt-1 text-xs text-muted leading-relaxed">{o.body}</p>
                    </div>
                  ))}
                </div>
              )}
              {s.tip && <p className="text-xs text-muted border-l-2 border-sky pl-3">{s.tip}</p>}
            </div>
          </li>
        ))}
      </ol>

      <section className="card p-6 space-y-4">
        <div>
          <h2 className="font-bold text-navy text-lg">Who sees what</h2>
          <p className="text-sm text-muted mt-1">The whole design rests on each agent knowing only its own side.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-semibold">Information</th>
                <th className="py-2 pr-4 font-semibold">Buyer&apos;s agent</th>
                <th className="py-2 pr-4 font-semibold">Seller&apos;s agent</th>
                <th className="py-2 font-semibold">Server guard</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-line">
              {[
                ["Listing, asking price, description", "yes", "yes", "yes"],
                ["Buyer's max budget and deadline", "yes", "never", "yes"],
                ["Seller's floor price and earliest delivery", "never", "yes", "yes"],
                ["Full transcript of offers", "yes", "yes", "yes"],
                ["Agent's private note to its own human", "writes it", "writes it", "stores it"],
              ].map((r) => (
                <tr key={r[0]}>
                  <td className="py-2 pr-4">{r[0]}</td>
                  {r.slice(1).map((c, i) => (
                    <td key={i} className={`py-2 pr-4 font-semibold ${c === "never" ? "text-red" : "text-green"}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {bike && (
        <section className="card p-6 space-y-4 bg-gradient-to-br from-navy to-navy-2 text-white border-0">
          <div>
            <h2 className="font-bold text-lg">Try all three endings</h2>
            <p className="text-sm text-white/80 mt-1">
              Open <span className="font-semibold text-white">{bike.title}</span> (asking £{bike.askingPrice}) and brief your agent three
              times, changing only the max budget. Keep 7 days and &quot;helmet included&quot; as the must-have.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {tryIt.map((t) => (
              <Link key={t.max} href={`/listing/${bike.id}`} className="rounded-xl bg-white/10 hover:bg-white/15 transition p-4 block">
                <span className={`pill ${t.pill}`}>expect {t.want}</span>
                <div className="mt-2 text-2xl font-extrabold">Max £{t.max}</div>
                <div className="text-xs text-white/70 mt-1">Send your agent in →</div>
              </Link>
            ))}
          </div>
          <p className="text-xs text-white/60">
            Outcomes depend on the seller&apos;s private floor and on the model, so the middle one occasionally lands as a deal or a walk. The reason is always shown.
          </p>
        </section>
      )}

      <div className="flex gap-3">
        <Link href="/" className="btn-blue">Browse listings</Link>
        <Link href="/dashboard" className="btn-ghost">See past deals</Link>
      </div>
    </div>
  );
}
