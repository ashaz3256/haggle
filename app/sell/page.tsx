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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo format isn't supported here. Try a JPEG or PNG, or take a screenshot of it.")); };
    img.src = url;
  });
}

const CATEGORIES = [
  { v: "item", label: "Item", hint: "Something physical" },
  { v: "service", label: "Service", hint: "Work you do" },
  { v: "freelance", label: "Freelance", hint: "Digital project" },
] as const;

const COPY: Record<string, { title: string; desc: string; days: string; notes: string }> = {
  item: {
    title: "e.g. Garmin Venu 3 watch, barely used",
    desc: "Condition, what's in the box, any marks or faults, collection or postage.",
    days: "Ready to hand over in (days)",
    notes: "e.g. Will throw in the charger and strap if they pay over £180. Collection only, Leeds.",
  },
  service: {
    title: "e.g. Garden tidy-up, half day",
    desc: "What's included, how long it takes, where you cover.",
    days: "Earliest you can do it (days from now)",
    notes: "e.g. Can do this weekend for £20 more. Won't go below £60 for weekday jobs.",
  },
  freelance: {
    title: "e.g. Logo design for a small business",
    desc: "What you deliver, file formats, number of revisions.",
    days: "Earliest you can deliver (days)",
    notes: "e.g. Happy to add a second revision if price stays above £110. No rush jobs under 2 days.",
  },
};

export default function SellPage() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // Number fields stay strings while typing; no pre-filled prices so nothing gets posted at a default by accident.
  const [f, setF] = useState({
    sellerName: "",
    title: "",
    category: "item",
    description: "",
    askingPrice: "",
    floorPrice: "",
    earliestDays: "",
    sellerNotes: "",
  });
  const copy = COPY[f.category] ?? COPY.item;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const digits = (k: "askingPrice" | "floorPrice" | "earliestDays") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value.replace(/[^\d.]/g, "") });

  const asking = Number(f.askingPrice), floor = Number(f.floorPrice);
  const floorTooHigh = asking > 0 && floor > asking;
  const room = asking > 0 && floor > 0 && !floorTooHigh ? Math.round(((asking - floor) / asking) * 100) : null;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same photo again after removing it
    if (!file) return;
    setReading(true); setPhotoErr(null);
    try { setImage(await resizeImage(file)); }
    catch (x) { setPhotoErr(x instanceof Error ? x.message : "Couldn't read that photo"); }
    finally { setReading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const earliestDays = Math.round(Number(f.earliestDays));
    if (!(asking > 0)) return setErr("Add an asking price.");
    if (!(floor > 0)) return setErr("Add the lowest price you'd accept.");
    if (floorTooHigh) return setErr("Your lowest price can't be higher than your asking price.");
    if (!(earliestDays > 0)) return setErr("Add how many days until it's ready (1 or more).");
    setBusy(true); setErr(null);
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, askingPrice: asking, floorPrice: floor, earliestDays, imageData: image ?? undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(typeof json.error === "string" ? json.error : "Something's missing. Check the title and description.");
    r.push(`/listing/${json.id}?posted=1`);
  }

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-navy">Post a listing</h1>
        <p className="text-muted text-sm mt-1">Three quick steps. Buyers see step 1 and your asking price. Everything marked <span className="pill bg-amber/15 text-amber">private</span> is only for your agent.</p>
      </div>

      {/* Step 1 */}
      <section className="card p-5 sm:p-6 space-y-4">
        <StepTitle n={1} title="What are you selling?" />

        <div>
          <div className="relative rounded-xl border-2 border-dashed border-line hover:border-blue/50 transition overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Your listing photo" className="w-full aspect-[16/10] object-cover" />
            ) : (
              <div className="aspect-[16/10] grid place-items-center text-center p-6">
                <div>
                  <div className="mx-auto w-12 h-12 rounded-full bg-blue/10 grid place-items-center text-2xl mb-2">📷</div>
                  <div className="font-semibold text-navy">{reading ? "Loading photo…" : "Add a photo"}</div>
                  <div className="text-xs text-muted mt-0.5">Tap to take one or pick from your library</div>
                </div>
              </div>
            )}
            {/* The real file input covers the whole box so a tap lands on it directly (iOS Safari ignores taps forwarded from hidden inputs). */}
            <input
              type="file"
              accept="image/*"
              aria-label={image ? "Change photo" : "Add a photo"}
              onChange={pickPhoto}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted">{image ? "Tap the photo to change it." : "Optional, but listings with a photo get taken more seriously."}</span>
            {image && <button type="button" onClick={() => setImage(null)} className="font-semibold text-muted hover:text-red">Remove</button>}
          </div>
          {photoErr && <p className="mt-1 text-xs text-red">{photoErr}</p>}
        </div>

        <div>
          <label className="label">Type</label>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-mist p-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setF({ ...f, category: c.v })}
                className={`rounded-lg px-2 py-2 text-center transition ${f.category === c.v ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/60"}`}
              >
                <div className={`text-sm font-semibold ${f.category === c.v ? "text-navy" : "text-muted"}`}>{c.label}</div>
                <div className="text-[11px] text-muted hidden sm:block">{c.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div><label className="label">Title</label><input className="input" required minLength={2} value={f.title} onChange={set("title")} placeholder={copy.title} /></div>
        <div><label className="label">Description</label><textarea className="input min-h-24" required minLength={5} value={f.description} onChange={set("description")} placeholder={copy.desc} /></div>
        <div><label className="label">Your name (shown to buyers)</label><input className="input" required value={f.sellerName} onChange={set("sellerName")} placeholder="e.g. Maya" /></div>
      </section>

      {/* Step 2 */}
      <section className="card p-5 sm:p-6 space-y-4">
        <StepTitle n={2} title="Set your prices" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Asking price <span className="normal-case font-normal tracking-normal">· buyers see this</span></label>
            <Money value={f.askingPrice} onChange={digits("askingPrice")} placeholder="180" />
          </div>
          <div>
            <label className="label">Lowest you&apos;d accept <span className="pill bg-amber/15 text-amber normal-case tracking-normal ml-1">private</span></label>
            <Money value={f.floorPrice} onChange={digits("floorPrice")} placeholder="140" invalid={floorTooHigh} />
          </div>
        </div>
        <p className={`text-xs rounded-lg px-3 py-2 ${floorTooHigh ? "bg-red/5 text-red" : "bg-mist text-muted"}`}>
          {floorTooHigh
            ? "Your lowest price is above your asking price. Lower it, or raise the asking price."
            : room != null
              ? `Your agent starts at £${asking} and can come down to £${floor} (up to ${room}% off). It will never go below £${floor}, and buyers never see that number.`
              : "Your agent starts at the asking price and haggles down, but never below your lowest price. Buyers never see your lowest price."}
        </p>
      </section>

      {/* Step 3 */}
      <section className="card p-5 sm:p-6 space-y-4 border-amber/40 bg-amber/5">
        <div className="flex items-center gap-2">
          <StepTitle n={3} title="Brief your agent" />
          <span className="pill bg-amber/15 text-amber">private</span>
        </div>
        <div className="sm:w-1/2">
          <label className="label">{copy.days}</label>
          <input className="input" inputMode="numeric" required value={f.earliestDays} onChange={digits("earliestDays")} placeholder="2" />
        </div>
        <div>
          <label className="label">Anything else your agent should know <span className="normal-case font-normal tracking-normal">· optional</span></label>
          <textarea className="input" value={f.sellerNotes} onChange={set("sellerNotes")} placeholder={copy.notes} />
        </div>
      </section>

      {/* Preview */}
      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Buyers will see</div>
        <div className="card overflow-hidden flex">
          <div className="w-28 sm:w-36 shrink-0 bg-mist">
            {image
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={image} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full min-h-24 grid place-items-center text-3xl opacity-60">{f.category === "item" ? "📦" : f.category === "service" ? "🛠️" : "✏️"}</div>}
          </div>
          <div className="p-4 min-w-0 flex-1">
            <span className="pill bg-mist text-muted">{f.category}</span>
            <div className="mt-1.5 font-bold text-navy truncate">{f.title || "Your title"}</div>
            <div className="text-sm text-muted line-clamp-2">{f.description || "Your description"}</div>
            <div className="mt-1 text-lg font-extrabold text-navy">{asking > 0 ? `£${asking}` : "£—"}</div>
          </div>
        </div>
      </section>

      {err && <p className="text-red text-sm">{err}</p>}
      <button className="btn-primary w-full" disabled={busy || reading}>{busy ? "Posting…" : "Post listing"}</button>
    </form>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="font-bold text-navy flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-navy text-white text-xs grid place-items-center">{n}</span>
      {title}
    </h2>
  );
}

function Money({ value, onChange, placeholder, invalid }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; invalid?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">£</span>
      <input className={`input !pl-8 ${invalid ? "!border-red" : ""}`} inputMode="decimal" required value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
