import { runNegotiation } from "@/lib/negotiate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const ev of runNegotiation(id)) {
          send(ev);
          if (ev.type === "done" || ev.type === "error") break;
        }
      } catch (e) {
        send({ type: "error", reason: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
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
