// Server-only client for CoinMarketCap's Pro API. Never import this from a
// "use client" file - it reads COINMARKETCAP_API_KEY from the environment.
//
// Endpoints (confirmed against CoinMarketCap's own API reference and the
// "Keyless Public API" guide as of 2026-10-18, which lists these exact
// paths under the keyed Standard API):
//   GET /v3/fear-and-greed/latest
//   GET /v1/altcoin-season-index/latest
//   GET /v1/global-metrics/quotes/latest
// All three require the X-CMC_PRO_API_KEY header. CoinMarketCap also
// exposes a keyless "/public-api" prefixed path for these, but their own
// docs describe that path as "intended for evaluation and shared public
// access, not production traffic" - so production here always uses the
// keyed path with COINMARKETCAP_API_KEY.
//
// Field-name note: Global Metrics' response shape is fully confirmed
// against CMC's reference page (btc_dominance, eth_dominance,
// quote.USD.total_market_cap, quote.USD.total_volume_24h, last_updated).
// Fear & Greed's exact field names (value / value_classification /
// update_time) are inferred from CMC's own published API sample and
// charts-page copy, since their per-endpoint reference page couldn't be
// fetched directly in this session. Altcoin Season Index's precise field
// name for the index value is not publicly confirmed anywhere reachable
// in this session, so parseAltcoinSeason() below checks several plausible
// key names defensively rather than assuming one. If the live key's
// response uses a different key, extend CANDIDATE_INDEX_KEYS below -
// nothing is fabricated if no known key matches, it's just reported
// unavailable.

const BASE = "https://pro-api.coinmarketcap.com";

function apiKey(): string | null {
  const key = process.env.COINMARKETCAP_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

async function cmcGet(path: string): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("COINMARKETCAP_API_KEY not configured");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { status?: { error_message?: string } };
      detail = body?.status?.error_message || "";
    } catch {
      /* ignore - not all error bodies are JSON */
    }
    throw new Error(`CoinMarketCap ${path} returned ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export type FearGreed = {
  value: number;
  classification: string | null;
  updateTime: string | null;
};

export async function getFearGreed(): Promise<FearGreed> {
  const json = obj(await cmcGet("/v3/fear-and-greed/latest"));
  const data = obj(json?.data) ?? {};
  const value = num(data.value);
  if (value === null) throw new Error("fear-and-greed response missing a numeric value");
  return {
    value,
    classification: str(data.value_classification),
    updateTime: str(data.update_time) ?? str(data.last_updated),
  };
}

export type AltcoinSeasonPhase = "altSeason" | "btcSeason" | "mixed";

export type AltcoinSeason = {
  value: number;
  /** CMC's own label, only when the response actually provided one. */
  apiClassification: string | null;
  /**
   * Our label, derived from CMC's own published methodology (>=75 =>
   * Altcoin Season, <=25 => Bitcoin Season, otherwise mixed) - used only
   * when the API itself doesn't supply a classification string.
   */
  derivedPhase: AltcoinSeasonPhase;
  lastUpdated: string | null;
};

// Plausible key names for the index value across CMC API versions/response
// shapes - see the field-name note at the top of this file.
const CANDIDATE_INDEX_KEYS = ["altcoinIndex", "altcoin_index", "altSeasonIndex", "index", "value"];
const CANDIDATE_CLASSIFICATION_KEYS = ["classification", "value_classification", "status", "season"];
const CANDIDATE_TIME_KEYS = ["last_updated", "lastUpdated", "update_time", "timestamp"];

export async function getAltcoinSeason(): Promise<AltcoinSeason> {
  const json = obj(await cmcGet("/v1/altcoin-season-index/latest"));
  // Response is typically `{ data: {...} }`, but be tolerant of
  // `{ data: [{...}, ...] }` (most-recent-first) too.
  const rawData = json?.data;
  const point = obj(rawData) ?? (Array.isArray(rawData) ? obj(rawData[0]) : null) ?? {};

  let value: number | null = null;
  for (const key of CANDIDATE_INDEX_KEYS) {
    value = num(point[key]);
    if (value !== null) break;
  }
  if (value === null) throw new Error("altcoin-season-index response did not match any known value field");

  let apiClassification: string | null = null;
  for (const key of CANDIDATE_CLASSIFICATION_KEYS) {
    apiClassification = str(point[key]);
    if (apiClassification) break;
  }

  let lastUpdated: string | null = null;
  for (const key of CANDIDATE_TIME_KEYS) {
    lastUpdated = str(point[key]);
    if (lastUpdated) break;
  }

  const derivedPhase: AltcoinSeasonPhase = value >= 75 ? "altSeason" : value <= 25 ? "btcSeason" : "mixed";

  return { value, apiClassification, derivedPhase, lastUpdated };
}

export type GlobalMetrics = {
  btcDominance: number;
  ethDominance: number;
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  /** Not confirmed present on every account/plan - null when absent. */
  totalMarketCapChange24hPct: number | null;
  lastUpdated: string | null;
};

export async function getGlobalMetrics(): Promise<GlobalMetrics> {
  const json = obj(await cmcGet("/v1/global-metrics/quotes/latest"));
  const data = obj(json?.data) ?? {};
  const quote = obj(data.quote) ?? {};
  const usd = obj(quote.USD) ?? {};

  const btcDominance = num(data.btc_dominance);
  const ethDominance = num(data.eth_dominance);
  const totalMarketCapUsd = num(usd.total_market_cap);
  const totalVolume24hUsd = num(usd.total_volume_24h);
  if (btcDominance === null || ethDominance === null || totalMarketCapUsd === null || totalVolume24hUsd === null) {
    throw new Error("global-metrics response missing required fields");
  }

  return {
    btcDominance,
    ethDominance,
    totalMarketCapUsd,
    totalVolume24hUsd,
    totalMarketCapChange24hPct: num(usd.total_market_cap_yesterday_percentage_change),
    lastUpdated: str(data.last_updated),
  };
}
