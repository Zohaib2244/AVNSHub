import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  const rows = await prisma.kV.findMany({ where: { key: { startsWith: "nutbot-usage:" } }, orderBy: { updatedAt: "desc" }, take: 200 });
  return Response.json(rows.map((row) => JSON.parse(row.value)));
}
