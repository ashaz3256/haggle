/** A listing's photo, or a category-coloured tile when the seller didn't add one. */
const TILES: Record<string, { bg: string; icon: string }> = {
  item: { bg: "from-sky/40 to-blue/30", icon: "📦" },
  service: { bg: "from-navy/25 to-sky/35", icon: "🛠️" },
  freelance: { bg: "from-amber/25 to-sky/30", icon: "✏️" },
};

export default function ListingPhoto({ id, hasImage, category, title, className = "" }: { id: string; hasImage: boolean; category: string; title: string; className?: string }) {
  if (hasImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/listings/${id}/image`} alt={title} loading="lazy" className={`w-full object-cover bg-mist ${className}`} />;
  }
  const t = TILES[category] ?? TILES.service;
  return (
    <div className={`w-full bg-gradient-to-br ${t.bg} grid place-items-center ${className}`} aria-hidden>
      <span className="text-4xl opacity-70">{t.icon}</span>
    </div>
  );
}
