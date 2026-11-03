# Haggle

**Your agent haggles. Their agent haggles back. You both approve. PayPal settles.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/).

A buyer describes what they want and sets a private max budget and deadline. A seller lists an item or service with a private floor price and earliest delivery. Two AI agents (Claude) negotiate price, timeline and deliverables on their behalf — **neither agent ever sees the other side's limits**. Every move is validated server-side against hard limits, so the model can't talk itself into a bad deal. When they agree, **both humans must approve** before a PayPal order is created and captured.

## Why it's interesting

- **Agent-to-agent commerce with guardrails.** Agents are persuasive but not trusted: a server-side guard rejects any move outside the principal's limits, logs it, and makes the agent retry. Two violations = forced walk.
- **Humans stay in the loop where it matters.** Agents reach the deal; humans approve it; PayPal takes the payment. No money moves on an AI's say-so.
- **Real checkout.** PayPal Orders API v2 (sandbox): order is created only after dual approval, captured on buyer approval in PayPal checkout.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind v4
- Claude (Anthropic SDK) with forced tool-use for structured negotiation moves
- PayPal Orders API v2 + PayPal JS SDK buttons (`@paypal/react-paypal-js`)
- Prisma 6 + SQLite (engine-less driver adapter, `better-sqlite3`)
- AG Grid for the deals dashboard
- SSE streaming so you watch the agents negotiate live

## Run it

```bash
git clone <repo> && cd haggle
npm install
cp .env.example .env     # fill in keys (see below)
npm run db:push          # creates prisma/dev.db
npm run db:seed          # 3 demo listings
npm run dev              # http://localhost:3000
```

### Keys

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ANTHROPIC_MODEL` | any Claude model id (default `claude-sonnet-5-5`) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | developer.paypal.com → Apps & Credentials → **Sandbox** → Create app |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | same client ID (used by the PayPal buttons) |
| `PAYPAL_API_BASE` | leave as `https://api-m.sandbox.paypal.com` |

To test checkout you also need a **sandbox personal account** (developer.paypal.com → Sandbox → Accounts). Log in with that at the PayPal popup.

## Demo flow

1. **Listings** → pick "Logo design for a small business" (asking £140; seller's hidden floor is £80, 3-day minimum).
2. **Brief your agent** → max £100, within 7 days, must-haves "SVG files". Send it in.
3. **Deal room** → watch the two agents negotiate live. Red "Guard" rows show moves the server rejected.
4. **Deal reached** → approve as buyer, approve as seller.
5. **PayPal checkout** unlocks → pay with the sandbox personal account → status flips to **paid** with the order ID.
6. **Dashboard** → every negotiation: asking vs budget vs agreed, rounds, guard blocks, PayPal order.

## How the negotiation works

```
lib/negotiate.ts
  buyerSystem()  → prompt with ONLY the buyer's private limits + public listing
  sellerSystem() → prompt with ONLY the seller's private limits + public listing
  askAgent()     → forced tool call `submit_move` → {message, action, price, days, deliverables}
  guard()        → rejects moves outside limits; "accept" is snapped to the opponent's last offer, then validated
  runNegotiation() → alternates buyer/seller for ≤ MAX_ROUNDS, persists every turn, yields SSE events
```

Payment gate (`app/api/paypal/create-order`): refuses to create a PayPal order unless `status === "agreed" && buyerApproved && sellerApproved`.

## Project layout

```
app/                 pages + API routes
  deal/[id]          live negotiation room, approvals, PayPal buttons
  dashboard          AG Grid of all deals
  api/negotiations   create / read / stream / approve
  api/paypal         create-order / capture-order
components/          DealRoom, PayPalCheckout, DealsGrid, BriefForm
lib/negotiate.ts     the agents + guard
lib/paypal.ts        Orders API v2 client
prisma/              schema + seed
```

## Deploy (Render)

Web service → build `npm install && npm run build` → start `npm start`. Add the env vars above. SQLite lives on the instance disk (fine for a demo; add a Render disk for persistence).

## License

MIT
