// ATLAS INVESTOR V1: the only supported assets. Order matches the product spec.
export type InvestorAsset = { ticker: string; name: string; pair: string };

const A = (ticker: string, name: string): InvestorAsset => ({ ticker, name, pair: `${ticker}USDT` });

export const INVESTOR_ASSETS: readonly InvestorAsset[] = [
  A("BTC", "Bitcoin"),
  A("ETH", "Ethereum"),
  A("SOL", "Solana"),
  A("XRP", "XRP"),
  A("HYPE", "Hyperliquid"),
  A("DOGE", "Dogecoin"),
  A("LINK", "Chainlink"),
  A("AVAX", "Avalanche"),
  A("HBAR", "Hedera"),
  A("LTC", "Litecoin"),
  A("BNB", "BNB"),
  A("DOT", "Polkadot"),
  A("SUI", "Sui"),
  A("NEAR", "NEAR Protocol"),
  A("TRX", "TRON"),
  A("ZEC", "Zcash"),
  A("ADA", "Cardano"),
];

export const TICKERS: readonly string[] = INVESTOR_ASSETS.map((a) => a.ticker);
export const isSupportedTicker = (t: unknown): t is string => typeof t === "string" && TICKERS.includes(t);
export const assetOf = (ticker: string) => INVESTOR_ASSETS.find((a) => a.ticker === ticker);

export function searchAssets(q: string): InvestorAsset[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...INVESTOR_ASSETS];
  return INVESTOR_ASSETS.filter((a) => a.ticker.toLowerCase().includes(s) || a.name.toLowerCase().includes(s));
}
