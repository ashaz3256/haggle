"use client";
import { useEffect, useRef, useState } from "react";
import PayPalCheckout from "./PayPalCheckout";

type Turn = { idx: number; role: string; action: string; message: string; reason: string | null; price: number | null; days: number | null; deliverables: string | null };
type Neg = {
  id: string; status: string; buyerName: string; buyerMax: number; buyerDeadlineDays: number; buyerMustHaves: string;
  agreedPrice: number | null; agreedDays: number | null; agreedDeliverables: string | null;
  endedBy: string | null; endReason: string | null;
  mode: string; paused: boolean; draftMove: string | null;
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
  const atBottom = useRef(true);
  const programmaticScrollAt = useRef(0);
  const [unseen, setUnseen] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [editMax, setEditMax] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/negotiations/${id}`, { cache: "no-store" });
    if (r.ok) setNeg(await r.json());
  };

  useEffect(() => { load(); }, [id]);

  const draft = neg?.mode === "copilot" && neg.draftMove ? (JSON.parse(neg.draftMove) as DraftMove) : null;
  const waitingOnDraft = draft != null && !draft.approved;
  const inPlay = neg != null && (neg.status === "pending" || neg.status === "negotiating");

  // Kick off (or resume) the negotiation stream once while the deal is still in play and nobody is holding it.
  useEffect(() => {
    if (!neg || !inPlay || neg.paused || waitingOnDraft || started.current) return;
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
      if (ev.type === "info") load();
      if (ev.type === "paused" || ev.type === "draft") {
        setThinking(null); setPausing(false);
        if (ev.type === "draft" && ev.reason) setErr(`Your edit was blocked: ${ev.reason}`);
      }
      if (ev.type === "agreed" || ev.type === "walked" || ev.type === "escalated") { setThinking(null); load(); }
      if (ev.type === "error") { setErr(ev.reason); setThinking(null); }
      if (ev.type === "done" || ev.type === "error") { es.close(); setLive(false); load(); }
    };
    es.onerror = () => { es.close(); setLive(false); setThinking(null); setErr("Connection to the agents dropped."); load(); };
    // No cleanup here on purpose: the status flips pending -> negotiating after the first move, which re-runs
    // this effect; closing the stream in a cleanup would silently stop the live transcript (the original stall bug).
  }, [neg?.status, neg?.paused, waitingOnDraft, id, retry]);

  // Close the stream only when the component unmounts.
  useEffect(() => () => { esRef.current?.close(); }, []);

  function resume() {
    started.current = false;
    setErr(null);
    setRetry((r) => r + 1);
    load();
  }

  // Follow new messages only while the reader is already at the bottom; if they scrolled up to read, leave them there.
  useEffect(() => {
    const onScroll = () => {
      if (Date.now() - programmaticScrollAt.current < 700) return; // our own smooth scroll is still moving
      atBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 150;
      if (atBottom.current) setUnseen(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = () => {
    programmaticScrollAt.current = Date.now();
    atBottom.current = true;
    setUnseen(false);
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  useEffect(() => {
    if (!live && !waitingOnDraft) return;
    if (atBottom.current) scrollToBottom();
    else setUnseen(true);
  }, [neg?.turns.length, thinking, waitingOnDraft]);

  async function setPaused(paused: boolean) {
    setPausing(paused);
    const r = await fetch(`/api/negotiations/${id}/pause`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
    if (!r.ok) { setPausing(false); setErr((await r.json()).error ?? "Couldn't pause"); return; }
    await load();
    if (!paused) resume();
  }

  async function updateMax(buyerMax: number) {
    const r = await fetch(`/api/negotiations/${id}/limits`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buyerMax }) });
    if (!r.ok) { setErr((await r.json()).error ?? "Couldn't update your limit"); return; }
    setEditMax(false);
    load();
  }

  async function submitDraft(body: { action: "send"; message: string; price: number } | { action: "redo" }): Promise<string | null> {
    const r = await fetch(`/api/negotiations/${id}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return (await r.json()).error ?? "Couldn't send";
    await load();
    resume();
    return null;
  }

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

  const ended = !inPlay;
  const shownStatus = inPlay && neg.paused ? "paused" : inPlay && waitingOnDraft ? "your_move" : neg.status;

  return (
    <div className="grid gap-4 md:gap-6 md:grid-cols-5">
      {/* Transcript */}
      <div className="md:col-span-3 space-y-3 min-w-0">
        <div className="card p-4 sm:p-5 sticky top-14 z-10 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted">{neg.mode === "copilot" ? "Co-pilot · you approve each move" : "Negotiating"}</div>
              <div className="font-bold text-navy truncate">{neg.listing.title}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill status={shownStatus} live={live} />
              {inPlay && !waitingOnDraft && (
                neg.paused ? (
                  <button type="button" onClick={() => setPaused(false)} className="btn-primary !px-3 !py-1.5 text-xs">▶ Resume</button>
                ) : (
                  <button type="button" onClick={() => setPaused(true)} disabled={pausing} className="btn-ghost !px-3 !py-1.5 text-xs">{pausing ? "Pausing…" : "❚❚ Pause"}</button>
                )
              )}
            </div>
          </div>
          {inPlay && (
            <MaxEditor
              buyerMax={neg.buyerMax}
              open={editMax}
              onToggle={() => setEditMax((v) => !v)}
              onSave={updateMax}
              pending={live && !neg.paused}
            />
          )}
        </div>

        <div className="card p-3 sm:p-5 min-h-[420px] space-y-3">
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
          {inPlay && waitingOnDraft && draft && (
            <DraftCard key={neg.draftMove!} draft={draft} buyerMax={neg.buyerMax} buyerName={neg.buyerName} onSubmit={submitDraft} />
          )}
          {inPlay && neg.paused && (
            <div className="mx-auto max-w-md rounded-xl border border-line bg-mist px-4 py-2.5 text-xs text-muted text-center">
              Paused. Take your time — change your max above, then resume.
            </div>
          )}
          <div ref={bottom} />
        </div>
        {unseen && (
          <button type="button" onClick={scrollToBottom} className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 btn-primary !py-2 shadow-lg">
            New messages ↓
          </button>
        )}
      </div>

      {/* Side panel: on phones, the result goes first once the negotiation is over */}
      <div className={`md:col-span-2 space-y-4 ${ended ? "order-first md:order-none" : ""}`}>
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

type DraftMove = { message: string; action: string; price: number; days: number; deliverables: string[]; reason: string; approved?: boolean };

/** Compact max-budget control shown in the deal room header while the negotiation is live. */
function MaxEditor({ buyerMax, open, onToggle, onSave, pending }: { buyerMax: number; open: boolean; onToggle: () => void; onSave: (n: number) => void; pending: boolean }) {
  const [val, setVal] = useState(String(buyerMax));
  useEffect(() => { setVal(String(buyerMax)); }, [buyerMax, open]);
  const n = Number(val);
  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">Your max <span className="pill bg-amber/15 text-amber ml-1">private</span></span>
        <button type="button" onClick={onToggle} className="font-bold text-navy hover:text-blue">
          {money(buyerMax)} <span className="text-xs font-semibold text-blue ml-1">{open ? "Close" : "Change"}</span>
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[-10, 10, 25, 50].map((d) => (
              <button key={d} type="button" onClick={() => setVal(String(Math.max(1, (Number(val) || buyerMax) + d)))} className="pill bg-mist text-navy hover:bg-line !px-3 !py-1">
                {d > 0 ? `+£${d}` : `−£${-d}`}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">£</span>
              <input className="input pl-7 !py-2" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <button type="button" disabled={!(n > 0) || n === buyerMax} onClick={() => onSave(n)} className="btn-blue !py-2">Update</button>
          </div>
          <p className="text-[11px] text-muted">
            The seller&apos;s agent never sees this. Your agent uses the new limit from its next turn{pending ? " (the move in progress finishes first)" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}

/** Co-pilot: the buyer agent's drafted move, waiting for the human to edit, send or redo. */
function DraftCard({ draft, buyerMax, buyerName, onSubmit }: {
  draft: DraftMove; buyerMax: number; buyerName: string;
  onSubmit: (b: { action: "send"; message: string; price: number } | { action: "redo" }) => Promise<string | null>;
}) {
  const [message, setMessage] = useState(draft.message);
  const [price, setPrice] = useState(String(draft.price));
  const [busy, setBusy] = useState<"send" | "redo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const p = Number(price);
  const ending = draft.action === "walk" || draft.action === "escalate";
  const label = draft.action === "accept" ? (p === draft.price ? "Accept their offer" : "Counter instead") : draft.action === "walk" ? "Walk away" : draft.action === "escalate" ? "Stop and decide myself" : "Send counter-offer";

  async function go(action: "send" | "redo") {
    setBusy(action); setErr(null);
    const e = await onSubmit(action === "send" ? { action, message: message.trim(), price: p } : { action });
    if (e) { setErr(e); setBusy(null); }
  }

  return (
    <div className="rise ml-auto max-w-[92%] sm:max-w-[85%] rounded-2xl border-2 border-dashed border-blue/50 bg-blue/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-blue">{buyerName}&apos;s agent · draft for you</div>
        <span className="pill bg-white text-navy">{draft.action}</span>
      </div>
      <textarea className="input min-h-20 !bg-white" value={message} onChange={(e) => setMessage(e.target.value)} disabled={ending} />
      {draft.reason && <p className="text-xs italic text-muted border-l-2 border-blue/40 pl-2">Agent&apos;s note to you: {draft.reason}</p>}
      {!ending && (
        <div className="flex items-center gap-3">
          <div className="relative w-32">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">£</span>
            <input className="input pl-7 !py-2 !bg-white font-bold" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <span className={`text-xs ${p > buyerMax ? "text-red font-semibold" : "text-muted"}`}>
            {p > buyerMax ? `Over your max of ${money(buyerMax)} — raise it first` : `${draft.days}d · max ${money(buyerMax)}`}
          </span>
        </div>
      )}
      {err && <p className="text-red text-xs">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => go("send")} disabled={busy != null || !message.trim() || !(p > 0)} className="btn-blue !py-2 flex-1">
          {busy === "send" ? "Sending…" : label}
        </button>
        <button type="button" onClick={() => go("redo")} disabled={busy != null} className="btn-ghost !py-2">
          {busy === "redo" ? "Redrafting…" : "↻ Redo"}
        </button>
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
    paused: "bg-mist text-navy", your_move: "bg-blue text-white",
  };
  const label = status === "needs_human" ? "needs you" : status === "your_move" ? "your move" : status;
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
  const name = isBuyer ? buyerName : sellerName;
  return (
    <div className={`rise flex items-end gap-2 ${isBuyer ? "flex-row-reverse" : ""}`}>
      <div aria-hidden className={`hidden sm:grid shrink-0 w-7 h-7 rounded-full place-items-center text-[11px] font-bold ${isBuyer ? "bg-blue text-white" : "bg-line text-navy"}`}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </div>
      <div className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 ${isBuyer ? "bg-navy text-white rounded-br-md" : "bg-mist text-ink rounded-bl-md"}`}>
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
