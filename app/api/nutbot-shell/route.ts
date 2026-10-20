// NutBot integrated shell endpoint.
//   GET  ?session=<id>           → Server-Sent Events stream of pty output
//   POST { action: "create" }    → spawn a pty, returns { session }
//   POST { action: "input", session, data }
//   POST { action: "resize", session, cols, rows }
//   POST { action: "kill", session }
//
// node-pty is a native addon, so this route must run on the Node.js runtime.

import {
  createSession,
  getSession,
  subscribeSession,
  writeSession,
  resizeSession,
  killSession,
  shellDisabled,
} from "@/lib/nutbot/ptyHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse() {
  return Response.json({ error: "shell disabled (NUTBOT_SHELL_DISABLED=true)" }, { status: 403 });
}

export async function GET(request: Request) {
  if (shellDisabled()) return disabledResponse();

  const id = new URL(request.url).searchParams.get("session");
  const session = id ? getSession(id) : null;
  if (!id || !session) return new Response("no such session", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // JSON-encode each chunk so arbitrary control bytes / newlines can't break
      // SSE framing; the client JSON.parses it back before writing to xterm.
      const send = (chunk: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      // replay recent scrollback so a (re)connect shows existing output
      for (const chunk of session.buffer) send(chunk);

      const listener = (chunk: string) => {
        try { send(chunk); } catch { /* controller closed — cleanup runs via cancel */ }
      };
      unsubscribe = subscribeSession(id, listener);

      // heartbeat keeps intermediaries from closing an idle stream
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { clearInterval(ping); }
      }, 30_000);
      const stop = unsubscribe;
      unsubscribe = () => { clearInterval(ping); stop(); };
    },
    cancel() {
      unsubscribe();
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

export async function POST(request: Request) {
  if (shellDisabled()) return disabledResponse();

  let body: { action?: string; session?: string; data?: string; cols?: number; rows?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  switch (body.action) {
    case "create":
      return Response.json({ session: createSession() });
    case "input":
      if (!body.session || typeof body.data !== "string") {
        return Response.json({ error: "missing session/data" }, { status: 400 });
      }
      return Response.json({ ok: writeSession(body.session, body.data) });
    case "resize":
      if (!body.session) return Response.json({ error: "missing session" }, { status: 400 });
      resizeSession(body.session, Number(body.cols), Number(body.rows));
      return Response.json({ ok: true });
    case "kill":
      if (body.session) killSession(body.session);
      return Response.json({ ok: true });
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
