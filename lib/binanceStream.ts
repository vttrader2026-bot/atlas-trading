"use client";

import { getAllTickers24h, Ticker24h } from "@/lib/binance";

// Shared, singleton WebSocket connection to Binance's public combined ticker
// stream. Replaces REST polling: Binance pushes a full array of 24h stats for
// every symbol roughly once a second, so every subscriber (TickerStrip,
// Radar, ...) reads from one connection instead of each polling REST on its
// own timer. No API key required - this is a public market-data stream.

type Listener = (tickers: Record<string, Ticker24h>) => void;

type RawTicker = {
  s: string; // symbol
  c: string; // last price
  P: string; // price change percent
  h: string; // high price
  l: string; // low price
  q: string; // quote volume
};

const WS_URL = "wss://stream.binance.com:9443/ws/!ticker@arr";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let bootstrapped = false;
let cache: Record<string, Ticker24h> = {};
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l(cache);
}

function mergeRest(all: Ticker24h[]) {
  // Only fill in symbols the WebSocket hasn't already updated, so a slower
  // REST response never overwrites fresher live data.
  for (const t of all) {
    if (!cache[t.symbol]) cache[t.symbol] = t;
  }
  notify();
}

async function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const all = await getAllTickers24h();
    mergeRest(all);
  } catch {
    bootstrapped = false; // allow a retry on the next subscribe
  }
}

function connect() {
  if (typeof window === "undefined" || ws) return;
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    attempt = 0;
  };

  ws.onmessage = (event) => {
    try {
      const raw = JSON.parse(event.data) as RawTicker[];
      for (const t of raw) {
        if (!t.s.endsWith("USDT")) continue;
        cache[t.s] = {
          symbol: t.s,
          lastPrice: t.c,
          priceChangePercent: t.P,
          highPrice: t.h,
          lowPrice: t.l,
          quoteVolume: t.q,
        };
      }
      notify();
    } catch {
      // ignore a malformed frame, next tick will arrive shortly
    }
  };

  ws.onclose = () => {
    ws = null;
    if (listeners.size === 0) return; // nobody's listening, don't reconnect
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

/** Subscribe to live ticker updates. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (Object.keys(cache).length > 0) listener(cache);
  bootstrap();
  connect();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
      ws = null;
    }
  };
}

export function getCachedTickers(): Record<string, Ticker24h> {
  return cache;
}
