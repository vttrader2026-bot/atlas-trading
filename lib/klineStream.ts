// ATLAS CHARTS — Phase 1: isolated Binance Spot kline (candlestick) WebSocket.
//
// Deliberately separate from lib/binanceStream.ts (the shared 24h-ticker
// stream used by the ticker strip and Radar), which is untouched. One
// stream = one socket for one symbol + interval, owned by the chart page and
// closed when the symbol/timeframe changes or the page unmounts.
//
// Public market data only: no API key. Nothing here fabricates candles —
// every incoming frame is validated and a frame that fails any check is
// dropped.

import { isSupportedInterval, type Interval } from "@/lib/marketDataTypes";

/** One live kline update, already validated. `closed` is Binance's own `x` flag. */
export type LiveKline = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  closed: boolean;
};

export type StreamStatus = "connecting" | "live" | "reconnecting" | "closed";

/** Binance documents both ports for the same endpoint; 443 is the fallback when 9443 is blocked. */
export const KLINE_WS_HOSTS = ["wss://stream.binance.com:9443", "wss://stream.binance.com:443"] as const;

export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30_000;
/** Binance closes every connection after 24 h. Rotate well before that so it never drops mid-candle unexpectedly. */
export const MAX_LIFETIME_MS = 23 * 60 * 60 * 1000;

const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

/** Throws on anything that is not a plain uppercase symbol + supported interval — never builds a URL from arbitrary input. */
export function klineStreamUrl(symbol: string, interval: string, host: string = KLINE_WS_HOSTS[0]): string {
  if (!SYMBOL_RE.test(symbol)) throw new Error(`Invalid symbol "${symbol}"`);
  if (!isSupportedInterval(interval)) throw new Error(`Unsupported interval "${interval}"`);
  return `${host}/ws/${symbol.toLowerCase()}@kline_${interval}`;
}

function num(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parses one raw WebSocket payload (JSON text or an already-parsed object)
 * into a LiveKline, or returns null if it is not a well-formed kline event
 * for exactly the expected symbol and interval. Accepts both the raw-stream
 * shape and the combined-stream `{ stream, data }` wrapper.
 */
export function parseKlineMessage(raw: unknown, expect: { symbol: string; interval: Interval }): LiveKline | null {
  let msg: unknown = raw;
  if (typeof msg === "string") {
    try {
      msg = JSON.parse(msg);
    } catch {
      return null;
    }
  }
  if (!msg || typeof msg !== "object") return null;
  const wrapped = (msg as { data?: unknown }).data;
  if (wrapped && typeof wrapped === "object") msg = wrapped;

  const m = msg as { e?: unknown; s?: unknown; k?: unknown };
  if (m.e !== "kline") return null;
  const k = m.k as Record<string, unknown> | null | undefined;
  if (!k || typeof k !== "object") return null;

  if (k.s !== expect.symbol || k.i !== expect.interval) return null;

  const openTime = k.t;
  const closeTime = k.T;
  if (typeof openTime !== "number" || !Number.isFinite(openTime)) return null;
  if (typeof closeTime !== "number" || !Number.isFinite(closeTime) || closeTime <= openTime) return null;

  const open = num(k.o);
  const high = num(k.h);
  const low = num(k.l);
  const close = num(k.c);
  const volume = num(k.v);
  const quoteVolume = num(k.q);
  if (open === null || high === null || low === null || close === null || volume === null || quoteVolume === null) return null;
  if (volume < 0 || quoteVolume < 0) return null;
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  if (high < low || high < open || high < close || low > open || low > close) return null;
  if (typeof k.x !== "boolean") return null;

  return { openTime, closeTime, open, high, low, close, volume, quoteVolume, closed: k.x };
}

/** Delay before reconnect attempt number `attempt` (0-based): exponential, capped, with up to 25% jitter. */
export function backoffDelay(attempt: number, random: number = Math.random()): number {
  const base = Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_MS);
  return Math.round(base * (1 + 0.25 * Math.min(1, Math.max(0, random))));
}

// Minimal structural type so tests can inject a fake socket.
export type SocketLike = {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
};
export type SocketFactory = (url: string) => SocketLike;

const WS_OPEN = 1;

export type KlineStreamOptions = {
  symbol: string;
  interval: Interval;
  onKline: (k: LiveKline) => void;
  onStatus?: (s: StreamStatus) => void;
  /** Called after any reconnect (not the first connect): candles may have been missed, so the caller should reload history. */
  onResync?: () => void;
  createSocket?: SocketFactory;
  maxLifetimeMs?: number;
  random?: () => number;
};

export type KlineStream = {
  /** Permanently closes the stream: socket, timers and handlers. Safe to call more than once. */
  close(): void;
  /** If not currently connected, skips any pending backoff and reconnects now (used when the tab becomes visible or the network returns). */
  kick(): void;
};

export function createKlineStream(opts: KlineStreamOptions): KlineStream {
  const { symbol, interval, onKline } = opts;
  const lifetime = opts.maxLifetimeMs ?? MAX_LIFETIME_MS;
  const random = opts.random ?? Math.random;
  const factory: SocketFactory = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);

  let closed = false;
  let ws: SocketLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let hostIndex = 0;
  let everOpened = false;
  let status: StreamStatus | null = null;

  const setStatus = (s: StreamStatus) => {
    if (status === s) return;
    status = s;
    opts.onStatus?.(s);
  };

  const clearTimers = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (lifetimeTimer) clearTimeout(lifetimeTimer);
    reconnectTimer = null;
    lifetimeTimer = null;
  };

  const detach = (sock: SocketLike) => {
    sock.onopen = null;
    sock.onmessage = null;
    sock.onclose = null;
    sock.onerror = null;
  };

  function scheduleReconnect(delay: number) {
    if (closed) return;
    setStatus("reconnecting");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (closed || ws) return; // never two sockets at once
    let sock: SocketLike;
    try {
      sock = factory(klineStreamUrl(symbol, interval, KLINE_WS_HOSTS[hostIndex % KLINE_WS_HOSTS.length]));
    } catch {
      attempt += 1;
      hostIndex += 1;
      scheduleReconnect(backoffDelay(attempt - 1, random()));
      return;
    }
    ws = sock;
    if (!everOpened) setStatus("connecting");

    sock.onopen = () => {
      if (closed || ws !== sock) return;
      attempt = 0;
      setStatus("live");
      const reconnected = everOpened;
      everOpened = true;
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      lifetimeTimer = setTimeout(() => {
        // Planned rotation before Binance's 24 h cut-off: drop this socket and reconnect immediately.
        if (closed || ws !== sock) return;
        detach(sock);
        ws = null;
        try {
          sock.close();
        } catch {
          /* already closed */
        }
        scheduleReconnect(0);
      }, lifetime);
      if (reconnected) opts.onResync?.();
    };

    sock.onmessage = (ev) => {
      if (closed || ws !== sock) return;
      const k = parseKlineMessage(ev.data, { symbol, interval });
      if (k) onKline(k);
    };

    sock.onerror = () => {
      // An error is always followed by close; let onclose own the reconnect so we never schedule twice.
      try {
        sock.close();
      } catch {
        /* ignore */
      }
    };

    sock.onclose = () => {
      if (ws !== sock) return;
      detach(sock);
      ws = null;
      if (lifetimeTimer) clearTimeout(lifetimeTimer);
      lifetimeTimer = null;
      if (closed) return;
      const delay = backoffDelay(attempt, random());
      attempt += 1;
      hostIndex += 1; // alternate :9443 / :443 on consecutive failures
      scheduleReconnect(delay);
    };
  }

  connect();

  return {
    close() {
      if (closed) return;
      closed = true;
      clearTimers();
      const sock = ws;
      ws = null;
      if (sock) {
        detach(sock);
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }
      setStatus("closed");
    },
    kick() {
      if (closed) return;
      if (ws && ws.readyState === WS_OPEN) return;
      if (ws) return; // a connection attempt is already in flight
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    },
  };
}
