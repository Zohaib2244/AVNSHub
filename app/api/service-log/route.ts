// SSE feed behind NutBot's realtime log. Server-Sent Events rather than
// polling because the underlying data is bursty then silent for hours —
// polling a feed that changes twice a day is exactly the waste the hub-data
// poller already demonstrates. One stream per open widget, all fanned out from
// a single shared Docker connection (see lib/nutbot/serviceLog.ts).

import { subscribe, type LogEvent, type LogSource } from "@/lib/nutbot/serviceLog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sources: LogSource[] = [];
  // lifecycle defaults on: a feed with neither source selected is just an
  // empty box, and lifecycle is the cheap one
  if (params.get("stdout") === "1") sources.push("stdout");
  if (params.get("lifecycle") !== "0" || sources.length === 0) sources.push("lifecycle");

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (event: LogEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      unsubscribe = subscribe(sources, write);

      // Proxies (Caddy sits in front of this on avns2) will drop a connection
      // that goes quiet, and this feed is quiet by design. A comment frame is
      // ignored by EventSource but keeps the socket warm.
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already torn down by the client disconnecting
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Caddy/nginx buffering would defeat the point of a live stream
      "X-Accel-Buffering": "no",
    },
  });
}
