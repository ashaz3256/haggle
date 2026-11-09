import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import BriefForm from "@/components/BriefForm";
import ListingPhoto from "@/components/ListingPhoto";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await db.listing.findUnique({ where: { id } });
  if (!l) notFound();

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3 card overflow-hidden self-start">
        <ListingPhoto id={l.id} hasImage={l.imageData != null} category={l.category} title={l.title} className="aspect-[16/10]" />
        <div className="p-6">
        <span className="pill bg-mist text-muted">{l.category}</span>
        <h1 className="mt-2 text-2xl font-extrabold text-navy">{l.title}</h1>
        <p className="mt-1 text-sm text-muted">Listed by {l.sellerName}</p>
        <p className="mt-4 whitespace-pre-wrap">{l.description}</p>
        <div className="mt-6 rounded-xl bg-mist p-4 flex items-center justify-between">
          <span className="text-sm text-muted">Asking price</span>
          <span className="text-3xl font-extrabold text-navy">£{l.askingPrice}</span>
        </div>
        </div>
      </div>
      <div className="md:col-span-2">
        <BriefForm listingId={l.id} askingPrice={l.askingPrice} />
      </div>
    </div>
  );
}
