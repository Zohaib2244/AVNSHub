import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Aladhan wants DD-MM-YYYY; the widget sends the caller's own local
// YYYY-MM-DD so the correct day is fetched regardless of where this
// server's clock/timezone sits relative to the browser.
function toAladhanDate(dateParam: string | null): string {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-");
    return `${d}-${m}-${y}`;
  }
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}`;
}

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  const city = req.nextUrl.searchParams.get("city");
  const aladhanDate = toAladhanDate(req.nextUrl.searchParams.get("date"));

  let url: string;
  if (lat && lon) {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, method: "4" });
    url = `https://api.aladhan.com/v1/timings/${aladhanDate}?${params.toString()}`;
  } else if (city && city.trim()) {
    const params = new URLSearchParams({ address: city.trim(), method: "4" });
    url = `https://api.aladhan.com/v1/timingsByAddress/${aladhanDate}?${params.toString()}`;
  } else {
    return NextResponse.json({ error: "Missing location parameters" }, { status: 400 });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Aladhan API error: ${res.status}`, detail: text }, { status: 502 });
    }
    const raw = await res.json();
    return NextResponse.json(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
