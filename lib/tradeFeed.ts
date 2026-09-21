export type PublishedTrade = {
  id: string;
  createdAt: number;
  pair: string;
  direction: "Long" | "Short";
  timeframe: string;
  entryZone: string;
  invalidation: string;
  tp1: string;
  tp2: string;
  tp3: string;
  reasoning: string;
};
