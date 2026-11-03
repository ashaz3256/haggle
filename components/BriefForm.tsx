"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BriefForm({ listingId, askingPrice }: { listingId: string; askingPrice: number }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    buyerName: "",
    buyerMax: Math.round(askingPrice * 0.75),
    buyerDeadlineDays: 7,
    buyerMustHaves: "",
    buyerStyle: "friendly",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/negotiations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, ...f }) });
    const json = await res.json();
    setBusy(false);
    if (res.ok) r.push(`/deal/${json.id}`);
  }

  return (
    <form onSubmit={go} className="card p-6 space-y-4 sticky top-20">
      <div>
        <h2 className="font-bold text-navy">Brief your agent</h2>
        <p className="text-xs text-muted mt-1">The seller&apos;s agent never sees these numbers.</p>
      </div>
      <div><label className="label">Your name</label><input className="input" required value={f.buyerName} onChange={set("buyerName")} placeholder="Arij" /></div>
      <div><label className="label">Max budget (£)</label><input className="input" type="number" min={1} required value={f.buyerMax} onChange={set("buyerMax")} /></div>
      <div><label className="label">Need it within (days)</label><input className="input" type="number" min={1} required value={f.buyerDeadlineDays} onChange={set("buyerDeadlineDays")} /></div>
      <div><label className="label">Must-haves</label><textarea className="input" value={f.buyerMustHaves} onChange={set("buyerMustHaves")} placeholder="e.g. source files, 2 revisions" /></div>
      <div>
        <label className="label">Negotiating style</label>
        <select className="input" value={f.buyerStyle} onChange={set("buyerStyle")}>
          <option value="friendly">Friendly</option><option value="firm">Firm</option><option value="aggressive">Aggressive</option>
        </select>
      </div>
      <button className="btn-blue w-full" disabled={busy}>{busy ? "Starting…" : "Send my agent in →"}</button>
    </form>
  );
}
