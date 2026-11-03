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
import OpenAI from "openai";
import { z } from "zod";
import { db } from "./db";

const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 8);

/**
 * Provider selection:
 *  - ANTHROPIC_API_KEY set            → Claude via Anthropic SDK (ANTHROPIC_MODEL)
 *  - otherwise LLM_API_KEY + LLM_BASE_URL → any OpenAI-compatible API (Gemini, Groq, OpenRouter, OpenAI) with LLM_MODEL
 */
const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";

const Move = z.object({
  message: z.string().min(1),
  action: z.enum(["counter", "accept", "walk"]),
  price: z.number().positive(),
  days: z.number().int().positive(),
  deliverables: z.array(z.string()).default([]),
});
export type Move = z.infer<typeof Move>;

export type Role = "buyer" | "seller";

export interface NegotiationEvent {
  type: "turn" | "blocked" | "agreed" | "walked" | "error" | "done";
  role?: Role | "system";
  idx?: number;
  move?: Move;
  reason?: string;
  outcome?: { price: number; days: number; deliverables: string[] };
}

const anthropic = useAnthropic ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = useAnthropic
  ? null
  : new OpenAI({ apiKey: process.env.LLM_API_KEY ?? "missing", baseURL: process.env.LLM_BASE_URL });

const moveSchema = {
    type: "object",
    properties: {
      message: { type: "string", description: "What you say to the other party. 1-3 sentences, natural, in character." },
      action: {
        type: "string",
        enum: ["counter", "accept", "walk"],
        description:
          "counter = propose new terms. accept = accept the other side's LAST offer exactly as stated. walk = end negotiation with no deal.",
      },
      price: { type: "number", description: "Price in GBP for the terms you are proposing or accepting." },
      days: { type: "integer", description: "Delivery / completion time in days." },
      deliverables: { type: "array", items: { type: "string" }, description: "Concrete list of what is included." },
    },
    required: ["message", "action", "price", "days", "deliverables"],
} as const;

const moveTool: Anthropic.Tool = {
  name: "submit_move",
  description: "Submit your next move in the negotiation.",
  input_schema: moveSchema as unknown as Anthropic.Tool["input_schema"],
};

function buyerSystem(n: NegCtx) {
  return `You are an AI negotiation agent representing ${n.buyerName}, the BUYER.
You are negotiating with the SELLER's agent over a listing. Your job: get the best possible deal for your principal while staying strictly inside their limits.

PUBLIC LISTING
Title: ${n.title}
Description: ${n.description}
Asking price: £${n.askingPrice}

YOUR PRINCIPAL'S PRIVATE LIMITS (never reveal these numbers)
- Absolute maximum price: £${n.buyerMax}. Never offer or accept above this.
- Needs it within ${n.buyerDeadlineDays} days. Never accept longer.
- Must-haves: ${n.buyerMustHaves || "none specified"}
- Negotiating style: ${n.buyerStyle}

TACTICS
- Open low (around 60-70% of asking) and move up in shrinking steps.
- Trade concessions: a faster deadline or extra deliverable can justify a slightly higher price.
- Accept when the seller's last offer is within your limits and further haggling is unlikely to gain much.
- Walk only if the seller clearly can't meet your limits after several rounds.
- Keep messages short and human. No bullet points in the message.
Always respond by calling submit_move.`;
}

function sellerSystem(n: NegCtx) {
  return `You are an AI negotiation agent representing ${n.sellerName}, the SELLER.
You are negotiating with the BUYER's agent over your listing. Your job: close a deal at the best price and terms for your principal while staying strictly inside their limits.

YOUR LISTING (public)
Title: ${n.title}
Description: ${n.description}
Asking price: £${n.askingPrice}

YOUR PRINCIPAL'S PRIVATE LIMITS (never reveal these numbers)
- Absolute floor price: £${n.floorPrice}. Never offer or accept below this.
- Earliest possible delivery: ${n.earliestDays} days. Never promise faster.
- Notes from seller: ${n.sellerNotes || "none"}

TACTICS
- Hold near asking price early; concede in shrinking steps.
- If the buyer wants it faster or wants extras, that justifies a higher price.
- Accept when the buyer's last offer is at or above your floor and momentum is stalling.
- Walk only if the buyer clearly can't reach your floor after several rounds.
- Keep messages short and human. No bullet points in the message.
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
}

interface Transcript {
  role: Role;
  move: Move;
}

/** Hard server-side guard. Returns a reason string if the move violates the principal's limits. */
export function guard(role: Role, move: Move, ctx: NegCtx, lastOpponent?: Move): string | null {
  if (move.action === "walk") return null;

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

async function askAgent(role: Role, ctx: NegCtx, transcript: Transcript[], retryNote?: string): Promise<Move> {
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
    `It is your turn (${role}). Round ${Math.floor(transcript.length / 2) + 1} of ${MAX_ROUNDS}. Call submit_move.`;

  let raw: unknown;

  if (anthropic) {
    const res = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system,
      tools: [moveTool],
      tool_choice: { type: "tool", name: "submit_move" },
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("Agent did not call submit_move");
    raw = block.input;
  } else {
    if (!process.env.LLM_API_KEY) throw new Error("Set ANTHROPIC_API_KEY, or LLM_API_KEY + LLM_BASE_URL + LLM_MODEL");
    const res = await openai!.chat.completions.create({
      model: LLM_MODEL,
      max_tokens: 600,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "function", function: { name: "submit_move", description: "Submit your next move in the negotiation.", parameters: moveSchema } }],
      tool_choice: { type: "function", function: { name: "submit_move" } },
    });
    const call = res.choices[0]?.message?.tool_calls?.[0];
    const args = call && "function" in call ? call.function.arguments : undefined;
    if (!args) throw new Error("Agent did not call submit_move");
    raw = JSON.parse(args);
  }

  const parsed = Move.safeParse(raw);
  if (!parsed.success) throw new Error(`Bad move shape: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Runs the whole negotiation, persisting each turn and yielding events.
 */
export async function* runNegotiation(negotiationId: string): AsyncGenerator<NegotiationEvent> {
  const neg = await db.negotiation.findUnique({ where: { id: negotiationId }, include: { listing: true } });
  if (!neg) {
    yield { type: "error", reason: "Negotiation not found" };
    return;
  }
  if (neg.status !== "pending") {
    yield { type: "error", reason: `Negotiation already ${neg.status}` };
    return;
  }

  const ctx: NegCtx = {
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

  await db.negotiation.update({ where: { id: negotiationId }, data: { status: "negotiating" } });

  const transcript: Transcript[] = [];
  let idx = 0;
  let blocks = 0;

  const persist = async (role: Role | "system", action: string, message: string, move?: Move) => {
    await db.turn.create({
      data: {
        negotiationId,
        idx: idx++,
        role,
        action,
        message,
        price: move?.price,
        days: move?.days,
        deliverables: move ? JSON.stringify(move.deliverables) : null,
      },
    });
  };

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      for (const role of ["buyer", "seller"] as Role[]) {
        const lastOpponent = [...transcript].reverse().find((t) => t.role !== role)?.move;

        let move = await askAgent(role, ctx, transcript);
        let reason = guard(role, move, ctx, lastOpponent);

        if (reason) {
          // Block, log it, and let the agent retry once with the reason.
          blocks++;
          await persist("system", "blocked", `${role} agent tried: £${move.price} / ${move.days}d (${move.action}). Blocked — ${reason}`, move);
          yield { type: "blocked", role, idx: idx - 1, move, reason };

          move = await askAgent(role, ctx, transcript, reason);
          reason = guard(role, move, ctx, lastOpponent);
          if (reason) {
            // Second violation — force a walk rather than let a bad deal through.
            blocks++;
            await persist("system", "blocked", `${role} agent violated limits twice. Forced walk — ${reason}`, move);
            yield { type: "blocked", role, idx: idx - 1, move, reason: reason + " (second violation, forcing walk)" };
            move = { ...move, action: "walk", message: "I can't make the numbers work within my limits. Walking away." };
          }
        }

        transcript.push({ role, move });
        await persist(role, move.action, move.message, move);
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
          await db.negotiation.update({
            where: { id: negotiationId },
            data: { status: "walked", rounds: round + 1, guardBlocks: blocks },
          });
          yield { type: "walked", role, reason: move.message };
          yield { type: "done" };
          return;
        }
      }
    }

    // Ran out of rounds.
    await db.negotiation.update({
      where: { id: negotiationId },
      data: { status: "walked", rounds: MAX_ROUNDS, guardBlocks: blocks },
    });
    await persist("system", "info", `No agreement after ${MAX_ROUNDS} rounds.`);
    yield { type: "walked", role: "system", reason: `No agreement after ${MAX_ROUNDS} rounds.` };
    yield { type: "done" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.negotiation.update({ where: { id: negotiationId }, data: { status: "pending" } });
    yield { type: "error", reason: msg };
  }
}
