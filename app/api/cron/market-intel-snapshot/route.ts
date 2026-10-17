import { NextRequest, NextResponse } from "next/server";
import { getAllTickers24h } from "@/lib/binance";
import { TRACKED_SYMBOLS } from "@/lib/marketIntelAssets";
import { writeDailySnapshot } from "@/lib/marketIntelSnapshots";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const tickers = await getAllTickers24h();
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    const prices: Record<string, number> = {};
    for (const sym of TRACKED_SYMBOLS) {
      const t = tickerMap.get(`${sym}USDT`);
      if (t) prices[sym] = parseFloat(t.lastPrice);
    }
    const btc = tickerMap.get("BTCUSDT");
    const btcPrice = btc ? parseFloat(btc.lastPrice) : 0;

    const snapshot = await writeDailySnapshot(prices, btcPrice);
    return NextResponse.json({
      ok: true,
      assetsRecorded: Object.keys(prices).length,
      date: snapshot?.date ?? null,
    });
  } catch (err) {
    console.error("market-intel-snapshot cron failed", err);
    return NextResponse.json({ ok: false, error: "snapshot_failed" }, { status: 500 });
  }
}
