import { db } from "../lib/db";

async function main() {
  await db.listing.createMany({
    data: [
      {
        sellerName: "Maya",
        title: "Logo design for a small business",
        category: "freelance",
        description: "A clean, modern logo. Includes initial concepts, one round of revisions and final files in PNG and SVG.",
        askingPrice: 140,
        floorPrice: 80,
        earliestDays: 3,
        sellerNotes: "Happy to include a second revision round if the price stays above £110. Can't do anything faster than 3 days.",
      },
      {
        sellerName: "Tom",
        title: "Used road bike — Giant Contend, 2021",
        category: "item",
        description: "Medium frame, recently serviced, new tyres. Collection from Leeds or can deliver locally.",
        askingPrice: 320,
        floorPrice: 240,
        earliestDays: 1,
        sellerNotes: "Would throw in a helmet and lights to close near asking.",
      },
      {
        sellerName: "Priya",
        title: "Landing page build (Next.js + Tailwind)",
        category: "service",
        description: "One-page responsive landing page with a contact form, deployed to Vercel. Copy and images supplied by you.",
        askingPrice: 450,
        floorPrice: 300,
        earliestDays: 5,
        sellerNotes: "Can add basic SEO setup as a sweetener. 5 days minimum — 4 only if price is £400+.",
      },
    ],
  });
  console.log("Seeded 3 listings");
}

main().finally(() => db.$disconnect());
