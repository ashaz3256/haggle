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
- **Agents that know when to stop.** Most agent-vs-agent demos loop until someone caves. Haggle's agents can walk away with a written reason, or escalate to their human when the other side's best offer is within 15% of the brief. The server also detects a stalled price gap and ends it. Every negotiation finishes in one of three labelled outcomes: deal, needs a human, or no deal. The agent is never allowed to stretch its principal's limit; only the human can.
- **Humans can step in at any time.** Pause between moves. Raise or lower your max mid-negotiation; it's logged privately and the guard enforces it from the next turn. Or switch to **co-pilot**: the agent drafts each move and you edit, send or redo it. Your edits pass the same guard as the model's. Autonomy is a dial, not a switch. These came straight from user testing.
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

- Two LLM agents negotiating live. A full run takes about 20 to 40 seconds (moves are spaced at least 1.8 s apart so people can read them).
- Server-side guard, retry and forced walk.
- Co-pilot mode, pause/resume, and live limit changes, verified 2026-11-09 via the API locally and on Railway, UI checked on a phone.
- Listing photos (resized in the browser, stored in SQLite).
- Three endings, each verified on the public instance: agreed (£260 brief), escalated to a human with the agent's note (£224 brief), walked by the stall detector with a reason (£160 brief). The human override path (stretch my limit) is verified too.
- Persistence of every turn. A reload or dropped connection mid-run is handled: the server finishes the run and the page re-attaches or resumes from saved turns. A Resume button appears if the connection drops.
- Dual approval gate on the server.
- PayPal sandbox create-order returns a real sandbox order id (verified).

Mocked or simplified:

- No user accounts or login. The "buyer" and "seller" approve from the same deal page. Anyone with the deal URL can click either button.
- PayPal is sandbox only. No real money.
- Seller side is a seeded listing (3 listings) or the `/sell` form. The seller's limits are entered once, not negotiated live with the seller.
- SQLite on a Railway volume. Single server process; the per-IP rate limit is in memory.

Untested or unverified:

- (Resolved 2026-11-11) PayPal popup payment and capture: verified end to end on Railway, status **paid**, sandbox order `28A89478YE489833B`.
- There are no automated tests. The only check is `npx tsc --noEmit`.
- The guard-block path depends on the model stepping out of bounds. It shows up often on low-budget briefs but is not guaranteed on a given run.
- Deployed and verified on Railway: https://haggle-production-b343.up.railway.app (open; per-IP rate limit on starting negotiations).
- Known cosmetic: a React hydration warning in dev, caused by a browser extension.

## Judging criteria (from the official rules, 2026-11-04)

Stage one is pass/fail: fits the theme and "reasonably applies" PayPal APIs. Stage two scores five equally weighted criteria. Ties break in this order, so Technological Implementation matters most.

| Criterion (official wording, shortened) | Where Haggle proves it | Demo moment (`DEMO.md`) |
|---|---|---|
| **Technological Implementation**: thorough, skilful use of the PayPal platform and AI tools; genuine, working, non-trivial | PayPal Orders v2 create + capture behind a server-side dual-approval gate. Two LLM agents with private information, forced structured tool calls, zod validation, `guard()` as the trust boundary, stall detection, escalation, SSE streaming with resume. AG Grid dashboard. | 0:40 live stream; 1:05 guard; 2:10 PayPal order |
| **Design**: a complete, coherent product, not a proof of concept | Listings with photos, brief form with Full auto / Co-pilot, live deal room with pause and live limits, three labelled endings with reasons, human decision card, approvals, PayPal checkout, dashboard, tutorial page. Nothing is a mockup. | 0:25 brief; 1:25 outcome card; /how-it-works |
| **Potential Impact**: a credible, specific case for a real problem and audience; the demo actually addresses it | Problem: people will not let an agent spend money unsupervised, and agent-to-agent haggling loops forever. Audience: secondhand, freelance and quote-based services. Shown: private limits, guard, walk/escalate, co-pilot and live limits, human approval before money. Iterated on real tester feedback. | Open with the problem; "needs you" ending |
| **Innovation / Idea**: creative, novel, different from existing concepts | Agent vs agent with asymmetric private information, and agents that know when to stop: walk with a reason, escalate within 15%, server ends stalls. Best Offer on eBay is a form; this is a negotiation with a safety boundary. | 1:05 to 1:45 |
| **Presentation**: video shows it working end to end; pitch says what, for whom, why; easy to follow | Under 3 minutes. Three endings in one video. State problem, audience, and "agents negotiate, guards enforce, humans approve, PayPal settles". | Whole script |

Honorable-mention prizes we should name in the submission text:

- **Best Use of Agentic Commerce** ($5k): this is the core of the project. Say the phrase.
- **Best Use of PayPal + AI** ($5k): PayPal order creation is gated on AI-negotiated, human-approved terms.
- **Best Demo Delivery** ($5k): the three-outcome demo is the hook.
Sponsor prizes stack with one honorable mention or Grand Prize, but a project can win only ONE sponsor prize. AG Grid is the biggest pool, so lead with it and name the others too:

- **Best Use of AG Grid** ($5k / $2k / 3x $1k): the dashboard is a live AG Grid Community "deal tape". It polls every 5s with `getRowId`, so running negotiations update in place with change flashing. Each row has a custom cell renderer that draws the buyer-vs-seller price path converging, with the buyer's private max as a dashed line. It also has number filters, quick search, CSV export (the price path exports as text), a pinned totals row, and a second AG Grid showing the selected deal's full turn log with each agent's private reasoning.
- **Best Use of Channel3** ($1.5k): the market check. Channel3 product search gives live UK retail prices for the listed item. They show on the listing and go to both agents as public context. In testing, the buyer opened with "similar models are over £1000 new, but since this is used…" and the seller countered with the same reference. It is grounded agentic commerce: agents argue from real market data, not invented numbers.
- **Best Use of Render** (credits): `render.yaml` Blueprint, a one-click deploy of the same app on Render.

## Submission checklist (deadline Thu 12 Nov 2026, 12:00 pm Pacific)

- [ ] **Text description** on Devpost: features and functionality. Reuse "Solution" and "Why this combination is interesting" above.
- [ ] **Tools field**: Nebius (Qwen3-235B-A22B, with gpt-oss-120b and Qwen3-30B fallbacks) through an OpenAI-compatible endpoint; PayPal Orders v2 sandbox + JS SDK; AG Grid Community (live dashboard + turn log); Channel3 product search (market check the agents cite); Next.js 15, Prisma, SQLite; hosted on Railway, with a Render Blueprint (`render.yaml`).
- [ ] **Functional demo**: hosted URL https://haggle-production-b343.up.railway.app, open to judges with no login.
- [ ] **Public repo**: https://github.com/ashaz3256/haggle. MIT `LICENSE` is at the root; check GitHub shows "MIT license" in the About box.
- [ ] **README run instructions**: present (install, `.env`, `db:push`, `db:seed`, `dev`). Add a line that the sandbox PayPal client id/secret are the judge's own from developer.paypal.com.
- [ ] **Demo video**: under 3 minutes, on YouTube, public, link on the form. Follow `DEMO.md`. No copyrighted music. Show all three endings and the PayPal popup.
- [ ] **New or significantly updated**: the repo history shows everything was built during the submission period (first commit after 1 Oct 2026). Say so in the description.
- [ ] **Rehearse the PayPal popup payment** with a sandbox personal account before recording.

## Future work (from tester feedback, not built)

- Tell your agent something mid-run ("ask if they have anything under £150").
- AI photo check for damage, so a buyer has evidence if the item arrives broken.
- Co-pilot for the seller side, and multiple photos per listing.

## Demo moments (for judges)

Legacy mapping kept for reference; the table above supersedes it.

| Idea | Demo moment (see `DEMO.md`) |
|---|---|
| Agent autonomy | 0:40, bubbles stream live |
| Safety / trust | 1:05, guard blocks counter; the "needs you" and "no deal" endings (DEMO.md, Three outcomes); 1:45, dual approval |
| Payments | 2:10, PayPal button and create-order |
| Usability | 0:25, one short brief form |
| Transparency | 2:40, dashboard of rounds, blocks and orders |
