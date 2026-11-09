import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haggle — your agent negotiates, you approve, PayPal settles",
  description: "AI agents bargain on behalf of buyer and seller inside hard limits. Humans approve the deal. PayPal handles the money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-line">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-extrabold text-navy tracking-tight text-lg">
              <span className="inline-block w-7 h-7 rounded-lg bg-gradient-to-br from-navy to-blue" />
              Haggle
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium whitespace-nowrap">
              <Link href="/how-it-works" className="hidden sm:inline-flex px-3 py-1.5 rounded-full hover:bg-mist">How it works</Link>
              <Link href="/" className="px-3 py-1.5 rounded-full hover:bg-mist">Listings</Link>
              <Link href="/dashboard" className="hidden sm:inline-flex px-3 py-1.5 rounded-full hover:bg-mist">Dashboard</Link>
              <Link href="/sell" className="btn-blue !py-1.5 !px-4 ml-1"><span className="sm:hidden">Sell</span><span className="hidden sm:inline">Post a listing</span></Link>
              <details className="sm:hidden relative group">
                <summary aria-label="More pages" className="list-none cursor-pointer w-9 h-9 ml-1 grid place-items-center rounded-full hover:bg-mist [&::-webkit-details-marker]:hidden">
                  <span className="block w-4 space-y-1"><span className="block h-0.5 bg-navy rounded" /><span className="block h-0.5 bg-navy rounded" /><span className="block h-0.5 bg-navy rounded" /></span>
                </summary>
                <div className="absolute right-0 mt-2 w-44 card p-1.5 flex flex-col">
                  <Link href="/how-it-works" className="px-3 py-2 rounded-xl hover:bg-mist">How it works</Link>
                  <Link href="/dashboard" className="px-3 py-2 rounded-xl hover:bg-mist">Dashboard</Link>
                </div>
              </details>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-10 text-xs text-muted">
          Built for the PayPal AI Hackathon · runs on the PayPal sandbox · agents never see each other&apos;s limits.
        </footer>
      </body>
    </html>
  );
}
