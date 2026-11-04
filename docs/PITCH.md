# Haggle: pitch

## Problem

- Haggling is slow, awkward and inconsistent.
- Letting an AI agent spend your money unsupervised is unsafe.
- Agents talk persuasively. Persuasive is not the same as trustworthy.

## Solution

Haggle lets your agent negotiate with the seller's agent inside limits you set. You approve the result. PayPal takes the payment.

1. Buyer sets a private max budget, deadline and must-haves.
2. Seller lists with a private floor price and earliest delivery.
3. Two agents negotiate price, timeline and deliverables. Neither sees the other's limits.
4. A server-side guard checks every move against hard limits.
5. Both humans approve. Only then is a PayPal order created.

## Why this combination is interesting

- **Agent vs agent.** Both sides are automated, each with private information. That is real negotiation, not a chatbot answering questions.
- **Server-side guard.** `guard()` in `lib/negotiate.ts` is the trust boundary. A move over the buyer's max or under the seller's floor is rejected, logged and retried once. A second violation forces a walk. The prompt asks the model to behave. The code makes sure it does.
- **Human approval on both sides.** Agents reach a deal. Humans own it. `/api/paypal/create-order` refuses unless the deal is `agreed` and both `buyerApproved` and `sellerApproved` are true.
- **PayPal checkout.** Orders API v2 gives a real, familiar payment step. The agents never touch money.

## Architecture in 5 lines

1. Next.js 15 App Router (React 19, TypeScript, Tailwind) for UI and API routes.
2. Prisma + SQLite store listings, negotiations and every turn.
3. An SSE route (`/api/negotiations/[id]/stream`) streams moves to the browser live.
4. Each agent is forced to return a structured move through a `submit_move` tool call, then validated by zod and `guard()`. LLM is any OpenAI-compatible endpoint (currently Nebius, Qwen3-235B with two fallbacks) or Anthropic.
5. PayPal Orders v2 (sandbox): `create-order` after dual approval, `capture-order` after buyer approves in the PayPal popup.

## What is real, mocked, untested

Real:

- Two LLM agents negotiating live. A full run takes about 10 to 20 seconds.
- Server-side guard, retry and forced walk.
- Persistence of every turn. A reload or dropped connection mid-run is handled: the server finishes the run and the page re-attaches or resumes from saved turns. A Resume button appears if the connection drops.
- Dual approval gate on the server.
- PayPal sandbox create-order returns a real sandbox order id (verified).

Mocked or simplified:

- No user accounts or login. The "buyer" and "seller" approve from the same deal page. Anyone with the deal URL can click either button.
- PayPal is sandbox only. No real money.
- Seller side is a seeded listing (3 listings) or the `/sell` form. The seller's limits are entered once, not negotiated live with the seller.
- SQLite on local disk.

Untested or unverified:

- **Completing a payment in the PayPal popup (capture).** It needs a sandbox personal account to log in and pay. The capture route exists but has not been exercised end to end on this machine.
- There are no automated tests. The only check is `npx tsc --noEmit`.
- The guard-block path depends on the model stepping out of bounds. It has not been forced in a scripted test, so it may not trigger in a demo run.
- Production deployment (Render) is documented but not verified here.
- Known cosmetic: a React hydration warning in dev, caused by a browser extension.

## Demo moments (for judges)

If judging criteria are provided, map them here. Until then:

| Idea | Demo moment (see `DEMO.md`) |
|---|---|
| Agent autonomy | 0:40, bubbles stream live |
| Safety / trust | 1:05, guard blocks counter; 1:45, dual approval |
| Payments | 2:10, PayPal button and create-order |
| Usability | 0:25, one short brief form |
| Transparency | 2:40, dashboard of rounds, blocks and orders |
