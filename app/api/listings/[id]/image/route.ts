import { db } from "@/lib/db";

/** Serves a listing's photo (stored as a data URL) as a real image, so pages don't inline the bytes. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await db.listing.findUnique({ where: { id }, select: { imageData: true } });
  const m = l?.imageData?.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) return new Response("No image", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
