# Haggle — PayPal AI Hackathon

Agent-to-agent price negotiation (buyer agent vs seller agent) with a server-side guard,
human approval on both sides, then PayPal Orders v2 sandbox checkout.

## Layout
- App root is the repo root. Run every npm/npx command from there.
- Next.js 15 App Router, React 19, TypeScript strict, Tailwind 4.1.x (pinned; 4.3 breaks `next dev`, don't bump).
- Prisma 6 on better-sqlite3. This machine has no C++ toolchain: better-sqlite3 must stay on 11.x (prebuilt binaries).
- No tests, no ESLint/Prettier config. `npm run lint` prompts to create a config; don't run it.

## Commands (from the repo root)
- `npm run dev` — dev server on http://localhost:3000. Check if it's already running before starting another.
- `npm run db:push`, `npm run db:seed` — SQLite schema + seed listings.
- `npx tsc --noEmit` — typecheck. This is the only automated check; run it after every code change.

## Key files
- `lib/negotiate.ts` — buyer/seller system prompts, forced `submit_move` tool, `guard()` (the trust boundary for model output), `runNegotiation`.
- `lib/paypal.ts` — `createOrder`, `captureOrder`, `getOrder`.
- `lib/db.ts` — Prisma client. Schema/seed in `prisma/`.
- `app/api/negotiations/[id]/stream/route.ts` — SSE stream of moves. Other routes: `app/api/listings`, `app/api/negotiations`, `app/api/negotiations/[id]/approve`, `app/api/paypal/{create-order,capture-order}`, `app/api/dashboard`.
- UI: `app/page.tsx` (listings), `app/listing/[id]`, `app/deal/[id]`, `app/sell`, `app/dashboard`. Components: `components/DealRoom.tsx`, `PayPalCheckout.tsx`, `DealsGrid.tsx`, `BriefForm.tsx`.

## LLM setup
- Agents call an OpenAI-compatible endpoint (Gemini) via `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` / `LLM_FALLBACK_MODELS` in `.env` (gitignored). Anthropic direct is also supported via `ANTHROPIC_API_KEY`.
- Do not suggest `gemini-2.5-*` models: this key gets 404 for them (as of 2026-11-03). If a model returns 503 "high demand", swap to another in `LLM_FALLBACK_MODELS`.

## PayPal
- Sandbox `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `NEXT_PUBLIC_PAYPAL_CLIENT_ID` live in `.env`. Checkout cannot be tested without them plus a sandbox personal account to pay with.

## Git
- Commits are authored by the user only. Never add `Co-Authored-By` or session trailers.
- GitHub remote is `ashaz3256/haggle`, branch `main`.

## Hackathon mode
- Working beats perfect. Ship the minimal version that demos; list nice-to-haves in your report instead of building them.
- No refactors, renames, style sweeps, or new dependencies unless asked.
- Every code change ends with `npx tsc --noEmit` passing and, if the dev server is running, a clean recompile. Report the command output, not a claim.
- Never put secrets from `.env` into files, logs, or commits.
