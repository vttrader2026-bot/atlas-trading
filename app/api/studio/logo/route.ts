// OWNER-ONLY-v1: same-origin proxy for the coin logos shown inside the Studio's virtual phones. The logo CDN sends no CORS
// headers, so the browser can DISPLAY its images but html-to-image cannot READ them, which made every PNG export fail.
// The export fetches logos through this route instead. Owner only; the host is fixed and the symbol is validated.
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export const LOGO_SYMBOL = /^[a-z0-9]{1,15}$/i;

export async function GET(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const symbol = new URL(req.url).searchParams.get("s") ?? "";
  if (!LOGO_SYMBOL.test(symbol)) return NextResponse.json({ error: "Bad symbol" }, { status: 400 });
  try {
    const res = await fetch(`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`, { signal: AbortSignal.timeout(8000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return NextResponse.json({ error: "Logo not available" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(await res.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    console.error("studio logo proxy failed", symbol, err);
    return NextResponse.json({ error: "Logo fetch failed" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
