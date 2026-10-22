"use client";

// ATLAS COIN EXPLORER — Phase 2: live candlestick updates for one coin's
// chart, via Binance's public per-symbol kline WebSocket stream.
//
// This mirrors lib/binanceStream.ts's connection/reconnect pattern but is
// scoped to a single symbol+interval at a time (one chart, one stream) and
// reference-counted so switching timeframes or navigating between coin
// pages tears down the old connection and opens exactly the stream the
// visible chart needs — never more than one at once.
//
// A live tick is lightly sanity-checked (finite numbers, valid OHLC
// relationships) before being handed to subscribers. A tick that fails
// those checks is dropped silently rather than applied — the chart keeps
// showing its last known-good candle instead of a corrupted one. This is
// NOT the full historical-batch validator from lib/marketDataValidation
// (duplicate/gap/ordering checks don't apply to a single streaming update);
// that runs server-side on the initial historical fetch instead.

import type { Candle, Interval } from "@/lib/marketDataTypes";

type RawKlinePayload = {
  k: {
    t: number; // kline start time
    T: number; // kline close time
    o: string;
    h: string;
    l: string;
    c: string;
    v: string; // base asset volume
    q: string; // quote asset volume
    x: boolean; // is this kline closed?
  };
};

export type StreamStatus = "connecting" | "live" | "reconnecting" | "closed";

type Listener = {
  onCandle: (candle: Candle) => void;
  onStatus: (status: StreamStatus) => void;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

type StreamState = {
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  status: StreamStatus;
  listeners: Set<Listener>;
};

const streams = new Map<string, StreamState>();

function key(symbol: string, interval: Interval): string {
  return `${symbol.toUpperCase()}:${interval}`;
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseTick(raw: unknown, nowMs: number): Candle | null {
  const payload = raw as Partial<RawKlinePayload>;
  const k = payload?.k;
  if (!k || typeof k !== "object") return null;

  const openTime = k.t;
  const closeTime = k.T;
  const open = Number(k.o);
  const high = Number(k.h);
  const low = Number(k.l);
  const close = Number(k.c);
  const volume = Number(k.v);
  const quoteVolume = Number(k.q);

  if (!isFiniteNum(openTime) || !isFiniteNum(closeTime)) return null;
  if (![open, high, low, close, volume, quoteVolume].every(isFiniteNum)) return null;
  if (high < open || high < close || high < low) return null;
  if (low > open || low > close || low > high) return null;
  if (volume < 0 || quoteVolume < 0) return null;

  return {
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume,
    quoteVolume,
    status: closeTime > nowMs || !k.x ? "forming" : "closed",
  };
}

function notifyStatus(state: StreamState) {
  for (const l of state.listeners) l.onStatus(state.status);
}

function connect(symbol: string, interval: Interval) {
  const id = key(symbol, interval);
  const state = streams.get(id);
  if (!state || state.ws || typeof window === "undefined") return;

  state.status = state.attempt === 0 ? "connecting" : "reconnecting";
  notifyStatus(state);

  const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);
  state.ws = ws;

  ws.onopen = () => {
    state.attempt = 0;
    state.status = "live";
    notifyStatus(state);
  };

  ws.onmessage = (event) => {
    let candle: Candle | null = null;
    try {
      candle = parseTick(JSON.parse(event.data), Date.now());
    } catch {
      candle = null;
    }
    if (!candle) return; // malformed/out-of-range tick — drop it, never fabricate
    for (const l of state.listeners) l.onCandle(candle);
  };

  ws.onclose = () => {
    state.ws = null;
    if (state.listeners.size === 0) return; // nobody's watching, don't reconnect
    state.status = "reconnecting";
    notifyStatus(state);
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** state.attempt, RECONNECT_MAX_MS);
    state.attempt += 1;
    state.reconnectTimer = setTimeout(() => connect(symbol, interval), delay);
  };

  ws.onerror = () => {
    ws.close();
  };
}

/**
 * Subscribes to live candle updates for one symbol+interval. Returns an
 * unsubscribe function. The underlying connection is shared by reference
 * count — the last unsubscribe for a given symbol/interval closes it.
 */
export function subscribeKline(
  symbol: string,
  interval: Interval,
  onCandle: (candle: Candle) => void,
  onStatus: (status: StreamStatus) => void
): () => void {
  const id = key(symbol, interval);
  let state = streams.get(id);
  if (!state) {
    state = { ws: null, reconnectTimer: null, attempt: 0, status: "connecting", listeners: new Set() };
    streams.set(id, state);
  }

  const listener: Listener = { onCandle, onStatus };
  state.listeners.add(listener);
  onStatus(state.status);
  connect(symbol, interval);

  return () => {
    const s = streams.get(id);
    if (!s) return;
    s.listeners.delete(listener);
    if (s.listeners.size === 0) {
      if (s.reconnectTimer) {
        clearTimeout(s.reconnectTimer);
        s.reconnectTimer = null;
      }
      s.ws?.close();
      s.ws = null;
      streams.delete(id);
    }
  };
}
