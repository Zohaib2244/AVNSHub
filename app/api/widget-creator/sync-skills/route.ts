import { NextResponse } from "next/server";
import { syncWidgetSkills } from "@/lib/widget-creator/skillSync.mjs";

export async function POST() {
  try {
    const written = await syncWidgetSkills();
    return NextResponse.json({ ok: true, written });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "failed to regenerate widget skills" },
      { status: 500 },
    );
  }
}
