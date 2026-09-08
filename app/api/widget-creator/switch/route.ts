import { answerSwitch } from "@/lib/widget-creator/switchApproval";
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (typeof body?.id !== "string" || typeof body?.approved !== "boolean") return Response.json({ error: "Invalid decision" }, { status: 400 });
  return Response.json({ ok: answerSwitch(body.id, body.approved) });
}
