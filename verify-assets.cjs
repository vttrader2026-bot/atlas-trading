// Atlas Market Intelligence — asset verification script
// Checks each candidate ticker against Binance Spot (USDT pair) exchangeInfo.
// Run with: node verify-assets.cjs
// Prints a CSV-style report to stdout — paste the full output back.

const https = require("https");

// ticker -> categories (G=Grayscale Trust, C=Coinbase 50 Index, M=Made in USA, W=World Liberty Financial)
const CANDIDATES = {
  AAVE: "G,C", ADA: "C,M", AERO: "M", AKT: "M", ALGO: "C,M", APT: "C,M", ARB: "C,M",
  ARKM: "M", ATOM: "C", AVAX: "G,C,M,W", BAT: "G,M", BCH: "G,C", BLUR: "M", BONK: "C,M",
  BTC: "G,C", CHZ: "C", COLLE: "W", COMP: "M", CRV: "C", DEEP: "G", DOGE: "G,C",
  DOT: "C,M", DYDX: "M", ENA: "C", ETC: "G,C", ETH: "G,C,W", ETHFI: "C", FET: "C",
  FIL: "G,M", FLR: "C", GALA: "M", GRT: "C,M", GROK: "W", HBAR: "C,M", ICP: "C",
  IMX: "C", INJ: "C,M", IOTX: "M", IP: "G", JASMY: "C", JUP: "M", KAS: "M", KAVA: "M",
  KTA: "W", LDO: "G,C", LINK: "G,C,M", LPT: "G", LTC: "G,C,M", MANA: "G,C", MINA: "M",
  MNT: "C,W", MORPHO: "C", MOVE: "W", NEAR: "G,C,M", ONDO: "M,W", OP: "G,M", OSMO: "M",
  PENDLE: "C", PENGU: "C", PEPE: "C", POL: "C", PYTH: "G", QNT: "C", RENDER: "C,M",
  SEI: "C,M,W", SHIB: "C", SKY: "C", SOL: "G,C,M", STX: "G,C,M", SUI: "G,M", SXT: "G",
  TAO: "G", THETA: "M", TIA: "C", TRX: "W", UNI: "C,M", USACOIN: "W", VET: "C", W: "M",
  WAL: "G", WLD: "M", WLFI: "M,W", XLM: "G,C,M", XRP: "G,C,M", XTZ: "C,M", ZEC: "G,M",
  ZEN: "G,M", ZRX: "M",
};

const HOST = "data-api.binance.vision";

function get(path) {
  return new Promise((resolve, reject) => {
    https
      .get({ host: HOST, path, headers: { "User-Agent": "atlas-verify/1.0" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      })
      .on("error", reject);
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const tickers = Object.keys(CANDIDATES);
  const symbols = tickers.map((t) => `${t}USDT`);
  const results = new Map(); // symbol -> { status, baseAsset, quoteAsset } | null

  for (const group of chunk(symbols, 15)) {
    const symbolsParam = encodeURIComponent(JSON.stringify(group));
    const path = `/api/v3/exchangeInfo?symbols=${symbolsParam}`;
    const { status, body } = await get(path);
    if (status !== 200 || !body || !Array.isArray(body.symbols)) {
      // Some symbols in this batch are invalid; Binance errors out the WHOLE batch.
      // Fall back to querying this batch one symbol at a time.
      for (const sym of group) {
        const p2 = `/api/v3/exchangeInfo?symbol=${sym}`;
        const r2 = await get(p2);
        if (r2.status === 200 && r2.body && Array.isArray(r2.body.symbols) && r2.body.symbols[0]) {
          const s = r2.body.symbols[0];
          results.set(sym, { status: s.status, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset });
        } else {
          results.set(sym, null);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    } else {
      for (const sym of group) {
        const s = body.symbols.find((x) => x.symbol === sym);
        results.set(sym, s ? { status: s.status, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset } : null);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log("TICKER,CATEGORIES,SYMBOL,BINANCE_STATUS,BASE_ASSET");
  for (const t of tickers) {
    const sym = `${t}USDT`;
    const r = results.get(sym);
    const statusStr = r ? r.status : "NOT_LISTED";
    const baseStr = r ? r.baseAsset : "-";
    console.log(`${t},${CANDIDATES[t]},${sym},${statusStr},${baseStr}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
