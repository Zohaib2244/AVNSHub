import { NextResponse } from "next/server";
import { isValidCustomWidgetId, registerCustomWidget } from "@/lib/widget-creator/customRegistry";

// Commits a brand-new widget the generate route deliberately left unregistered
// (see the comment above registerCustomWidget() in lib/widget-creator/customRegistry.ts).
// Fired by ChatCanvas's explicit "add to layout" click rather than happening
// automatically right after generation — wiring a new id into
// customComponentMap.tsx is the one write Next's Fast Refresh can't hot-swap,
// so the resulting full reload is deliberate and user-triggered here instead of
// tearing down the generate SSE stream mid-flight.
export async function POST(req: Request) {
  let body: { slug?: string; name?: string; icon?: string; sizes?: string[]; orientations?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const slug = body.slug;
  if (!slug || !isValidCustomWidgetId(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const result = registerCustomWidget({
    id: slug,
    name: body.name,
    icon: body.icon,
    sizes: body.sizes,
    orientations: body.orientations,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "registration failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
