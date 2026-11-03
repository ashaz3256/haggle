---
name: demo-check
description: Pre-demo rehearsal check for Haggle. Runs the verifier agent over the main user flow, then refreshes DEMO.md and screenshots with demo-prep if everything passes. Use before each demo run-through or when the user says "demo check" or "is the demo ready".
---

# Demo check

1. Spawn the `verifier` agent with this task:
   "Verify the main demo flow: GET /api/listings, open a listing page, POST /api/negotiations for it, read the SSE stream for 10s, POST approve, then POST /api/paypal/create-order (SKIPPED if no PayPal creds). Browser: load /, open a listing, start a negotiation, confirm the deal room shows moves. Report the PASS/FAIL table."
2. Relay the table to the user. If any step is FAIL, stop here and list the failures with the suspected files. Do not fix anything unless the user asks.
3. If all steps are PASS or SKIPPED, spawn the `demo-prep` agent with:
   "Refresh docs/DEMO.md against the current code and retake the screenshots in docs/screenshots/ from the running dev server. Keep the fallback section."
4. Reply with: pass/fail summary, the files demo-prep changed, and any SKIPPED steps the user must test manually (PayPal).
