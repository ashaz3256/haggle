import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { db } from "@/lib/db";
import BriefForm from "@/components/BriefForm";
import ListingPhoto from "@/components/ListingPhoto";
import SellerPanel from "@/components/SellerPanel";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string; posted?: string }>;
}) {
  const { id } = await params;
  const { as, posted } = await searchParams;
  const l = await db.listing.findUnique({ where: { id } });
  if (!l) notFound();
  // No accounts: the browser that posted the listing holds its owner token in a cookie.
  const token = (await cookies()).get(`haggle_own_${l.id}`)?.value;
  const isOwner = l.ownerToken != null && token === l.ownerToken;
  const showSeller = isOwner && as !== "buyer";

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
        {showSeller ? (
          <SellerPanel listing={l} posted={posted === "1"} />
        ) : (
          <div className="space-y-3">
            {isOwner && (
              <div className="rounded-xl bg-blue/10 text-navy px-4 py-2.5 text-xs flex items-center justify-between gap-3">
                <span>Testing your own listing as a buyer.</span>
                <Link href={`/listing/${l.id}`} className="font-semibold text-blue shrink-0">Back to seller view</Link>
              </div>
            )}
            <BriefForm listingId={l.id} askingPrice={l.askingPrice} />
          </div>
        )}
      </div>
    </div>
  );
}
