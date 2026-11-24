// ATLAS CHARTS — Phase 1: kline stream validation, reconnect/backoff, lifetime rotation, cleanup, live-candle merging.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KLINE_WS_HOSTS,
  MAX_LIFETIME_MS,
  RECONNECT_MAX_MS,
  backoffDelay,
  createKlineStream,
  klineStreamUrl,
  parseKlineMessage,
  type LiveKline,
  type SocketLike,
} from "@/lib/klineStream";
import { applyLiveKline, baseOfUsdtSymbol, errorKeyForCode, parseChartParams, CHART_MAX_CANDLES } from "@/lib/chartLive";
import type { Candle } from "@/lib/marketDataTypes";

const E = { symbol: "BTCUSDT", interval: "1h" } as const;
const frame = (over: Record<string, unknown> = {}, k: Record<string, unknown> = {}) => ({
  e: "kline",
  E: 1,
  s: "BTCUSDT",
  k: { t: 1000, T: 3_600_999, s: "BTCUSDT", i: "1h", o: "100", h: "110", l: "90", c: "105", v: "12.5", q: "1300", x: false, ...k },
  ...over,
});

describe("klineStreamUrl", () => {
  it("builds the documented lowercase kline stream path", () => {
    expect(klineStreamUrl("BTCUSDT", "1h")).toBe("wss://stream.binance.com:9443/ws/btcusdt@kline_1h");
    expect(klineStreamUrl("ETHUSDT", "1w", KLINE_WS_HOSTS[1])).toBe("wss://stream.binance.com:443/ws/ethusdt@kline_1w");
  });
  it("refuses arbitrary symbols and unsupported intervals", () => {
    expect(() => klineStreamUrl("btcusdt", "1h")).toThrow();
    expect(() => klineStreamUrl("BTC/USDT", "1h")).toThrow();
    expect(() => klineStreamUrl("BTCUSDT@trade", "1h")).toThrow();
    expect(() => klineStreamUrl("BTCUSDT", "1m")).toThrow();
  });
});

describe("parseKlineMessage", () => {
  it("parses a valid frame (object or JSON text) and the combined-stream wrapper", () => {
    const k = parseKlineMessage(frame(), E)!;
    expect(k).toMatchObject({ openTime: 1000, open: 100, high: 110, low: 90, close: 105, volume: 12.5, quoteVolume: 1300, closed: false });
    expect(parseKlineMessage(JSON.stringify(frame()), E)).toEqual(k);
    expect(parseKlineMessage({ stream: "btcusdt@kline_1h", data: frame() }, E)).toEqual(k);
  });
  it("rejects wrong event, symbol, interval and non-objects", () => {
    expect(parseKlineMessage(frame({ e: "trade" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { s: "ETHUSDT" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { i: "4h" }), E)).toBeNull();
    expect(parseKlineMessage("not json", E)).toBeNull();
    expect(parseKlineMessage(null, E)).toBeNull();
    expect(parseKlineMessage(42, E)).toBeNull();
    expect(parseKlineMessage({ e: "kline" }, E)).toBeNull();
  });
  it("rejects malformed numbers, inconsistent OHLC, negative volume and bad times", () => {
    expect(parseKlineMessage(frame({}, { o: "abc" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { c: "" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { h: "50" }), E)).toBeNull(); // high below low/open
    expect(parseKlineMessage(frame({}, { l: "120" }), E)).toBeNull(); // low above open/high
    expect(parseKlineMessage(frame({}, { v: "-1" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { o: "0" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { t: "1000" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { T: 1000 }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { x: "true" }), E)).toBeNull();
    expect(parseKlineMessage(frame({}, { q: undefined }), E)).toBeNull();
  });
});

describe("backoffDelay", () => {
  it("grows exponentially, is capped, and adds at most 25% jitter", () => {
    expect(backoffDelay(0, 0)).toBe(1000);
    expect(backoffDelay(1, 0)).toBe(2000);
    expect(backoffDelay(3, 0)).toBe(8000);
    expect(backoffDelay(20, 0)).toBe(RECONNECT_MAX_MS);
    expect(backoffDelay(0, 1)).toBe(1250);
    expect(backoffDelay(20, 1)).toBe(RECONNECT_MAX_MS * 1.25);
  });
});

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  closeCalls = 0;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.closeCalls += 1;
    this.readyState = 3;
    // Real sockets fire onclose asynchronously after close(); the stream detaches handlers first when it closes on purpose.
    queueMicrotask(() => this.onclose?.({}));
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
}
const factory = (url: string) => new FakeSocket(url);
const live = () => FakeSocket.all.filter((s) => s.readyState !== 3);

describe("createKlineStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
  });
  afterEach(() => vi.useRealTimers());

  const make = (extra: Partial<Parameters<typeof createKlineStream>[0]> = {}) => {
    const klines: LiveKline[] = [];
    const statuses: string[] = [];
    const onResync = vi.fn();
    const stream = createKlineStream({
      symbol: "BTCUSDT",
      interval: "1h",
      onKline: (k) => klines.push(k),
      onStatus: (s) => statuses.push(s),
      onResync,
      createSocket: factory,
      random: () => 0,
      ...extra,
    });
    return { stream, klines, statuses, onResync };
  };

  it("opens one socket to the right URL and delivers only valid frames", () => {
    const { klines, statuses } = make();
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].url).toBe("wss://stream.binance.com:9443/ws/btcusdt@kline_1h");
    FakeSocket.all[0].open();
    FakeSocket.all[0].send(JSON.stringify(frame()));
    FakeSocket.all[0].send("garbage");
    FakeSocket.all[0].send(JSON.stringify(frame({}, { s: "ETHUSDT" })));
    expect(klines).toHaveLength(1);
    expect(statuses).toEqual(["connecting", "live"]);
  });

  it("reconnects with exponential backoff, alternates host, resets after open, and resyncs", async () => {
    const { onResync, statuses } = make();
    FakeSocket.all[0].open();
    expect(onResync).not.toHaveBeenCalled(); // first connect needs no resync
    FakeSocket.all[0].drop();
    expect(statuses.at(-1)).toBe("reconnecting");
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[1].url).toContain(":443/ws/"); // fell back to the other port
    FakeSocket.all[1].drop(); // fails before opening -> next delay doubles
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(3);
    FakeSocket.all[2].open();
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("live");
    FakeSocket.all[2].drop(); // attempt counter was reset by the successful open
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  it("error handling does not create a second reconnect", () => {
    make();
    FakeSocket.all[0].open();
    FakeSocket.all[0].onerror?.({});
    vi.advanceTimersByTime(0);
    return Promise.resolve().then(() => {
      vi.advanceTimersByTime(1000);
      expect(live().length).toBeLessThanOrEqual(1);
      expect(FakeSocket.all).toHaveLength(2);
    });
  });

  it("rotates the connection before Binance's 24 h limit and resyncs", () => {
    const { onResync } = make();
    expect(MAX_LIFETIME_MS).toBeLessThan(24 * 60 * 60 * 1000);
    FakeSocket.all[0].open();
    vi.advanceTimersByTime(MAX_LIFETIME_MS - 1);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all[0].closeCalls).toBe(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1].open();
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("close() stops everything: no reconnect, no more messages, timers cleared, idempotent", () => {
    const { stream, klines, statuses } = make();
    const sock = FakeSocket.all[0];
    sock.open();
    stream.close();
    stream.close();
    expect(sock.closeCalls).toBe(1);
    sock.send(JSON.stringify(frame()));
    expect(klines).toHaveLength(0);
    vi.advanceTimersByTime(MAX_LIFETIME_MS + 60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(statuses.at(-1)).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("close() while a reconnect is pending cancels it", () => {
    const { stream } = make();
    FakeSocket.all[0].open();
    FakeSocket.all[0].drop();
    stream.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("kick() reconnects immediately only when disconnected and never opens a second socket", () => {
    const { stream } = make();
    FakeSocket.all[0].open();
    stream.kick();
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.all[0].drop();
    stream.kick();
    expect(FakeSocket.all).toHaveLength(2);
    stream.kick(); // second socket still connecting
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(2); // the pending backoff timer was cancelled by kick
  });
});

const candle = (i: number, over: Partial<Candle> = {}): Candle => ({
  openTime: i * 3_600_000,
  closeTime: i * 3_600_000 + 3_599_999,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1,
  quoteVolume: 100,
  status: "closed",
  ...over,
});
const lk = (i: number, over: Partial<LiveKline> = {}): LiveKline => ({
  openTime: i * 3_600_000,
  closeTime: i * 3_600_000 + 3_599_999,
  open: 100,
  high: 120,
  low: 95,
  close: 118,
  volume: 5,
  quoteVolume: 500,
  closed: false,
  ...over,
});

describe("applyLiveKline", () => {
  const base = [candle(1), candle(2), candle(3, { status: "forming" })];
  it("replaces the forming candle when the open time matches, without mutating the input", () => {
    const r = applyLiveKline(base, lk(3), "1h");
    expect(r.kind).toBe("update");
    if (r.kind !== "update") return;
    expect(r.candles).toHaveLength(3);
    expect(r.candles[2].close).toBe(118);
    expect(r.candles[2].status).toBe("forming");
    expect(base[2].close).toBe(105);
  });
  it("appends the next candle and marks closed ones", () => {
    const r = applyLiveKline(base, lk(4, { closed: true }), "1h");
    expect(r.kind).toBe("append");
    if (r.kind === "append") {
      expect(r.candles).toHaveLength(4);
      expect(r.candle.status).toBe("closed");
    }
  });
  it("ignores older candles and reports gaps (e.g. after a long disconnect)", () => {
    expect(applyLiveKline(base, lk(2), "1h").kind).toBe("stale");
    expect(applyLiveKline(base, lk(5), "1h").kind).toBe("gap");
    expect(applyLiveKline([], lk(1), "1h").kind).toBe("gap");
  });
  it("caps memory", () => {
    const many = Array.from({ length: CHART_MAX_CANDLES }, (_, i) => candle(i + 1));
    const r = applyLiveKline(many, lk(CHART_MAX_CANDLES + 1), "1h");
    expect(r.kind === "append" && r.candles.length).toBe(CHART_MAX_CANDLES);
  });
});

describe("chart params and errors", () => {
  it("validates symbol and timeframe from the URL, falling back to BTCUSDT / 1h", () => {
    expect(parseChartParams("?symbol=ethusdt&tf=4H")).toEqual({ symbol: "ETHUSDT", interval: "4h" });
    expect(parseChartParams("?symbol=sol/usdt&tf=1w")).toEqual({ symbol: "SOLUSDT", interval: "1w" });
    expect(parseChartParams("")).toEqual({ symbol: "BTCUSDT", interval: "1h" });
    expect(parseChartParams("?symbol=<script>&tf=1m")).toEqual({ symbol: "BTCUSDT", interval: "1h" });
    expect(parseChartParams("?symbol=BTCEUR")).toEqual({ symbol: "BTCUSDT", interval: "1h" });
  });
  it("splits a USDT symbol and maps API error codes to messages", () => {
    expect(baseOfUsdtSymbol("BTCUSDT")).toBe("BTC");
    expect(baseOfUsdtSymbol("BTCEUR")).toBeNull();
    expect(errorKeyForCode("UNSUPPORTED_PAIR")).toBe("unsupportedPair");
    expect(errorKeyForCode("NETWORK_ERROR")).toBe("network");
    expect(errorKeyForCode("UPSTREAM_UNAVAILABLE")).toBe("unavailable");
  });
});
