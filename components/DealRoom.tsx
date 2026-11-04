"use client";
import { useEffect, useRef, useState } from "react";
import PayPalCheckout from "./PayPalCheckout";

type Turn = { idx: number; role: string; action: string; message: string; reason: string | null; price: number | null; days: number | null; deliverables: string | null };
type Neg = {
  id: string; status: string; buyerName: string; buyerMax: number; buyerDeadlineDays: number; buyerMustHaves: string;
  agreedPrice: number | null; agreedDays: number | null; agreedDeliverables: string | null;
  endedBy: string | null; endReason: string | null;
  buyerApproved: boolean; sellerApproved: boolean; paypalOrderId: string | null; rounds: number; guardBlocks: number;
  listing: { id: string; title: string; askingPrice: number; sellerName: string; category: string };
  turns: Turn[];
};

const money = (n: number) => `£${n.toFixed(n % 1 ? 2 : 0)}`;

export default function DealRoom({ id }: { id: string }) {
  const [neg, setNeg] = useState<Neg | null>(null);
  const [live, setLive] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const started = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await fetch(`/api/negotiations/${id}`, { cache: "no-store" });
    if (r.ok) setNeg(await r.json());
  };

  useEffect(() => { load(); }, [id]);

  // Kick off (or resume) the negotiation stream once while the deal is still in play.
  useEffect(() => {
    if (!neg || (neg.status !== "pending" && neg.status !== "negotiating") || started.current) return;
    started.current = true;
    setLive(true);
    const lastAgent = [...neg.turns].reverse().find((t) => t.role === "buyer" || t.role === "seller");
    setThinking(lastAgent?.role === "buyer" ? "seller" : "buyer");
    esRef.current?.close();
    const es = new EventSource(`/api/negotiations/${id}/stream`);
    esRef.current = es;
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "turn" || ev.type === "blocked") {
        setThinking(ev.type === "blocked" ? ev.role : ev.role === "buyer" ? "seller" : "buyer");
        load();
      }
      if (ev.type === "agreed" || ev.type === "walked" || ev.type === "escalated") { setThinking(null); load(); }
      if (ev.type === "error") { setErr(ev.reason); setThinking(null); }
      if (ev.type === "done" || ev.type === "error") { es.close(); setLive(false); load(); }
    };
    es.onerror = () => { es.close(); setLive(false); setThinking(null); setErr("Connection to the agents dropped."); load(); };
    // No cleanup here on purpose: the status flips pending -> negotiating after the first move, which re-runs
    // this effect; closing the stream in a cleanup would silently stop the live transcript (the original stall bug).
  }, [neg?.status, id, retry]);

  // Close the stream only when the component unmounts.
  useEffect(() => () => { esRef.current?.close(); }, []);

  function resume() {
    started.current = false;
    setErr(null);
    setRetry((r) => r + 1);
    load();
  }

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [neg?.turns.length, thinking]);

  async function approve(role: "buyer" | "seller") {
    await fetch(`/api/negotiations/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    load();
  }

  async function decide(decision: "approve" | "walk") {
    await fetch(`/api/negotiations/${id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    load();
  }

  if (!neg) return <div className="text-muted">Loading…</div>;

  const deliverables: string[] = neg.agreedDeliverables ? JSON.parse(neg.agreedDeliverables) : [];
  const bothApproved = neg.buyerApproved && neg.sellerApproved;
  const endedByName = neg.endedBy === "buyer" ? `${neg.buyerName}'s agent` : neg.endedBy === "seller" ? `${neg.listing.sellerName}'s agent` : "The server";
  const escalatedToBuyer = neg.endedBy !== "seller" && !(neg.endReason ?? "").includes("seller should decide");

  return (
    <div className="grid gap-6 md:grid-cols-5">
      {/* Transcript */}
      <div className="md:col-span-3 space-y-3">
        <div className="card p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">Negotiating</div>
            <div className="font-bold text-navy">{neg.listing.title}</div>
          </div>
          <StatusPill status={neg.status} live={live} />
        </div>

        <div className="card p-5 min-h-[420px] space-y-3">
          {neg.turns.length === 0 && !thinking && <p className="text-muted text-sm">Waiting for agents…</p>}
          {neg.turns.map((t) => <Bubble key={t.idx} t={t} buyerName={neg.buyerName} sellerName={neg.listing.sellerName} />)}
          {thinking && (
            <div className={`flex ${thinking === "buyer" ? "justify-end" : "justify-start"}`}>
              <div className="rounded-2xl bg-mist px-4 py-3 text-muted text-sm flex gap-1 items-center">
                <span className="capitalize mr-1">{thinking} agent thinking</span>
                <span className="dot">●</span><span className="dot">●</span><span className="dot">●</span>
              </div>
            </div>
          )}
          {err && (
            <div className="flex items-center gap-3">
              <p className="text-red text-sm">{err}</p>
              {(neg.status === "pending" || neg.status === "negotiating") && (
                <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={resume}>Resume</button>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {/* Side panel */}
      <div className="md:col-span-2 space-y-4">
        <div className="card p-5 space-y-3">
          <h3 className="font-bold text-navy">Your brief <span className="pill bg-amber/15 text-amber ml-1">private</span></h3>
          <Row k="Max budget" v={money(neg.buyerMax)} />
          <Row k="Deadline" v={`${neg.buyerDeadlineDays} days`} />
          <Row k="Must-haves" v={neg.buyerMustHaves || "—"} />
          <Row k="Seller asking" v={money(neg.listing.askingPrice)} />
          <Row k="Guard blocks" v={String(neg.guardBlocks)} hint="moves the server rejected for breaking limits" />
        </div>

        {neg.status === "walked" && (
          <div className="card p-5 border-red/30 space-y-2">
            <div>
              <h3 className="font-bold text-red">No deal</h3>
              <p className="text-xs text-muted">{endedByName} ended it after {neg.rounds} round{neg.rounds === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-xl bg-mist p-3 text-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">Why</div>
              {neg.endReason ?? "The agents couldn't find overlap inside both sides' limits."}
            </div>
            <p className="text-xs text-muted">Walking away was inside the brief. Adjust your limits and send the agent back in if you want to.</p>
          </div>
        )}

        {neg.status === "needs_human" && neg.agreedPrice != null && (
          <div className="card p-5 space-y-4 border-amber/40">
            <div>
              <h3 className="font-bold text-amber">Your agent needs a decision</h3>
              <p className="text-xs text-muted">
                {endedByName} stopped after {neg.rounds} round{neg.rounds === 1 ? "" : "s"} · waiting on {escalatedToBuyer ? neg.buyerName : neg.listing.sellerName}
              </p>
            </div>
            <div className="rounded-xl bg-mist p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">On the table</span>
                <span className="text-3xl font-extrabold text-navy">{money(neg.agreedPrice)}</span>
              </div>
              {escalatedToBuyer && (
                <div className="text-xs text-amber font-semibold mt-1">
                  {money(neg.agreedPrice - neg.buyerMax)} over your max of {money(neg.buyerMax)}
                  {neg.agreedDays != null && neg.agreedDays > neg.buyerDeadlineDays ? ` · ${neg.agreedDays - neg.buyerDeadlineDays}d past your deadline` : ""}
                </div>
              )}
              <div className="mt-3 text-sm"><span className="text-muted">Delivery:</span> {neg.agreedDays} days</div>
              {deliverables.length > 0 && (
                <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">{deliverables.map((d, i) => <li key={i}>{d}</li>)}</ul>
              )}
            </div>
            <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber mb-1">Agent&apos;s note to you</div>
              {neg.endReason}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted">The agent will not stretch your limits on its own. Only you can.</p>
              <button onClick={() => decide("approve")} className="w-full btn btn-primary">Stretch my limit · take {money(neg.agreedPrice)}</button>
              <button onClick={() => decide("walk")} className="w-full btn btn-ghost">Walk away</button>
            </div>
          </div>
        )}

        {(neg.status === "agreed" || neg.status === "paid") && (
          <div className="card p-5 space-y-4 border-green/30">
            <div>
              <h3 className="font-bold text-green">Deal reached</h3>
              <p className="text-xs text-muted">in {neg.rounds} round{neg.rounds === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-xl bg-mist p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Agreed price</span>
                <span className="text-3xl font-extrabold text-navy">{money(neg.agreedPrice!)}</span>
              </div>
              <div className={`text-xs font-semibold mt-1 ${neg.agreedPrice! > neg.buyerMax ? "text-amber" : "text-green"}`}>
                {money(neg.listing.askingPrice - neg.agreedPrice!)} under asking ·{" "}
                {neg.agreedPrice! > neg.buyerMax ? `${money(neg.agreedPrice! - neg.buyerMax)} over your max (you approved the stretch)` : `${money(neg.buyerMax - neg.agreedPrice!)} under your max`}
              </div>
              <div className="mt-3 text-sm"><span className="text-muted">Delivery:</span> {neg.agreedDays} days</div>
              {deliverables.length > 0 && (
                <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">{deliverables.map((d, i) => <li key={i}>{d}</li>)}</ul>
              )}
            </div>

            {neg.status === "paid" ? (
              <div className="rounded-xl bg-green/10 text-green p-4 text-sm font-semibold">
                ✓ Paid via PayPal · order {neg.paypalOrderId}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-muted">Both humans must approve before any money moves.</p>
                  <ApproveButton label={`${neg.buyerName} (buyer)`} done={neg.buyerApproved} onClick={() => approve("buyer")} />
                  <ApproveButton label={`${neg.listing.sellerName} (seller)`} done={neg.sellerApproved} onClick={() => approve("seller")} />
                </div>
                {bothApproved ? (
                  <PayPalCheckout negotiationId={neg.id} amount={neg.agreedPrice!} onPaid={load} />
                ) : (
                  <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
                    PayPal checkout unlocks when both sides approve
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted" title={hint}>{k}</span>
      <span className="font-semibold text-right">{v}</span>
    </div>
  );
}

function ApproveButton({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={done} className={`w-full btn ${done ? "bg-green/10 text-green" : "btn-primary"}`}>
      {done ? "✓ Approved by " : "Approve as "}{label}
    </button>
  );
}

function StatusPill({ status, live }: { status: string; live: boolean }) {
  const map: Record<string, string> = {
    pending: "bg-mist text-muted", negotiating: "bg-blue/10 text-blue", agreed: "bg-green/10 text-green",
    walked: "bg-red/10 text-red", paid: "bg-green text-white", needs_human: "bg-amber/15 text-amber",
  };
  const label = status === "needs_human" ? "needs you" : status;
  return <span className={`pill ${map[status] ?? ""}`}>{live && <span className="w-1.5 h-1.5 rounded-full bg-blue mr-1.5 animate-pulse" />}{label}</span>;
}

function Bubble({ t, buyerName, sellerName }: { t: Turn; buyerName: string; sellerName: string }) {
  if (t.role === "system") {
    const guard = t.action === "blocked";
    return (
      <div className={`rise mx-auto max-w-md rounded-xl border px-4 py-2.5 text-xs ${guard ? "border-red/30 bg-red/5 text-red" : "border-amber/30 bg-amber/5 text-amber"}`}>
        <span className="font-bold">{guard ? "⛔ Guard" : "⏸ System"}</span> · {t.message}
      </div>
    );
  }
  const isBuyer = t.role === "buyer";
  const dl: string[] = t.deliverables ? JSON.parse(t.deliverables) : [];
  return (
    <div className={`rise flex ${isBuyer ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${isBuyer ? "bg-navy text-white" : "bg-mist text-ink"}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${isBuyer ? "text-sky" : "text-muted"}`}>
          {isBuyer ? `${buyerName}'s agent` : `${sellerName}'s agent`}
          {t.action === "accept" && " · ACCEPTS"}
          {t.action === "walk" && " · WALKS AWAY"}
          {t.action === "escalate" && " · ASKS ITS HUMAN"}
        </div>
        <p className="text-sm leading-relaxed">{t.message}</p>
        {(t.action === "walk" || t.action === "escalate") && t.reason && (
          <p className={`mt-2 text-xs italic border-l-2 pl-2 ${isBuyer ? "border-sky text-white/80" : "border-amber text-muted"}`}>
            Private note to {isBuyer ? buyerName : sellerName}: {t.reason}
          </p>
        )}
        {t.price != null && t.action !== "walk" && t.action !== "escalate" && (
          <div className={`mt-2 inline-flex flex-wrap gap-1.5 text-xs ${isBuyer ? "text-white/90" : "text-navy"}`}>
            <span className={`rounded-md px-2 py-0.5 font-bold ${isBuyer ? "bg-white/15" : "bg-white"}`}>{money(t.price)}</span>
            <span className={`rounded-md px-2 py-0.5 ${isBuyer ? "bg-white/15" : "bg-white"}`}>{t.days}d</span>
            {dl.map((d, i) => <span key={i} className={`rounded-md px-2 py-0.5 ${isBuyer ? "bg-white/15" : "bg-white"}`}>{d}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
