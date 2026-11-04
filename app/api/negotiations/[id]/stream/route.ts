import { runNegotiation } from "@/lib/negotiate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // If the client disconnects, enqueue throws. Swallow it and keep driving the run so the negotiation
      // completes server-side; a reconnecting client attaches to it (see runNegotiation).
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* client gone */ }
      };
      try {
        for await (const ev of runNegotiation(id)) {
          send(ev);
          if (ev.type === "done" || ev.type === "error") break;
        }
      } catch (e) {
        send({ type: "error", reason: e instanceof Error ? e.message : String(e) });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
