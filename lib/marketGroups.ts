import type { AssetCategory } from "@/lib/marketIntelAssets";

// Visual identity for the four Market Intelligence groups. Colours are CSS
// variables defined (per theme) in app/globals.css; group definitions and
// membership live in lib/marketIntelAssets.ts and are not touched here.
export const GROUP_STYLE: Record<AssetCategory, { color: string; mark: string }> = {
  grayscale: { color: "var(--grp-grayscale)", mark: "G" },
  coinbase50: { color: "var(--grp-coinbase50)", mark: "C" },
  madeInUsa: { color: "var(--grp-madeInUsa)", mark: "★" },
  worldLiberty: { color: "var(--grp-worldLiberty)", mark: "W" },
};
// UI-REDESIGN-2000
