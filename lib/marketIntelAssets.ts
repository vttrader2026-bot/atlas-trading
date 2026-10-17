// ATLAS MARKET INTELLIGENCE — curated asset registry
//
// Verification methodology (as of 2026-10-17): every asset below was checked
// for an active Binance Spot USDT pair with status "TRADING" via Binance's
// public exchangeInfo endpoint before being approved for display.
//
// Category evidence:
//   - grayscale:     Grayscale's official fund list (grayscale.com/funds)
//   - coinbase50:    official MarketVector COIN50 index factsheet
//                    (marketvector.com/factsheets/download/COIN50.d.pdf)
//   - worldLiberty:  World Liberty Financial's disclosed treasury holdings
//                    (public reporting, March 2025 disclosure). Stablecoins
//                    and wrapped/staked assets held in that treasury (USDT,
//                    USDC, WBTC, stETH, aEthUSDC) are intentionally excluded
//                    here — they are not meaningful for performance ranking.
//   - madeInUsa:     CoinGecko's community "Made in USA" tag. This is a
//                    NARRATIVE classification, not an official index —
//                    CoinGecko's full category lists 286 coins; this
//                    registry includes a curated subset of established,
//                    liquid names with credible U.S. founding/HQ ties. The
//                    page labels this category as narrative-based, distinct
//                    from the three official/evidence-backed categories.
//
// Assets considered but excluded — no active Binance USDT spot pair found on
// the verification date, or evidence too weak to confirm. Kept here as an
// audit trail rather than silently dropped; review again on a future pass:
//   IP       (Grayscale Story Trust)         — private trust, no spot pair
//   DEEP     (Grayscale DeepBook Trust)       — private trust, no spot pair
//   FLR      (Coinbase 50 factsheet: Flare)   — not on Binance spot
//   AKT      (Made in USA: Akash)             — not on Binance spot
//   KAS      (Made in USA: Kaspa)             — not on Binance spot
//   MNT      (World Liberty holding: Mantle)  — not on Binance spot
//   KTA      (World Liberty holding)          — not on Binance spot
//   COLLE    (World Liberty holding)          — not on Binance spot
//   USACOIN  (World Liberty holding)          — not on Binance spot, unverifiable project
//   GROK     (World Liberty holding)          — not on Binance spot, unverifiable project

export type AssetCategory = "grayscale" | "coinbase50" | "madeInUsa" | "worldLiberty";

export const CATEGORY_KEYS: AssetCategory[] = ["grayscale", "coinbase50", "madeInUsa", "worldLiberty"];

export const CATEGORY_META: Record<AssetCategory, { kind: "official" | "narrative" }> = {
  grayscale: { kind: "official" },
  coinbase50: { kind: "official" },
  worldLiberty: { kind: "official" },
  madeInUsa: { kind: "narrative" },
};

export type AssetEntry = {
  /** Base asset ticker, e.g. "BTC". Binance symbol is `${symbol}USDT`. */
  symbol: string;
  categories: AssetCategory[];
};

export const ASSET_REGISTRY: AssetEntry[] = [
  { symbol: "AAVE", categories: ["grayscale", "coinbase50"] },
  { symbol: "ADA", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "AERO", categories: ["madeInUsa"] },
  { symbol: "ALGO", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "APT", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "ARB", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "ARKM", categories: ["madeInUsa"] },
  { symbol: "ATOM", categories: ["coinbase50"] },
  { symbol: "AVAX", categories: ["grayscale", "coinbase50", "madeInUsa", "worldLiberty"] },
  { symbol: "BAT", categories: ["grayscale", "madeInUsa"] },
  { symbol: "BCH", categories: ["grayscale", "coinbase50"] },
  { symbol: "BLUR", categories: ["madeInUsa"] },
  { symbol: "BONK", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "BTC", categories: ["grayscale", "coinbase50"] },
  { symbol: "CHZ", categories: ["coinbase50"] },
  { symbol: "COMP", categories: ["madeInUsa"] },
  { symbol: "CRV", categories: ["coinbase50"] },
  { symbol: "DOGE", categories: ["grayscale", "coinbase50"] },
  { symbol: "DOT", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "DYDX", categories: ["madeInUsa"] },
  { symbol: "ENA", categories: ["coinbase50"] },
  { symbol: "ETC", categories: ["grayscale", "coinbase50"] },
  { symbol: "ETH", categories: ["grayscale", "coinbase50", "worldLiberty"] },
  { symbol: "ETHFI", categories: ["coinbase50"] },
  { symbol: "FET", categories: ["coinbase50"] },
  { symbol: "FIL", categories: ["grayscale", "madeInUsa"] },
  { symbol: "GALA", categories: ["madeInUsa"] },
  { symbol: "GRT", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "HBAR", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "ICP", categories: ["coinbase50"] },
  { symbol: "IMX", categories: ["coinbase50"] },
  { symbol: "INJ", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "IOTX", categories: ["madeInUsa"] },
  { symbol: "JASMY", categories: ["coinbase50"] },
  { symbol: "JUP", categories: ["madeInUsa"] },
  { symbol: "KAVA", categories: ["madeInUsa"] },
  { symbol: "LDO", categories: ["grayscale", "coinbase50"] },
  { symbol: "LINK", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "LPT", categories: ["grayscale"] },
  { symbol: "LTC", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "MANA", categories: ["grayscale", "coinbase50"] },
  { symbol: "MINA", categories: ["madeInUsa"] },
  { symbol: "MORPHO", categories: ["coinbase50"] },
  { symbol: "MOVE", categories: ["worldLiberty"] },
  { symbol: "NEAR", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "ONDO", categories: ["madeInUsa", "worldLiberty"] },
  { symbol: "OP", categories: ["grayscale", "madeInUsa"] },
  { symbol: "OSMO", categories: ["madeInUsa"] },
  { symbol: "PENDLE", categories: ["coinbase50"] },
  { symbol: "PENGU", categories: ["coinbase50"] },
  { symbol: "PEPE", categories: ["coinbase50"] },
  { symbol: "POL", categories: ["coinbase50"] },
  { symbol: "PYTH", categories: ["grayscale"] },
  { symbol: "QNT", categories: ["coinbase50"] },
  { symbol: "RENDER", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "SEI", categories: ["coinbase50", "madeInUsa", "worldLiberty"] },
  { symbol: "SHIB", categories: ["coinbase50"] },
  { symbol: "SKY", categories: ["coinbase50"] },
  { symbol: "SOL", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "STX", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "SUI", categories: ["grayscale", "madeInUsa"] },
  { symbol: "SXT", categories: ["grayscale"] },
  { symbol: "TAO", categories: ["grayscale"] },
  { symbol: "THETA", categories: ["madeInUsa"] },
  { symbol: "TIA", categories: ["coinbase50"] },
  { symbol: "TRX", categories: ["worldLiberty"] },
  { symbol: "UNI", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "VET", categories: ["coinbase50"] },
  { symbol: "W", categories: ["madeInUsa"] },
  { symbol: "WAL", categories: ["grayscale"] },
  { symbol: "WLD", categories: ["madeInUsa"] },
  { symbol: "WLFI", categories: ["madeInUsa", "worldLiberty"] },
  { symbol: "XLM", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "XRP", categories: ["grayscale", "coinbase50", "madeInUsa"] },
  { symbol: "XTZ", categories: ["coinbase50", "madeInUsa"] },
  { symbol: "ZEC", categories: ["grayscale", "madeInUsa"] },
  { symbol: "ZEN", categories: ["grayscale", "madeInUsa"] },
  { symbol: "ZRX", categories: ["madeInUsa"] },
];

export const TRACKED_SYMBOLS: string[] = ASSET_REGISTRY.map((a) => a.symbol);

export const ASSET_CATEGORY_MAP: Map<string, AssetCategory[]> = new Map(
  ASSET_REGISTRY.map((a) => [a.symbol, a.categories]),
);

/** The date the historical-performance baseline snapshot was first recorded. */
export const BASELINE_DATE = "2026-10-17";
