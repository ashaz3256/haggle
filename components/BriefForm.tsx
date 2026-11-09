"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BriefForm({ listingId, askingPrice }: { listingId: string; askingPrice: number }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Number fields are kept as strings while typing so clearing a field doesn't snap it to 0.
  const [f, setF] = useState({
    buyerName: "",
    buyerMax: String(Math.round(askingPrice * 0.75)),
    buyerDeadlineDays: "7",
    buyerMustHaves: "",
    buyerStyle: "friendly",
    mode: "auto" as "auto" | "copilot",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const digits = (k: "buyerMax" | "buyerDeadlineDays") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") });

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const buyerMax = Number(f.buyerMax);
    const buyerDeadlineDays = Math.round(Number(f.buyerDeadlineDays));
    if (!(buyerMax > 0)) return setErr("Max budget must be more than £0.");
    if (!(buyerDeadlineDays > 0)) return setErr("Deadline must be at least 1 day.");
    setBusy(true); setErr(null);
    const res = await fetch("/api/negotiations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, ...f, buyerMax, buyerDeadlineDays }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) r.push(`/deal/${json.id}`);
    else setErr(typeof json.error === "string" ? json.error : "Check the form.");
  }

  return (
    <form onSubmit={go} className="card p-6 space-y-4 md:sticky md:top-20">
      <div>
        <h2 className="font-bold text-navy">Brief your agent</h2>
        <p className="text-xs text-muted mt-1">The seller&apos;s agent never sees these numbers.</p>
      </div>
      <div><label className="label">Your name</label><input className="input" required value={f.buyerName} onChange={set("buyerName")} placeholder="Arij" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Max budget</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">£</span>
            <input className="input pl-7" inputMode="decimal" required value={f.buyerMax} onChange={digits("buyerMax")} />
          </div>
        </div>
        <div>
          <label className="label">Within (days)</label>
          <input className="input" inputMode="numeric" required value={f.buyerDeadlineDays} onChange={digits("buyerDeadlineDays")} />
        </div>
      </div>
      <div><label className="label">Must-haves</label><textarea className="input" value={f.buyerMustHaves} onChange={set("buyerMustHaves")} placeholder="e.g. source files, 2 revisions" /></div>
      <div>
        <label className="label">Negotiating style</label>
        <select className="input" value={f.buyerStyle} onChange={set("buyerStyle")}>
          <option value="friendly">Friendly</option><option value="firm">Firm</option><option value="aggressive">Aggressive</option>
        </select>
      </div>
      <div>
        <label className="label">Mode</label>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
          {([
            ["auto", "Full auto", "Agent runs to the end"],
            ["copilot", "Co-pilot", "You approve each move"],
          ] as const).map(([v, title, sub]) => (
            <button
              key={v}
              type="button"
              onClick={() => setF({ ...f, mode: v })}
              className={`rounded-lg px-3 py-2 text-left transition ${f.mode === v ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}
            >
              <div className={`text-sm font-semibold ${f.mode === v ? "text-navy" : "text-muted"}`}>{title}</div>
              <div className="text-[11px] text-muted">{sub}</div>
            </button>
          ))}
        </div>
      </div>
      {err && <p className="text-red text-sm">{err}</p>}
      <button className="btn-blue w-full" disabled={busy}>{busy ? "Starting…" : "Send my agent in →"}</button>
    </form>
  );
}
