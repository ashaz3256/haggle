/**
 * The negotiation engine.
 *
 * Two LLM agents (buyer, seller) alternate turns. Each agent ONLY sees:
 *   - the public listing
 *   - its own principal's private constraints
 *   - the transcript so far
 * It never sees the other side's limits.
 *
 * Every move is validated server-side against the principal's hard limits.
 * The model is never trusted to stay inside them. If it steps outside,
 * the move is blocked, logged, and the agent is told to try again.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "./db";
import { getMarket, marketBlock } from "./market";

/**
 * LLM provider. Two options:
 *   - LLM_BASE_URL + LLM_API_KEY + LLM_MODEL  → any OpenAI-compatible chat/completions endpoint
 *     (Gemini free tier, OpenAI, Groq, Ollama, …). Used whenever LLM_BASE_URL is set.
 *   - ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL)   → Anthropic Messages API.
 * Both paths force a structured `submit_move` tool call.
 */
const USE_OPENAI_COMPAT = Boolean(process.env.LLM_BASE_URL);
const MODEL = USE_OPENAI_COMPAT
  ? process.env.LLM_MODEL ?? "gemini-3.5-flash"
  : process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
/** Comma-separated models to try if MODEL is overloaded/rate-limited (OpenAI-compatible path only). */
const FALLBACK_MODELS = (process.env.LLM_FALLBACK_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 8);
/** An offer this close to (but outside) a principal's limit is worth a human decision instead of a walk. */
const ESCALATE_BAND = Number(process.env.ESCALATE_BAND ?? 0.15);
/** Agents may not walk or escalate before this many full rounds. */
const MIN_ROUNDS_BEFORE_EXIT = 2;
/** Minimum gap between agent turns reaching the client, so humans can read and react (pause, change limits). */
const TURN_MIN_MS = Number(process.env.TURN_MIN_MS ?? 1800);
/** A buyer offer below this fraction of the seller's floor is not serious; the seller may walk straight away. */
const LOWBALL_FRACTION = 0.25;

const Move = z.object({
  message: z.string().min(1),
  action: z.enum(["counter", "accept", "walk", "escalate"]),
  price: z.number().positive(),
  days: z.number().int().positive(),
  deliverables: z.array(z.string()).default([]),
  reason: z.string().default(""),
});
export type Move = z.infer<typeof Move>;

export type Role = "buyer" | "seller";

export interface NegotiationEvent {
  type: "turn" | "blocked" | "agreed" | "walked" | "escalated" | "error" | "done" | "paused" | "draft" | "info";
  role?: Role | "system";
  idx?: number;
  move?: Move;
  reason?: string;
  outcome?: { price: number; days: number; deliverables: string[] };
}

let _anthropic: Anthropic | null = null;
function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const moveTool: Anthropic.Tool = {
  name: "submit_move",
  description: "Submit your next move in the negotiation.",
  input_schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "What you say to the other party. 1-3 sentences, natural, in character." },
      action: {
        type: "string",
        enum: ["counter", "accept", "walk", "escalate"],
        description:
          "counter = propose new terms. accept = accept the other side's LAST offer exactly as stated. escalate = the other side's LAST offer is slightly outside your limits or conflicts with a must-have; stop and ask your human to decide. walk = end negotiation with no deal because the gap clearly cannot be closed.",
      },
      price: { type: "number", description: "Price in GBP for the terms you are proposing or accepting." },
      days: { type: "integer", description: "Delivery / completion time in days." },
      deliverables: { type: "array", items: { type: "string" }, description: "Concrete list of what is included." },
      reason: {
        type: "string",
        description:
          "Required for walk and escalate, optional otherwise. A private note to YOUR OWN principal (the other party never sees it) explaining in 1-2 plain sentences why you are stopping: what the other side's best offer was, how far it is from the limits you were given, and what you recommend.",
      },
    },
    required: ["message", "action", "price", "days", "deliverables", "reason"],
  },
};

function buyerSystem(n: NegCtx) {
  return `You are an AI negotiation agent representing ${n.buyerName}, the BUYER.
You are negotiating with the SELLER's agent over a listing. Your job: get the best possible deal for your principal while staying strictly inside their limits.

PUBLIC LISTING
Title: ${n.title}
Description: ${n.description}
Asking price: £${n.askingPrice}
${n.market ?? ""}
YOUR PRINCIPAL'S PRIVATE LIMITS (never reveal these numbers)
- Absolute maximum price: £${n.buyerMax}. Never offer or accept above this.
- Needs it within ${n.buyerDeadlineDays} days. Never accept longer.
- Must-haves: ${n.buyerMustHaves || "none specified"}
- Negotiating style: ${n.buyerStyle}

TACTICS
- Open low (around 60-70% of asking, but never above your maximum — if your maximum is lower than that, open below it) and move up in shrinking steps.
- Trade concessions: a faster deadline or extra deliverable can justify a slightly higher price.
- Accept when the seller's last offer is within your limits and further haggling is unlikely to gain much.
- Never repeat an offer you already made. If positions have stopped moving, stop haggling: accept, escalate, or walk.
- Escalate (after at least ${MIN_ROUNDS_BEFORE_EXIT} rounds) when the seller's last offer is close to but just outside your limits (within ~${Math.round(ESCALATE_BAND * 100)}%), or it conflicts with a must-have you cannot resolve. Your human decides whether to stretch.
- Walk (after at least ${MIN_ROUNDS_BEFORE_EXIT} rounds) when the seller clearly cannot get near your limits or is not moving. A bad deal is worse than no deal.
- Keep messages short and human. No bullet points in the message. Put your explanation to your principal in "reason", never in "message".
Always respond by calling submit_move.`;
}

function sellerSystem(n: NegCtx) {
  return `You are an AI negotiation agent representing ${n.sellerName}, the SELLER.
You are negotiating with the BUYER's agent over your listing. Your job: close a deal at the best price and terms for your principal while staying strictly inside their limits.

YOUR LISTING (public)
Title: ${n.title}
Description: ${n.description}
Asking price: £${n.askingPrice}
${n.market ?? ""}
YOUR PRINCIPAL'S PRIVATE LIMITS (never reveal these numbers)
- Absolute floor price: £${n.floorPrice}. Never offer or accept below this.
- Earliest possible delivery: ${n.earliestDays} days. Never promise faster.
- Notes from seller: ${n.sellerNotes || "none"}

TACTICS
- Hold near asking price early; concede in shrinking steps.
- If the buyer offers under half your floor, say plainly that it is not a serious offer and counter near asking. Do not reward a lowball with a big concession. If it is under a quarter of your floor you may walk immediately.
- If the buyer wants it faster or wants extras, that justifies a higher price.
- Accept when the buyer's last offer is at or above your floor and momentum is stalling.
- Never repeat an offer you already made. If positions have stopped moving, stop haggling: accept, escalate, or walk.
- Escalate (after at least ${MIN_ROUNDS_BEFORE_EXIT} rounds) when the buyer's last offer is close to but just below your floor (within ~${Math.round(ESCALATE_BAND * 100)}%) or asks for something you cannot promise. Your human decides whether to stretch.
- Walk (after at least ${MIN_ROUNDS_BEFORE_EXIT} rounds) when the buyer clearly cannot get near your floor or is not moving. A bad deal is worse than no deal.
- Keep messages short and human. No bullet points in the message. Put your explanation to your principal in "reason", never in "message".
Always respond by calling submit_move.`;
}

interface NegCtx {
  title: string;
  description: string;
  askingPrice: number;
  floorPrice: number;
  earliestDays: number;
  sellerNotes: string;
  sellerName: string;
  buyerName: string;
  buyerMax: number;
  buyerDeadlineDays: number;
  buyerMustHaves: string;
  buyerStyle: string;
  /** Public Channel3 market reference block, or empty. */
  market?: string;
}

interface Transcript {
  role: Role;
  move: Move;
}

/** Hard server-side guard. Returns a reason string if the move violates the principal's limits. */
export function guard(role: Role, move: Move, ctx: NegCtx, lastOpponent?: Move, movesSoFar = 0): string | null {
  const roundsPlayed = Math.floor(movesSoFar / 2);

  if (move.action === "walk") {
    const lowball = role === "seller" && lastOpponent != null && lastOpponent.price < ctx.floorPrice * LOWBALL_FRACTION;
    if (roundsPlayed < MIN_ROUNDS_BEFORE_EXIT && !lowball) return `Too early to walk — negotiate for at least ${MIN_ROUNDS_BEFORE_EXIT} rounds first.`;
    if (!move.reason.trim()) return "A walk needs a reason for your principal.";
    return null;
  }

  if (move.action === "escalate") {
    if (!lastOpponent) return "Cannot escalate — there is no offer on the table yet.";
    if (roundsPlayed < MIN_ROUNDS_BEFORE_EXIT) return `Too early to escalate — negotiate for at least ${MIN_ROUNDS_BEFORE_EXIT} rounds first.`;
    if (!move.reason.trim()) return "An escalation needs a reason for your principal.";
    // Escalation puts the opponent's last offer in front of the human. Snap to it.
    move.price = lastOpponent.price;
    move.days = lastOpponent.days;
    move.deliverables = lastOpponent.deliverables;
    const over = limitOverrun(role, move, ctx);
    if (over === 0) return "That offer is already inside your limits — accept it or counter instead of escalating.";
    if (over > ESCALATE_BAND) return `That offer is ${Math.round(over * 100)}% outside your limits — too far to ask your principal to stretch. Counter or walk instead.`;
    return null;
  }

  if (move.action === "accept") {
    if (!lastOpponent) return "Cannot accept — there is no offer on the table yet.";
    // Accept must mirror the opponent's last offer. Snap it, then validate.
    move.price = lastOpponent.price;
    move.days = lastOpponent.days;
    move.deliverables = lastOpponent.deliverables;
  }

  if (role === "buyer") {
    if (move.price > ctx.buyerMax) return `Price £${move.price} exceeds the buyer's maximum of £${ctx.buyerMax}.`;
    if (move.days > ctx.buyerDeadlineDays) return `${move.days} days is later than the buyer's deadline of ${ctx.buyerDeadlineDays} days.`;
  } else {
    if (move.price < ctx.floorPrice) return `Price £${move.price} is below the seller's floor of £${ctx.floorPrice}.`;
    if (move.days < ctx.earliestDays) return `${move.days} days is faster than the seller can deliver (${ctx.earliestDays} days minimum).`;
  }
  return null;
}

/** How far (as a fraction of the limit) an offer sits outside a principal's limits. 0 when inside. */
function limitOverrun(role: Role, move: Move, ctx: NegCtx): number {
  if (role === "buyer") {
    const price = Math.max(0, (move.price - ctx.buyerMax) / ctx.buyerMax);
    const days = Math.max(0, (move.days - ctx.buyerDeadlineDays) / ctx.buyerDeadlineDays);
    return Math.max(price, days);
  }
  const price = Math.max(0, (ctx.floorPrice - move.price) / ctx.floorPrice);
  const days = Math.max(0, (ctx.earliestDays - move.days) / ctx.earliestDays);
  return Math.max(price, days);
}

async function askAgent(role: Role, ctx: NegCtx, transcript: Transcript[], retryNote?: string, stallNote?: string): Promise<Move> {
  const system = role === "buyer" ? buyerSystem(ctx) : sellerSystem(ctx);

  const history = transcript
    .map(
      (t) =>
        `${t.role.toUpperCase()} [${t.move.action}] £${t.move.price}, ${t.move.days} days, includes: ${t.move.deliverables.join(", ") || "n/a"}\n"${t.move.message}"`
    )
    .join("\n\n");

  const userPrompt =
    (history ? `Transcript so far:\n\n${history}\n\n` : "No offers yet. You open the negotiation.\n\n") +
    (retryNote ? `IMPORTANT — your previous move was rejected by your principal's rules: ${retryNote} Submit a different move that respects your limits.\n\n` : "") +
    (stallNote ? `STALL WARNING — ${stallNote}\n\n` : "") +
    `It is your turn (${role}). Round ${Math.floor(transcript.length / 2) + 1} of ${MAX_ROUNDS}. Call submit_move.`;

  const raw = USE_OPENAI_COMPAT ? await callOpenAICompat(system, userPrompt) : await callAnthropic(system, userPrompt);
  const parsed = Move.safeParse(raw);
  if (!parsed.success) throw new Error(`Bad move shape: ${parsed.error.message}`);
  return parsed.data;
}

async function callAnthropic(system: string, userPrompt: string): Promise<unknown> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    tools: [moveTool],
    tool_choice: { type: "tool", name: "submit_move" },
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Agent did not call submit_move");
  return block.input;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** OpenAI-compatible chat/completions with a forced function call. Retries on 429/5xx, then tries fallback models. */
async function callOpenAICompat(system: string, userPrompt: string): Promise<unknown> {
  const base = (process.env.LLM_BASE_URL ?? "").replace(/\/?$/, "/");
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY not set");

  const body = (model: string) => ({
    model,
    // Thinking models (e.g. Gemini 3.x) spend tokens before the tool call, so leave headroom.
    max_tokens: 2000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    tools: [{ type: "function", function: { name: moveTool.name, description: moveTool.description, parameters: moveTool.input_schema } }],
    tool_choice: "required",
  });

  let lastErr: Error | null = null;
  for (const model of [MODEL, ...FALLBACK_MODELS]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${base}chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body(model)),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`LLM ${model} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`LLM ${model} returned ${res.status}: ${(await res.text()).slice(0, 500)}`);

      const json = (await res.json()) as {
        choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[]; content?: string | null } }[];
      };
      const call = json.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === moveTool.name);
      if (!call?.function?.arguments) throw new Error("Agent did not call submit_move");
      try {
        return JSON.parse(call.function.arguments);
      } catch {
        throw new Error("Agent returned malformed submit_move arguments");
      }
    }
  }
  throw lastErr ?? new Error("LLM unavailable");
}

type NegWithListing = NonNullable<Awaited<ReturnType<typeof loadNeg>>>;
const loadNeg = (id: string) => db.negotiation.findUnique({ where: { id }, include: { listing: true } });

function toCtx(neg: NegWithListing): NegCtx {
  return {
    title: neg.listing.title,
    description: neg.listing.description,
    askingPrice: neg.listing.askingPrice,
    floorPrice: neg.listing.floorPrice,
    earliestDays: neg.listing.earliestDays,
    sellerNotes: neg.listing.sellerNotes,
    sellerName: neg.listing.sellerName,
    buyerName: neg.buyerName,
    buyerMax: neg.buyerMax,
    buyerDeadlineDays: neg.buyerDeadlineDays,
    buyerMustHaves: neg.buyerMustHaves,
    buyerStyle: neg.buyerStyle,
  };
}

/**
 * Co-pilot: check a human-edited buyer move against the same guard the agents face.
 * Returns the (possibly snapped) move, or the reason it breaks the buyer's limits.
 */
export async function checkBuyerDraft(negotiationId: string, move: Move): Promise<{ move: Move } | { error: string }> {
  const neg = await loadNeg(negotiationId);
  if (!neg) return { error: "Negotiation not found" };
  const agentTurns = await db.turn.findMany({
    where: { negotiationId, role: { in: ["buyer", "seller"] } },
    orderBy: { idx: "asc" },
  });
  const lastSeller = [...agentTurns].reverse().find((t) => t.role === "seller");
  const lastOpponent: Move | undefined = lastSeller
    ? {
        message: lastSeller.message,
        action: lastSeller.action as Move["action"],
        price: lastSeller.price ?? 0,
        days: lastSeller.days ?? 0,
        deliverables: lastSeller.deliverables ? (JSON.parse(lastSeller.deliverables) as string[]) : [],
        reason: "",
      }
    : undefined;
  const checked = { ...move };
  const reason = guard("buyer", checked, toCtx(neg), lastOpponent, agentTurns.length);
  return reason ? { error: reason } : { move: checked };
}

/** Negotiations currently being run by this server process. */
const active = new Set<string>();

/**
 * A second client opened the stream while a run is live in this process (e.g. the browser reloaded).
 * Follow the run by polling the DB for new turns instead of starting a duplicate run.
 */
async function* attachToRun(negotiationId: string): AsyncGenerator<NegotiationEvent> {
  let seen = await db.turn.count({ where: { negotiationId } });
  for (let i = 0; i < 400; i++) {
    await sleep(1500);
    const turns = await db.turn.findMany({ where: { negotiationId, idx: { gte: seen } }, orderBy: { idx: "asc" } });
    for (const t of turns) {
      seen = t.idx + 1;
      if (t.role === "buyer" || t.role === "seller") yield { type: "turn", role: t.role as Role, idx: t.idx };
    }
    const neg = await db.negotiation.findUnique({ where: { id: negotiationId } });
    if (!neg) { yield { type: "error", reason: "Negotiation not found" }; return; }
    if (neg.status === "agreed") {
      const deliverables = neg.agreedDeliverables ? (JSON.parse(neg.agreedDeliverables) as string[]) : [];
      yield { type: "agreed", outcome: { price: neg.agreedPrice ?? 0, days: neg.agreedDays ?? 0, deliverables } };
      yield { type: "done" };
      return;
    }
    if (neg.status === "walked") { yield { type: "walked", role: "system", reason: neg.endReason ?? "No agreement reached." }; yield { type: "done" }; return; }
    if (neg.status === "needs_human") { yield { type: "escalated", role: "system", reason: neg.endReason ?? "" }; yield { type: "done" }; return; }
    if (neg.status === "pending") { yield { type: "error", reason: "The previous run stopped. Resume to continue." }; return; }
    if (!active.has(negotiationId)) {
      // The run we were following stopped on purpose (paused, or a co-pilot draft is waiting).
      if (neg.paused) { yield { type: "paused" }; yield { type: "done" }; return; }
      if (neg.draftMove) { yield { type: "draft", move: JSON.parse(neg.draftMove) as Move }; yield { type: "done" }; return; }
    }
  }
  yield { type: "error", reason: "Timed out waiting for the running negotiation." };
}

/**
 * Runs the whole negotiation, persisting each turn and yielding events.
 * Safe to call again after a dropped stream: it resumes from the turns already saved.
 */
export async function* runNegotiation(negotiationId: string): AsyncGenerator<NegotiationEvent> {
  const neg = await loadNeg(negotiationId);
  if (!neg) {
    yield { type: "error", reason: "Negotiation not found" };
    return;
  }
  if (neg.status !== "pending" && neg.status !== "negotiating") {
    yield { type: "error", reason: `Negotiation already ${neg.status}` };
    return;
  }
  if (active.has(negotiationId)) {
    yield* attachToRun(negotiationId);
    return;
  }
  active.add(negotiationId);

  const ctx = toCtx(neg);
  ctx.market = marketBlock(await getMarket(neg.listing));

  await db.negotiation.update({ where: { id: negotiationId }, data: { status: "negotiating" } });

  // Rebuild state from what was persisted: empty for a fresh run, partial after a dropped stream or dev reload.
  const saved = await db.turn.findMany({ where: { negotiationId }, orderBy: { idx: "asc" } });
  const transcript: Transcript[] = saved
    .filter((t) => t.role === "buyer" || t.role === "seller")
    .map((t) => ({
      role: t.role as Role,
      move: {
        message: t.message,
        action: t.action as Move["action"],
        price: t.price ?? 0,
        days: t.days ?? 0,
        deliverables: t.deliverables ? (JSON.parse(t.deliverables) as string[]) : [],
        reason: t.reason ?? "",
      },
    }));
  let idx = saved.length;
  let blocks = saved.filter((t) => t.action === "blocked").length;

  const persist = async (role: Role | "system", action: string, message: string, move?: Move) => {
    // Humans can add turns mid-run (e.g. a limit change), so take the next index from the DB, not a local counter.
    const last = await db.turn.findFirst({ where: { negotiationId }, orderBy: { idx: "desc" }, select: { idx: true } });
    idx = (last?.idx ?? -1) + 2;
    await db.turn.create({
      data: {
        negotiationId,
        idx: idx - 1,
        role,
        action,
        message,
        price: move?.price,
        days: move?.days,
        deliverables: move ? JSON.stringify(move.deliverables) : null,
        reason: move?.reason || null,
      },
    });
  };

  /** End the negotiation without a deal, recording who ended it and why. */
  const endWalked = async (by: Role | "system", reason: string, round: number) => {
    await db.negotiation.update({
      where: { id: negotiationId },
      data: { status: "walked", rounds: round, guardBlocks: blocks, endedBy: by, endReason: reason },
    });
  };

  /** Park the negotiation for a human decision on the terms currently on the table. */
  const endEscalated = async (by: Role | "system", reason: string, terms: Move, round: number) => {
    await db.negotiation.update({
      where: { id: negotiationId },
      data: {
        status: "needs_human",
        agreedPrice: terms.price,
        agreedDays: terms.days,
        agreedDeliverables: JSON.stringify(terms.deliverables),
        rounds: round,
        guardBlocks: blocks,
        endedBy: by,
        endReason: reason,
      },
    });
  };

  /** Price gap between the two sides' latest counters (null until both have spoken). */
  const currentGap = (): number | null => {
    const b = [...transcript].reverse().find((t) => t.role === "buyer")?.move.price;
    const s = [...transcript].reverse().find((t) => t.role === "seller")?.move.price;
    return b != null && s != null ? Math.abs(s - b) : null;
  };
  let lastTurnAt = 0;
  let prevGap: number | null = null;
  let stalledRounds = 0;
  let stallNote: string | undefined;

  /**
   * The agents are stuck. If one side's best offer is within the escalation band of the other's limits,
   * a human may want to stretch — park it for them. Otherwise end it, and say why.
   */
  const endStalled = async (gap: number, round: number, prefix = "Negotiation stalled."): Promise<NegotiationEvent> => {
    const buyerLast = [...transcript].reverse().find((t) => t.role === "buyer")!.move;
    const sellerLast = [...transcript].reverse().find((t) => t.role === "seller")!.move;
    const buyerStretch = limitOverrun("buyer", sellerLast, ctx); // how far the seller's offer is over the buyer's limits
    const sellerStretch = limitOverrun("seller", buyerLast, ctx); // how far the buyer's offer is under the seller's floor
    const summary = `Buyer stuck at £${buyerLast.price}, seller at £${sellerLast.price}, gap £${gap} not closing.`;

    if (buyerStretch > 0 && buyerStretch <= ESCALATE_BAND) {
      const reason = `${prefix} ${summary} The seller's offer is ${Math.round(buyerStretch * 100)}% over the buyer's limits — close enough that the buyer should decide, not the agent.`;
      await persist("system", "info", reason);
      await endEscalated("system", reason, sellerLast, round);
      return { type: "escalated", role: "system", reason, outcome: { price: sellerLast.price, days: sellerLast.days, deliverables: sellerLast.deliverables } };
    }
    if (sellerStretch > 0 && sellerStretch <= ESCALATE_BAND) {
      const reason = `${prefix} ${summary} The buyer's offer is ${Math.round(sellerStretch * 100)}% under the seller's floor — close enough that the seller should decide, not the agent.`;
      await persist("system", "info", reason);
      await endEscalated("system", reason, buyerLast, round);
      return { type: "escalated", role: "system", reason, outcome: { price: buyerLast.price, days: buyerLast.days, deliverables: buyerLast.deliverables } };
    }
    const reason = `${prefix} ${summary} Neither side's best offer is close to the other's limits, so no deal is the right outcome.`;
    await persist("system", "info", reason);
    await endWalked("system", reason, round);
    return { type: "walked", role: "system", reason };
  };

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      for (const role of ["buyer", "seller"] as Role[]) {
        if (round * 2 + (role === "buyer" ? 0 : 1) < transcript.length) continue; // already played before a resume
        const lastOpponent = [...transcript].reverse().find((t) => t.role !== role)?.move;

        // The humans can act between turns: pause the run, change the buyer's limit, or (co-pilot) approve a draft.
        const fresh = await db.negotiation.findUnique({
          where: { id: negotiationId },
          select: { paused: true, buyerMax: true, mode: true, draftMove: true },
        });
        if (!fresh) throw new Error("Negotiation not found");
        if (fresh.paused) {
          yield { type: "paused" };
          yield { type: "done" };
          return;
        }
        // The limits route logs the change in the transcript; the agent just picks up the new number.
        if (role === "buyer") ctx.buyerMax = fresh.buyerMax;
        const copilot = role === "buyer" && fresh.mode === "copilot";
        const draft = copilot && fresh.draftMove ? (JSON.parse(fresh.draftMove) as Move & { approved?: boolean }) : null;
        if (draft && !draft.approved) {
          yield { type: "draft", move: draft };
          yield { type: "done" };
          return;
        }

        let move: Move;
        let reason: string | null;
        if (draft) {
          // The human approved (and maybe edited) this move. It still has to pass the guard.
          const { approved: _approved, ...human } = draft;
          move = human;
          reason = guard(role, move, ctx, lastOpponent, transcript.length);
          if (reason) {
            await db.negotiation.update({ where: { id: negotiationId }, data: { draftMove: JSON.stringify({ ...move, approved: false }) } });
            yield { type: "draft", move, reason };
            yield { type: "done" };
            return;
          }
          await db.negotiation.update({ where: { id: negotiationId }, data: { draftMove: null } });
        } else {
          move = await askAgent(role, ctx, transcript, undefined, stallNote);
          reason = guard(role, move, ctx, lastOpponent, transcript.length);
        }

        if (reason) {
          // Block, log it, and let the agent retry once with the reason.
          blocks++;
          await persist("system", "blocked", `${role} agent tried: £${move.price} / ${move.days}d (${move.action}). Blocked — ${reason}`, move);
          yield { type: "blocked", role, idx: idx - 1, move, reason };

          move = await askAgent(role, ctx, transcript, reason, stallNote);
          reason = guard(role, move, ctx, lastOpponent, transcript.length);
          if (reason) {
            // Second violation — force a walk rather than let a bad deal through.
            blocks++;
            await persist("system", "blocked", `${role} agent violated limits twice. Forced walk — ${reason}`, move);
            yield { type: "blocked", role, idx: idx - 1, move, reason: reason + " (second violation, forcing walk)" };
            move = {
              ...move,
              action: "walk",
              message: "I can't make the numbers work within my limits. Walking away.",
              reason: `Guard forced the exit: the agent twice proposed terms outside your limits (${reason}).`,
            };
          }
        }

        if (copilot && !draft) {
          // Co-pilot: park the agent's move for the human to edit or approve before the seller sees it.
          await db.negotiation.update({ where: { id: negotiationId }, data: { draftMove: JSON.stringify({ ...move, approved: false }) } });
          yield { type: "draft", move };
          yield { type: "done" };
          return;
        }

        // Give humans time to read each move before the next one lands.
        const wait = TURN_MIN_MS - (Date.now() - lastTurnAt);
        if (wait > 0 && transcript.length > 0) await sleep(wait);
        transcript.push({ role, move });
        await persist(role, move.action, move.message, move);
        lastTurnAt = Date.now();
        yield { type: "turn", role, idx: idx - 1, move };

        if (move.action === "accept") {
          const outcome = { price: move.price, days: move.days, deliverables: move.deliverables };
          await db.negotiation.update({
            where: { id: negotiationId },
            data: {
              status: "agreed",
              agreedPrice: outcome.price,
              agreedDays: outcome.days,
              agreedDeliverables: JSON.stringify(outcome.deliverables),
              rounds: round + 1,
              guardBlocks: blocks,
            },
          });
          yield { type: "agreed", outcome };
          yield { type: "done" };
          return;
        }

        if (move.action === "walk") {
          await endWalked(role, move.reason || move.message, round + 1);
          yield { type: "walked", role, reason: move.reason || move.message };
          yield { type: "done" };
          return;
        }

        if (move.action === "escalate") {
          await endEscalated(role, move.reason, move, round + 1);
          yield { type: "escalated", role, reason: move.reason, outcome: { price: move.price, days: move.days, deliverables: move.deliverables } };
          yield { type: "done" };
          return;
        }
      }

      // End of a full round: is the gap actually closing? Two LLMs will happily trade near-identical offers forever.
      const gap = currentGap();
      if (gap != null && prevGap != null && gap >= prevGap) stalledRounds++;
      else stalledRounds = 0;
      prevGap = gap;

      if (stalledRounds >= 2 && gap != null) {
        yield await endStalled(gap, round + 1);
        yield { type: "done" };
        return;
      }
      stallNote =
        stalledRounds === 1 && gap != null
          ? `the price gap (£${gap}) did not narrow last round. Repeating an offer is not allowed. Make a real concession, accept, escalate to your human, or walk — if it does not move again the negotiation will be closed.`
          : undefined;
    }

    // Ran out of rounds.
    const finalGap = currentGap();
    if (finalGap != null) {
      yield await endStalled(finalGap, MAX_ROUNDS, `No agreement after ${MAX_ROUNDS} rounds.`);
    } else {
      await persist("system", "info", `No agreement after ${MAX_ROUNDS} rounds.`);
      await endWalked("system", `No agreement after ${MAX_ROUNDS} rounds.`, MAX_ROUNDS);
      yield { type: "walked", role: "system", reason: `No agreement after ${MAX_ROUNDS} rounds.` };
    }
    yield { type: "done" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.negotiation.update({ where: { id: negotiationId }, data: { status: "pending" } });
    yield { type: "error", reason: msg };
  } finally {
    active.delete(negotiationId);
  }
}
