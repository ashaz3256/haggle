"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SellPage() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    sellerName: "",
    title: "",
    category: "service",
    description: "",
    askingPrice: 140,
    floorPrice: 80,
    earliestDays: 3,
    sellerNotes: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const res = await fetch("/api/listings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(typeof json.error === "string" ? json.error : "Check the form");
    r.push(`/listing/${json.id}`);
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">Post a listing</h1>
        <p className="text-muted text-sm mt-1">The public part is what buyers see. The private part is what your agent negotiates with — buyers never see it.</p>
      </div>

      <section className="card p-6 space-y-4">
        <h2 className="font-bold text-navy">Public listing</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">Your name</label><input className="input" required value={f.sellerName} onChange={set("sellerName")} placeholder="Maya" /></div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={f.category} onChange={set("category")}>
              <option value="service">Service</option><option value="item">Item</option><option value="freelance">Freelance work</option>
            </select>
          </div>
        </div>
        <div><label className="label">Title</label><input className="input" required value={f.title} onChange={set("title")} placeholder="Logo design for a small business" /></div>
        <div><label className="label">Description</label><textarea className="input min-h-24" required value={f.description} onChange={set("description")} placeholder="What's included, what it looks like, anything relevant." /></div>
        <div><label className="label">Asking price (£)</label><input className="input" type="number" min={1} required value={f.askingPrice} onChange={set("askingPrice")} /></div>
      </section>

      <section className="card p-6 space-y-4 border-amber/40 bg-amber/5">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-navy">Private — only your agent sees this</h2>
          <span className="pill bg-amber/15 text-amber">locked</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">Floor price (£) — never goes below</label><input className="input" type="number" min={1} required value={f.floorPrice} onChange={set("floorPrice")} /></div>
          <div><label className="label">Earliest delivery (days)</label><input className="input" type="number" min={1} required value={f.earliestDays} onChange={set("earliestDays")} /></div>
        </div>
        <div><label className="label">Notes for your agent</label><textarea className="input" value={f.sellerNotes} onChange={set("sellerNotes")} placeholder="e.g. Happy to add a second revision if price stays above £110. Won't do rush jobs under 2 days." /></div>
      </section>

      {err && <p className="text-red text-sm">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Posting…" : "Post listing"}</button>
    </form>
  );
}
