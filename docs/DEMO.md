# Haggle: 3-minute demo script

Setup before you start (not on the clock):

- Public instance: https://haggle-production-b343.up.railway.app (Railway, SQLite on a `/data` volume, last deployed 2026-11-09 with `railway up` from `haggle/haggle/`). Use this for the demo; localhost is the fallback.
- The public instance is open (no access code). Each IP may start at most 12 negotiations per hour (`NEG_RATE_LIMIT`). An optional gate exists: set `ACCESS_CODE` on the Railway service to require it; share links as `?code=<ACCESS_CODE>`.
- Fallback dev server at http://localhost:3000 (`npm run dev` from `haggle/haggle/`).
- Tab 1: the public URL (start here).
- Tab 2 (backup): an already-agreed deal, e.g. `http://localhost:3000/deal/<id>` from an earlier run. Both approvals done if you want to show the PayPal button.
- Have a PayPal sandbox personal account ready if you plan to pay live.

Example brief for the bike: name **Sam**, max **260**, **7** days, must-have **helmet included**, style Friendly.
Typical result: agreed around the mid-£200s in about 3 rounds. Last verified run: agreed at **£250**, 2 days, bike + helmet, 0 guard blocks. The price varies per run.

## Script

| Time | Where / click | Say |
|---|---|---|
| 0:00 | Home page (3 listings) | "Haggle: your agent haggles, their agent haggles back, you both approve, PayPal settles." |
| 0:15 | Click **Send your agent** on "Used road bike, Giant Contend, 2021" (asking £320) | "Tom is selling a bike for £320. I'm Sam, and I'll brief my agent." |
| 0:25 | Brief form: Name `Sam`, Max budget `260`, Within `7` days, Must-haves `helmet included`, Mode **Full auto**. Click **Send my agent in** | "My max is £260. The seller's agent never sees that number. It also never tells mine its floor." |
| 0:40 | Deal room opens at `/deal/<id>`. Watch the bubbles stream in | "Two LLM agents, live over SSE. Each only knows its own limits and the public listing." |
| 0:55 | Click **❚❚ Pause** in the header, then **▶ Resume** | "I can stop my agent at any point between moves. Nothing happens without me being able to step in." |
| 1:05 | Point at the "Guard blocks" counter in the right-hand brief card (and any red Guard row if one appears) | "Every move is checked on the server against hard limits. If a model offers over budget or under floor, the move is blocked and logged. Two strikes forces a walk." |
| 1:25 | Status flips to **agreed**; point at "Deal reached" card (price, days, deliverables) | "Deal in about 3 rounds, under my max. But no money has moved yet." |
| 1:45 | Click **Approve as Sam (buyer)**, then **Approve as Tom (seller)** | "Both humans sign off. The server refuses to create a PayPal order until both have." |
| 2:10 | PayPal buttons unlock in the same card. Click the PayPal button | "PayPal Orders v2. The order is created server-side only after dual approval." |
| 2:25 | PayPal sandbox popup: log in with the sandbox personal account and pay (or stop at the popup, see fallback) | "Sandbox money, real PayPal flow. On approval the server captures the order." |
| 2:40 | Open /dashboard | "Every negotiation: asking vs budget vs agreed, rounds, guard blocks, PayPal order." |
| 2:55 | Back to home | "Agents negotiate. Guards enforce. Humans approve. PayPal settles." |

Timing notes:

- Moves arrive at least 1.8 s apart (`TURN_MIN_MS`) so people can read them. A full negotiation takes about 20 to 40 seconds. Fill the gap by explaining the guard (step 1:05).
- If you scroll up during a run the page stays put and a **New messages ↓** button appears; tap it to jump back down.
- If the buyer agent is slow, say the line for 1:25 while bubbles still appear.

## Three outcomes (the "agents that know when to stop" story)

All on the bike listing (asking £320; Tom's private floor is £240). Same brief each time except the max budget. Each run takes 15 to 60 seconds.

| Outcome | Buyer max | What happens | What to say |
|---|---|---|---|
| Deal | `260` | Agents converge in about 3 rounds. Status **agreed**, approvals, PayPal. | "Overlap exists, so the agents find it." |
| Needs a human | `224` | Buyer caps at £224, Tom's agent at £240. After the gap stops moving, one agent **escalates**: status **needs you**, amber card shows the terms on the table and the agent's private note explaining the £16 gap. Click **Stretch my limit** (deal proceeds to approvals) or **Walk away**. | "The gap is 7%. The agent is not allowed to stretch my limit. It stops and asks me. That is the safety boundary." |
| No deal | `160` | Buyer stuck at £160, seller at £240. The server detects two rounds with no movement and ends it. Red "No deal" card shows who ended it and why. | "Two chatbots would trade the same offers forever. Haggle notices the stall and walks, with a reason I can read." |

Rules that make this deterministic, not vibes:

- Agents cannot walk or escalate before round 2, and must give a private reason to their principal.
- Escalate is only allowed when the other side's last offer is outside the limits by at most 15% (`ESCALATE_BAND`). Inside the limits: accept. Further out: counter or walk.
- After every full round the server compares the price gap with the previous round. One stalled round: both agents get a warning. Two: the server ends it, escalating if either side's best offer is within 15% of the other's limits, otherwise walking.
- Verified 2026-11-04 with Nebius Qwen3-235B: £260 agreed in 3 rounds; £224 escalated by the seller's agent in round 6; £160 walked by the stall detector in round 5 (24 s).
- Which agent escalates (buyer or seller) varies per run (seen both). The card adapts.

## Humans in control: co-pilot and live limits (built from tester feedback, 2026-11-09)

Testers said the agents moved too fast to react, they wanted to change their limit mid-chat, and they wanted to approve moves themselves. All three are in. Good for a 30-second segment after the three outcomes, or instead of one of them.

| Feature | How to show it | What to say |
|---|---|---|
| Co-pilot mode | Brief form: pick **Co-pilot**, max `250`. The deal room shows a dashed **draft for you** card with the agent's message, price and its private note. Edit the text, then click **Send counter-offer**. Try typing `300` first: the card turns red, "Over your max, raise it first", and the server rejects it. | "In co-pilot my agent drafts, I decide. My edits go through the same guard as the model, so I can't fat-finger past my own limit either." |
| Change your max live | Header: **Your max · Change** → **+£25** → **Update**. A grey System line appears in the chat: "Sam changed their max budget from £250 to £275. Private: the seller's agent can't see this." | "Tom's agent never sees this. My agent uses the new limit from its next turn, and the guard enforces it." |
| Pause | **❚❚ Pause** in the header; status pill shows **paused**; **▶ Resume** carries on from the saved turns. | "Agents are fast. Humans get a pause button." |
| Lowball | Brief with max `1` on the bike. Tom's agent replies that £1 is "not a serious offer" and holds near asking. | "It doesn't reward a silly offer with a big concession." |
| Photos | **Post a listing** → tap **Add a photo** (camera on a phone). Resized in the browser, shown on the listing card. | Only if asked. |

Verified 2026-11-09 via the API on localhost and on the Railway instance: pause mid-run then resume; raising the max from £200 to £280 mid-run (agreed at £265); co-pilot draft, guard rejection of an over-max edit, edited send, seller reply, next draft, redo; £1 lowball; photo upload and display. The user checked the new UI on a phone.

## What is verified and what is not

- Verified end to end: listings, creating a negotiation, live streaming in the browser, agreed state, buyer and seller approval, PayPal create-order returning a real sandbox order id.
- Verified 2026-11-04 via the API and in Chrome: all three outcomes above (agreed, needs_human, walked), the amber "needs a decision" card, and clicking **Stretch my limit** (deal flips to agreed with an amber "over your max, you approved the stretch" line). Screenshots: `docs/screenshots/deal-needs-human.jpg`, `deal-stretched-agreed.jpg`.
- **Not verified: the actual payment capture in the PayPal popup.** It needs a sandbox personal account to log in and pay. Do not promise it works on stage unless you rehearsed it with that account.
- The guard blocking a move depends on the model misbehaving. It may show 0 blocks on a given run. Do not promise a red Guard row.

## Fallbacks

### Public instance is down

1. Switch to localhost:3000 (`npm run dev` from `haggle/haggle/`). Same code, same `.env`.
2. To redeploy: `railway up -c -y` from `haggle/haggle/` (CLI is logged in as the Railway account). Variables and the `/data` volume are already set on the `haggle` service.

### LLM is down or slow (bubbles stop, error shown, or a Resume button appears)

1. Click **Resume**. The server continues from the saved turns.
2. Still failing: the app already retries 429/5xx and tries `LLM_FALLBACK_MODELS`. If every model is down, edit `.env` and point at another provider:
   - `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and optionally `LLM_FALLBACK_MODELS`.
   - Any OpenAI-compatible endpoint works (Nebius, Gemini, OpenAI, Groq, Ollama).
   - Restart `npm run dev`. Env is read at start.
3. Do not use `gemini-2.5-*` models with the current Gemini key (404).
4. Out of time: switch to the backup tab (an already-agreed deal) and continue from the approval step. Say: "Here is one I ran earlier."
5. Last resort: show `docs/screenshots/` in order: `home.png`, `listing-brief.png`, `deal-room-live.png`, `deal-agreed-approve.png`, `deal-buyer-approved.png`.

### Browser reload or disconnect mid-negotiation

- The server finishes the run. Reload the page: it re-attaches or resumes from the saved turns. If the connection drops, a **Resume** button appears.

### PayPal popup fails or sandbox is down

1. Show the create-order response instead: open DevTools, Network tab, find `POST /api/paypal/create-order`, show the JSON with the sandbox order `id` and status `CREATED`.
2. Say: "The order exists in PayPal sandbox. Capture happens when the buyer approves in the popup. I have not completed that step on this machine."
3. Show screenshots from `docs/screenshots/` (approval flow). There is no screenshot of a completed payment.
4. If create-order itself returns an error: check `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID` in `.env` (sandbox app) and restart.

### Dev-only noise

- A React hydration warning in the dev console comes from a browser extension, not the app. Ignore it, or demo in an incognito window.
