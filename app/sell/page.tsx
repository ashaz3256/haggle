"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shrink a photo in the browser so it can live in the database: longest side 900px, JPEG. */
function resizeImage(file: File, maxSide = 900, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image")); };
    img.src = url;
  });
}

export default function SellPage() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  // Number fields stay strings while typing so clearing a field doesn't snap it to 0.
  const [f, setF] = useState({
    sellerName: "",
    title: "",
    category: "service",
    description: "",
    askingPrice: "140",
    floorPrice: "80",
    earliestDays: "3",
    sellerNotes: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const digits = (k: "askingPrice" | "floorPrice" | "earliestDays") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") });

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setImage(await resizeImage(file)); setErr(null); }
    catch (x) { setErr(x instanceof Error ? x.message : "Couldn't read that image"); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const askingPrice = Number(f.askingPrice), floorPrice = Number(f.floorPrice), earliestDays = Math.round(Number(f.earliestDays));
    if (!(askingPrice > 0) || !(floorPrice > 0) || !(earliestDays > 0)) return setErr("Prices and days must be more than 0.");
    setBusy(true); setErr(null);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, askingPrice, floorPrice, earliestDays, imageData: image ?? undefined }),
    });
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
        <div>
          <label className="label">Photo</label>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-line hover:border-blue/50 transition overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Listing photo preview" className="w-full aspect-[16/10] object-cover" />
            ) : (
              <div className="aspect-[16/10] grid place-items-center text-center text-sm text-muted p-6">
                <div>
                  <div className="text-3xl mb-1">📷</div>
                  <div className="font-semibold text-navy">Add a photo</div>
                  <div className="text-xs">Tap to take one or choose from your library</div>
                </div>
              </div>
            )}
            <input type="file" accept="image/*" className="sr-only" onChange={pickPhoto} />
          </label>
          {image && <button type="button" onClick={() => setImage(null)} className="mt-2 text-xs font-semibold text-muted hover:text-red">Remove photo</button>}
        </div>
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
        <div><label className="label">Asking price (£)</label><input className="input" inputMode="decimal" required value={f.askingPrice} onChange={digits("askingPrice")} /></div>
      </section>

      <section className="card p-6 space-y-4 border-amber/40 bg-amber/5">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-navy">Private — only your agent sees this</h2>
          <span className="pill bg-amber/15 text-amber">locked</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">Floor price (£) — never goes below</label><input className="input" inputMode="decimal" required value={f.floorPrice} onChange={digits("floorPrice")} /></div>
          <div><label className="label">Earliest delivery (days)</label><input className="input" inputMode="numeric" required value={f.earliestDays} onChange={digits("earliestDays")} /></div>
        </div>
        <div><label className="label">Notes for your agent</label><textarea className="input" value={f.sellerNotes} onChange={set("sellerNotes")} placeholder="e.g. Happy to add a second revision if price stays above £110. Won't do rush jobs under 2 days." /></div>
      </section>

      {err && <p className="text-red text-sm">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Posting…" : "Post listing"}</button>
    </form>
  );
}
