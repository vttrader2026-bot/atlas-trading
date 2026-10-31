// ATLAS ANALYZER ENGINE — glue between the deterministic engine
// (lib/analyzerEngine.ts) and the AI-written response.
//
// The engine is authoritative for every number the Analyzer shows as a level
// or a plan. After the model answers we:
//   1. scrub any sentence that quotes a price the engine did not supply, then
//   2. OVERWRITE structure, trend, key levels, scenarios' levels, invalidation
//      and the whole trade plan from the engine result.
// So even a model that ignores its instructions cannot put an invented
// entry, stop or target in front of the user.

import type { EngineResult, ReasonCode, Verdict } from "@/lib/analyzerEngine";

export type Lang = "en" | "ar" | "fr";
const L = (lang: string): Lang => (lang === "ar" ? "ar" : lang === "fr" ? "fr" : "en");

export const VERDICT_LABEL: Record<Verdict, Record<Lang, string>> = {
  VALID_SETUP: { en: "Valid setup", ar: "فرصة صالحة", fr: "Setup valide" },
  WAIT_FOR_CONFIRMATION: { en: "Wait for confirmation", ar: "انتظر التأكيد", fr: "Attendre la confirmation" },
  NO_CLEAN_SETUP: { en: "No clean setup", ar: "لا توجد فرصة واضحة", fr: "Aucun setup clair" },
  VISUAL_READ_ONLY: { en: "Visual read only", ar: "قراءة بصرية فقط", fr: "Lecture visuelle uniquement" },
};

export const REASON_TEXT: Record<ReasonCode, Record<Lang, string>> = {
  INSUFFICIENT_DATA: {
    en: "Not enough closed candles to read this market reliably.",
    ar: "لا توجد شموع مغلقة كافية لقراءة هذا السوق بشكل موثوق.",
    fr: "Pas assez de bougies clôturées pour lire ce marché de façon fiable.",
  },
  DOWNTREND: {
    en: "The market structure is bearish (lower highs and lower lows). Atlas only plans spot buys.",
    ar: "هيكل السوق هابط (قمم وقيعان أدنى). أطلس يخطط لعمليات الشراء الفوري فقط.",
    fr: "La structure du marché est baissière (sommets et creux plus bas). Atlas ne planifie que des achats spot.",
  },
  RANGE_NO_EDGE: {
    en: "Price is ranging with no confirmed higher-high / higher-low structure.",
    ar: "السعر في نطاق عرضي دون هيكل قمم وقيعان أعلى مؤكد.",
    fr: "Le prix évolue en range, sans structure de sommets et creux croissants confirmée.",
  },
  STRUCTURE_UNCLEAR: {
    en: "There are not enough confirmed swing points to define the structure.",
    ar: "لا توجد نقاط تأرجح مؤكدة كافية لتحديد الهيكل.",
    fr: "Il n'y a pas assez de points de swing confirmés pour définir la structure.",
  },
  STRUCTURE_BROKEN: {
    en: "Price closed below the last confirmed swing low, so the bullish structure is broken.",
    ar: "أغلق السعر تحت آخر قاع مؤكد، لذلك انكسر الهيكل الصاعد.",
    fr: "Le prix a clôturé sous le dernier creux confirmé : la structure haussière est cassée.",
  },
  SUPPORT_BROKEN: {
    en: "Price closed below the support zone that held the last higher low.",
    ar: "أغلق السعر تحت منطقة الدعم التي حافظت على آخر قاع أعلى.",
    fr: "Le prix a clôturé sous la zone de support qui tenait le dernier creux plus haut.",
  },
  NO_SUPPORT_ZONE: {
    en: "No support zone is available to build an entry on.",
    ar: "لا توجد منطقة دعم متاحة لبناء الدخول عليها.",
    fr: "Aucune zone de support n'est disponible pour construire une entrée.",
  },
  HTF_BEARISH: {
    en: "The higher timeframe is bearish, so a buy here fights the bigger trend.",
    ar: "الإطار الزمني الأعلى هابط، لذلك الشراء هنا يعاكس الاتجاه الأكبر.",
    fr: "L'unité de temps supérieure est baissière : acheter ici va à contre-courant de la tendance principale.",
  },
  PRICE_EXTENDED: {
    en: "Price is too far from the nearest structural level to buy at a sensible risk.",
    ar: "السعر بعيد جدًا عن أقرب مستوى هيكلي للشراء بمخاطرة معقولة.",
    fr: "Le prix est trop éloigné du niveau structurel le plus proche pour acheter avec un risque raisonnable.",
  },
  AWAIT_BULLISH_CLOSE: {
    en: "Price is at support but the last candle has not closed bullish back above the zone.",
    ar: "السعر عند الدعم لكن آخر شمعة لم تغلق صاعدة فوق المنطقة.",
    fr: "Le prix est sur le support mais la dernière bougie n'a pas clôturé en hausse au-dessus de la zone.",
  },
  AWAIT_BREAKOUT_CLOSE: {
    en: "Price has not yet closed above the resistance zone.",
    ar: "لم يغلق السعر بعد فوق منطقة المقاومة.",
    fr: "Le prix n'a pas encore clôturé au-dessus de la zone de résistance.",
  },
  BREAKOUT_NEEDS_VOLUME: {
    en: "The breakout close is not backed by above-average volume.",
    ar: "إغلاق الاختراق غير مدعوم بحجم تداول أعلى من المتوسط.",
    fr: "La clôture de cassure n'est pas appuyée par un volume supérieur à la moyenne.",
  },
  OVERBOUGHT: {
    en: "Momentum is stretched (RSI overbought); a better price is likely to come.",
    ar: "الزخم مفرط (RSI في التشبع الشرائي)؛ من المرجح أن يأتي سعر أفضل.",
    fr: "L'élan est étiré (RSI suracheté) ; un meilleur prix est probable.",
  },
  NO_TARGET_ROOM: {
    en: "There is no structural resistance above to set an honest first target.",
    ar: "لا توجد مقاومة هيكلية أعلاه لتحديد هدف أول موثوق.",
    fr: "Il n'existe pas de résistance structurelle au-dessus pour fixer un premier objectif honnête.",
  },
  ENTRY_INVERTED: {
    en: "The calculated entry zone was invalid and was rejected.",
    ar: "منطقة الدخول المحسوبة غير صالحة وتم رفضها.",
    fr: "La zone d'entrée calculée était invalide et a été rejetée.",
  },
  ENTRY_NOT_IN_ZONE: {
    en: "The entry does not sit on a structural support/retest zone.",
    ar: "الدخول لا يقع على منطقة دعم أو إعادة اختبار هيكلية.",
    fr: "L'entrée ne se situe pas sur une zone structurelle de support ou de retest.",
  },
  SL_NOT_BELOW_ZONE: {
    en: "The stop-loss would not sit below the entire entry zone.",
    ar: "وقف الخسارة لن يقع أسفل منطقة الدخول بالكامل.",
    fr: "Le stop-loss ne serait pas placé sous toute la zone d'entrée.",
  },
  SL_BUFFER_TOO_SMALL: {
    en: "The stop-loss would be too close to the entry zone (no ATR buffer).",
    ar: "وقف الخسارة قريب جدًا من منطقة الدخول (دون هامش ATR).",
    fr: "Le stop-loss serait trop proche de la zone d'entrée (pas de marge ATR).",
  },
  TARGET_BELOW_ENTRY: {
    en: "A target would sit at or below the entry.",
    ar: "أحد الأهداف سيكون عند الدخول أو أسفله.",
    fr: "Un objectif serait au niveau ou sous l'entrée.",
  },
  TARGETS_NOT_ORDERED: {
    en: "The targets could not be placed in a valid ascending order.",
    ar: "تعذّر ترتيب الأهداف ترتيبًا تصاعديًا صحيحًا.",
    fr: "Les objectifs n'ont pas pu être placés dans un ordre croissant valide.",
  },
  RR_TOO_LOW: {
    en: "Reward-to-risk to the first target is too low, measured from the worst entry price.",
    ar: "نسبة العائد إلى المخاطرة للهدف الأول منخفضة جدًا، مقاسة من أسوأ سعر دخول.",
    fr: "Le ratio gain/risque vers le premier objectif est trop faible, mesuré depuis le pire prix d'entrée.",
  },
  RISK_TOO_WIDE: {
    en: "The stop would be too far from the entry for a sensible position.",
    ar: "وقف الخسارة بعيد جدًا عن الدخول لصفقة معقولة.",
    fr: "Le stop serait trop éloigné de l'entrée pour une position raisonnable.",
  },
  PAIR_REQUIRED: {
    en: "Choose a Binance USDT pair so the chart can be checked against real candles.",
    ar: "اختر زوج USDT على Binance حتى يمكن التحقق من الرسم بالشموع الحقيقية.",
    fr: "Choisissez une paire USDT de Binance pour vérifier le graphique avec de vraies bougies.",
  },
  PAIR_NOT_USDT: {
    en: "Only Binance USDT spot pairs can be verified.",
    ar: "يمكن التحقق من أزواج USDT الفورية على Binance فقط.",
    fr: "Seules les paires spot USDT de Binance peuvent être vérifiées.",
  },
  TIMEFRAME_REQUIRED: {
    en: "Choose the chart timeframe so the chart can be checked against real candles.",
    ar: "اختر الإطار الزمني للرسم حتى يمكن التحقق منه بالشموع الحقيقية.",
    fr: "Choisissez l'unité de temps du graphique pour le vérifier avec de vraies bougies.",
  },
  UNSUPPORTED_TIMEFRAME: {
    en: "This timeframe is not supported (use 15M, 1H, 4H, 1D or 1W).",
    ar: "هذا الإطار الزمني غير مدعوم (استخدم 15M أو 1H أو 4H أو 1D أو 1W).",
    fr: "Cette unité de temps n'est pas prise en charge (utilisez 15M, 1H, 4H, 1D ou 1W).",
  },
  CANDLES_UNAVAILABLE: {
    en: "Real candle data could not be loaded to verify this chart.",
    ar: "تعذّر تحميل بيانات الشموع الحقيقية للتحقق من هذا الرسم.",
    fr: "Les données de bougies réelles n'ont pas pu être chargées pour vérifier ce graphique.",
  },
};

const VISUAL_NOTE: Record<Lang, string> = {
  en: "Visual read only — no verified trade plan.",
  ar: "قراءة بصرية فقط — لا توجد خطة تداول موثّقة.",
  fr: "Lecture visuelle uniquement — aucun plan de trade vérifié.",
};

const LEVEL_LABEL: Record<"resistance" | "support" | "price", Record<Lang, string>> = {
  resistance: { en: "Resistance", ar: "مقاومة", fr: "Résistance" },
  support: { en: "Support", ar: "دعم", fr: "Support" },
  price: { en: "Current Price", ar: "السعر الحالي", fr: "Prix actuel" },
};

const CONDITION_LABEL: Record<string, Record<Lang, string>> = {
  VALID_pullback: { en: "Pullback to support", ar: "تصحيح إلى الدعم", fr: "Repli vers le support" },
  VALID_breakout: { en: "Confirmed breakout", ar: "اختراق مؤكد", fr: "Cassure confirmée" },
  WAIT: { en: "Wait for confirmation", ar: "انتظر التأكيد", fr: "Attendre la confirmation" },
  NO_CLEAN: { en: "No clear setup", ar: "لا توجد فرصة واضحة", fr: "Aucun setup clair" },
  VISUAL: { en: "Visual read only", ar: "قراءة بصرية فقط", fr: "Lecture visuelle uniquement" },
};

const WAIT_DIRECTION = "Wait — no clear setup";

export function reasonTexts(engine: EngineResult, lang: string): string[] {
  return engine.reasons.map((c) => REASON_TEXT[c][L(lang)]);
}

/** Compact, locale-free price text; keeps tiny prices readable and stays parseable. */
export function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "N/A";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  return String(Number(v.toFixed(digits)));
}

// ───────────────────────── prompt block ─────────────────────────

export function engineFactsBlock(engine: EngineResult, pair: string): string {
  const head = [
    "=== ATLAS ENGINE RESULT (authoritative — computed in code from real, closed Binance candles) ===",
    "You are the explainer, not the calculator. You MUST NOT invent, adjust or calculate any entry, stop-loss, target, invalidation price or risk/reward.",
    "The server inserts the trade plan and key levels itself. In your JSON, set tradePlan.entryZone, tradePlan.invalidation, tradePlan.riskReward and invalidation.level to \"ENGINE\" and tradePlan.targets / scenario targets to [].",
    "You may quote ONLY the prices listed below, exactly as written. Never quote any other price.",
    `Verdict: ${engine.verdict}${engine.reasons.length ? ` (reason codes: ${engine.reasons.join(", ")})` : ""}`,
  ];
  if (engine.verdict === "VISUAL_READ_ONLY") {
    head.push(
      `This is a VISUAL READ ONLY: the screenshot for ${pair} could not be verified against real candles (${engine.reasons.join(", ")}).`,
      "Describe only what is visibly on the chart in general terms. Give NO entry, stop-loss, target, invalidation price or risk/reward. tradePlan.direction MUST be \"Wait — no clear setup\"."
    );
    return head.join("\n");
  }
  const m = engine.market;
  if (!m) {
    head.push("There was not enough closed-candle history to read this market. Say so plainly; do not infer a trend or levels.");
    return head.join("\n");
  }
  const z = (zs: { low: number; high: number; touches: number }[]) =>
    zs.length ? zs.map((x) => `${fmtPrice(x.low)}-${fmtPrice(x.high)} (${x.touches} touches)`).join("; ") : "none";
  head.push(
    `Pair ${pair}; timeframe ${engine.interval}; ${engine.closedCandles} closed candles; last closed price ${fmtPrice(m.price)}; ATR(14) ${fmtPrice(m.atr)}.`,
    `Market trend (separate from setup validity): ${m.trend.direction}, ${m.trend.strength}. Structure: ${m.structure.state}; recent swings ${
      m.structure.labelled.map((l) => `${l.label}@${fmtPrice(l.price)}`).join(", ") || "none confirmed"
    }.`,
    `Support zones: ${z(m.support)}. Resistance zones: ${z(m.resistance)}.`,
    `EMA20/50/200: ${[m.ema20, m.ema50, m.ema200].map((v) => (v === null ? "n/a" : fmtPrice(v))).join(" / ")}; RSI14 ${
      m.rsi14 === null ? "n/a" : m.rsi14.toFixed(1)
    }; volume ${m.volume.trend}.`,
    engine.higherTimeframe ? `Higher timeframe trend: ${engine.higherTimeframe.direction}.` : "Higher timeframe: not available."
  );
  if (engine.verdict === "VALID_SETUP" && engine.plan) {
    const p = engine.plan;
    head.push(
      `VALID spot LONG ${p.setup} setup. Entry zone ${fmtPrice(p.entry.low)}-${fmtPrice(p.entry.high)}; stop-loss ${fmtPrice(p.stopLoss)}; TP1 ${fmtPrice(
        p.targets[0].price
      )}, TP2 ${fmtPrice(p.targets[1].price)}, TP3 ${fmtPrice(p.targets[2].price)}; R:R to TP1 ${p.targets[0].rr}.`,
      "Explain WHY this setup is valid using the structure above. Do not change these numbers."
    );
  } else if (engine.verdict === "WAIT_FOR_CONFIRMATION") {
    head.push(
      `NO plan yet: a ${engine.candidate ?? "spot"} setup is forming but is not confirmed. Explain what must happen first. ${
        engine.watch ? `Reference level to watch (NOT an entry): ${fmtPrice(engine.watch.price)}.` : ""
      }`,
      "Do not give an entry, stop-loss or targets."
    );
  } else {
    head.push("NO CLEAN SETUP: explain plainly why waiting is the right call. Do not give an entry, stop-loss or targets.");
  }
  return head.join("\n");
}

// ───────────────────────── price scrubbing ─────────────────────────

/** Every number the engine is allowed to have put in front of the user. */
export function allowedNumbers(engine: EngineResult): number[] {
  const out: number[] = [];
  const m = engine.market;
  if (m) {
    out.push(m.price, m.atr, m.rangeHigh, m.rangeLow);
    for (const v of [m.ema20, m.ema50, m.ema200, m.rsi14, m.structure.lastSwingHigh, m.structure.lastSwingLow]) if (v !== null) out.push(v);
    for (const l of m.structure.labelled) out.push(l.price);
    for (const zn of [...m.support, ...m.resistance]) out.push(zn.low, zn.high, zn.mid);
  }
  if (engine.watch) out.push(engine.watch.price);
  if (engine.plan) {
    const p = engine.plan;
    out.push(p.entry.low, p.entry.high, p.stopLoss, p.risk, ...p.targets.map((t) => t.price), ...p.targets.map((t) => t.rr));
  }
  return out;
}

const PRICE_TOKEN = /\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$?\d+\.\d+|\$?\d{4,}/g;

/** Price-like numbers in `text` that are in the coin's price range but are not an engine value. */
export function unsupportedPrices(text: string, allowed: number[], refPrice: number): number[] {
  const bad: number[] = [];
  for (const m of text.matchAll(PRICE_TOKEN)) {
    const idx = m.index ?? 0;
    const next = text[idx + m[0].length] ?? "";
    const prev = text.slice(Math.max(0, idx - 3), idx);
    if (next === "%" || next === "x" || next === "×" || /:\s*$/.test(prev)) continue; // percentages, multiples, ratios
    const v = parseFloat(m[0].replace(/[$,]/g, ""));
    if (!Number.isFinite(v)) continue;
    if (v < refPrice * 0.2 || v > refPrice * 5) continue; // not a price of this coin
    if (allowed.some((a) => Math.abs(a - v) <= Math.abs(a) * 0.005 + 1e-12)) continue;
    bad.push(v);
  }
  return bad;
}

function scrubString(text: string, allowed: number[], ref: number): { text: string; removed: number } {
  if (!unsupportedPrices(text, allowed, ref).length) return { text, removed: 0 };
  const sentences = text.split(/(?<=[.!?؟])\s+/);
  const kept = sentences.filter((s) => !unsupportedPrices(s, allowed, ref).length);
  return { text: kept.join(" "), removed: sentences.length - kept.length };
}

/** Deeply removes sentences quoting a price the engine did not supply. Returns how many were removed. */
export function scrubUnsupportedPrices(value: unknown, allowed: number[], refPrice: number): number {
  let removed = 0;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => {
        if (typeof v === "string") {
          const r = scrubString(v, allowed, refPrice);
          node[i] = r.text;
          removed += r.removed;
        } else walk(v);
      });
    } else if (node && typeof node === "object") {
      const o = node as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === "string") {
          const r = scrubString(v, allowed, refPrice);
          o[k] = r.text;
          removed += r.removed;
        } else walk(v);
      }
    }
  };
  walk(value);
  return removed;
}

// ───────────────────────── apply to the response ─────────────────────────

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

function conditionLabel(engine: EngineResult, lang: Lang): string {
  if (engine.verdict === "VALID_SETUP") return CONDITION_LABEL[`VALID_${engine.plan?.setup ?? "pullback"}`][lang];
  if (engine.verdict === "WAIT_FOR_CONFIRMATION") return CONDITION_LABEL.WAIT[lang];
  if (engine.verdict === "VISUAL_READ_ONLY") return CONDITION_LABEL.VISUAL[lang];
  return CONDITION_LABEL.NO_CLEAN[lang];
}

/**
 * Makes the parsed AI response consistent with the engine, in place. Keeps the
 * response shape the existing UI/PDF/quota code already understands and adds
 * `verdict`, `verdictLabel`, `verdictReasons` and `_engine`.
 */
export function applyEngineToAnalysis(parsed: Obj, engine: EngineResult, langRaw: string): Obj {
  const lang = L(langRaw);
  const m = engine.market;
  const visual = engine.verdict === "VISUAL_READ_ONLY";

  // 1. Remove any model sentence that quotes a price the engine did not supply.
  if (m) scrubUnsupportedPrices(parsed, allowedNumbers(engine), m.price);

  const reasons = reasonTexts(engine, lang);

  // 2. Structure & trend: engine only (the model keeps the explanations).
  if (m) {
    parsed.marketStructure = { ...asObj(parsed.marketStructure), state: m.structure.state };
    parsed.trend = { ...asObj(parsed.trend), direction: m.trend.direction, strength: m.trend.strength };
    // 3. Key levels: engine zones only.
    const levels: { label: string; price: string }[] = [];
    [...m.resistance].reverse().forEach((z, i, arr) => {
      levels.push({ label: `${LEVEL_LABEL.resistance[lang]} ${arr.length - i}`, price: fmtPrice(z.mid) });
    });
    levels.push({ label: LEVEL_LABEL.price[lang], price: fmtPrice(m.price) });
    m.support.forEach((z, i) => levels.push({ label: `${LEVEL_LABEL.support[lang]} ${i + 1}`, price: fmtPrice(z.mid) }));
    parsed.keyLevels = levels;
  } else if (!visual) {
    // Insufficient data: nothing verified to show.
    parsed.keyLevels = [];
  } else {
    parsed.keyLevelsUnverified = true; // levels read from the image only
  }

  const cond = asObj(parsed.currentCondition);
  parsed.currentCondition = { ...cond, label: conditionLabel(engine, lang) };

  const plan = engine.plan;
  const valid = engine.verdict === "VALID_SETUP" && plan;

  // 4. Scenario levels: only a valid plan has targets; WAIT/NO_CLEAN/VISUAL have none.
  const bull = parsed.bullishScenario ? asObj(parsed.bullishScenario) : null;
  const bear = parsed.bearishScenario ? asObj(parsed.bearishScenario) : null;
  if (bull) bull.targets = valid ? plan.targets.map((t) => fmtPrice(t.price)) : [];
  if (bear) bear.targets = valid && m ? m.support.map((z) => fmtPrice(z.mid)) : [];
  parsed.bullishScenario = bull;
  parsed.bearishScenario = bear;

  // 5. Invalidation + trade plan.
  const inv = asObj(parsed.invalidation);
  const tp = asObj(parsed.tradePlan);
  const riskNote = str(tp.riskNote) || "Structural analysis, not financial advice. Size positions by your own risk tolerance.";
  if (valid) {
    parsed.invalidation = { ...inv, level: fmtPrice(plan.stopLoss) };
    parsed.tradePlan = {
      direction: "Long",
      entryZone: `${fmtPrice(plan.entry.low)} - ${fmtPrice(plan.entry.high)}`,
      invalidation: fmtPrice(plan.stopLoss),
      targets: plan.targets.map((t) => fmtPrice(t.price)),
      riskNote,
      riskReward: `1 : ${plan.targets[0].rr}`,
    };
    parsed.noClearSetup = null;
  } else {
    parsed.invalidation = { ...inv, level: "N/A" };
    parsed.tradePlan = {
      direction: WAIT_DIRECTION,
      entryZone: "N/A",
      invalidation: "N/A",
      targets: [],
      riskNote,
      riskReward: "N/A",
    };
    parsed.noClearSetup = visual ? [VISUAL_NOTE[lang], ...reasons].join(" ") : reasons.join(" ");
  }

  // 6. Verdict metadata for the (upcoming) result UI.
  parsed.verdict = engine.verdict;
  parsed.verdictLabel = VERDICT_LABEL[engine.verdict][lang];
  parsed.verdictReasons = engine.reasons.map((code, i) => ({ code, text: reasons[i] }));
  parsed._engine = engine;
  return parsed;
}
