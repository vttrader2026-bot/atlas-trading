// ATLAS ANALYZER — keeps AI-written text honest.
//  1. Removes sentences that cite indicators Atlas does not compute (Fibonacci, Bollinger, ...).
//  2. Removes sentences that state an RSI / MACD number the engine did not measure.
//  3. When there is no verified market (VISUAL READ ONLY / insufficient data) removes
//     sentences that quote price-like numbers, since there is nothing to check them against.
//  4. Builds the explanations that must agree with the engine (structure, trend, condition,
//     scenario confirmations) deterministically, so the model can never contradict the numbers.

import type { EngineResult } from "@/lib/analyzerEngine";
import type { Lang } from "@/lib/analyzerEngineApply";

const SENTENCE_SPLIT = /(?<=[.!?؟])\s+/;

// Indicators / methods the engine does not implement. (Fibonacci in particular: methodology not verified.)
const UNSUPPORTED_INDICATOR =
  /\b(fibonacci|fib\b|fibo\b|bollinger|ichimoku|stochastic|stoch\b|vwap|obv\b|on[- ]balance|adx\b|supertrend|parabolic|williams %?r|cci\b|keltner|donchian|elliott|gartley|harmonic|golden cross|death cross|divergence)\b|فيبوناتشي|بولينجر|إيشيموكو|تباعد|فيبو|bandes de bollinger|divergence|croix (?:d'or|de la mort)/i;

const RSI_THRESHOLDS = new Set([20, 25, 30, 40, 50, 60, 70, 75, 80]);
const COMPARATOR = /(above|below|over|under|cross(?:es|ed)?|exceed(?:s|ed)?|>|<|فوق|تحت|au-dessus|en dessous)/i;

/** True if the sentence states an RSI or MACD number the engine did not measure. */
export function unsupportedIndicatorClaim(sentence: string, engine: EngineResult): boolean {
  const m = engine.market;
  for (const hit of sentence.matchAll(/\bRSI\b\s*(?:\(\s*\d+\s*\))?([^0-9]{0,30}?)(\d{1,3}(?:\.\d+)?)/gi)) {
    const v = parseFloat(hit[2]);
    if (!Number.isFinite(v) || v > 100) continue;
    if (COMPARATOR.test(hit[1]) && RSI_THRESHOLDS.has(v)) continue; // "RSI above 70" is a threshold, not a reading
    if (!m || m.rsi14 === null || Math.abs(v - m.rsi14) > 2) return true;
  }
  for (const hit of sentence.matchAll(/\bMACD\b[^0-9\-]{0,30}?(-?\d+\.\d+)/gi)) {
    const v = parseFloat(hit[1]);
    const vals = m?.macd ? [m.macd.line, m.macd.signal, m.macd.histogram] : [];
    if (!vals.some((a) => Math.abs(a - v) <= Math.abs(a) * 0.05 + 1e-9)) return true;
  }
  return false;
}

const PRICE_LIKE =
  /\$\s?\d|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+(?![%x×\d])|\b\d{4,}\b|\b(?:above|below|at|near|to|reach|reaches|reclaim|reclaims|break|breaks|under|over|around|toward|towards|from|فوق|تحت|عند|نحو|au-dessus de|en dessous de|vers)\s+\$?\d{2,}(?![%x×\d])(?!\s*(?:EMA|SMA|MA|candles?|bars?|periods?|days?|hours?|weeks?|minutes?|swings?|touch|touches|times)\b)/i;

/** A sentence quoting a price-like number, with no verified market to check it against. */
export function looksLikeUnverifiedPrice(sentence: string): boolean {
  return PRICE_LIKE.test(sentence);
}

function filterStrings(node: unknown, drop: (s: string) => boolean, counter: { n: number }): void {
  const clean = (text: string): string => {
    const parts = text.split(SENTENCE_SPLIT);
    const kept = parts.filter((s) => !drop(s));
    counter.n += parts.length - kept.length;
    return kept.length === parts.length ? text : kept.join(" ");
  };
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === "string") node[i] = clean(v);
      else filterStrings(v, drop, counter);
    });
  } else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string") o[k] = clean(v);
      else filterStrings(v, drop, counter);
    }
  }
}

/** Removing a sentence can leave an empty list item behind; drop those so the UI never renders blank bullets. */
export function pruneEmptyStrings(node: unknown): void {
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const v = node[i];
      if (typeof v === "string" && v.trim() === "") node.splice(i, 1);
      else pruneEmptyStrings(v);
    }
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) pruneEmptyStrings(v);
  }
}

/**
 * Atlas is spot-only: advice to short, trade futures/perps, margin or leverage is never shown.
 * Matches the trading instruction, not the adjective ("short-term", "a short pullback" stay).
 */
export const SHORT_OR_FUTURES =
  /\b(?:go|goes|going|open|opening|take|taking|enter|entering|consider|considering)\s+(?:a\s+|the\s+)?short\b|\bshort(?:ing|s)?\s+(?:position|trade|setup|entry|the\s+market|this|it\b|opportunit|squeeze)|\bshorting\b|\bfutures?\b|\bperps?\b|perpetual|\bleverag|\bmargin\s+trad|\b\d+\s?x\s+(?:long|short|leverage)|بيع على المكشوف|شورت|عقود آجلة|العقود الآجلة|رافعة|الرافعة|vente à découvert|position courte|prendre un short|contrats? à terme|\blevier\b|\bsell\s+(?:the\s+)?(?:rally|bounce)\b/i;

/** Applies rules 1–3 above to every string in the model response. Returns how many sentences were removed. */
export function sanitizeModelText(parsed: unknown, engine: EngineResult): number {
  const counter = { n: 0 };
  const verified = !!engine.market;
  filterStrings(
    parsed,
    (s) => SHORT_OR_FUTURES.test(s) || UNSUPPORTED_INDICATOR.test(s) || unsupportedIndicatorClaim(s, engine) || (!verified && looksLikeUnverifiedPrice(s)),
    counter
  );
  pruneEmptyStrings(parsed);
  return counter.n;
}

// ───────────────────────── deterministic narrative ─────────────────────────

const WORD: Record<string, Record<Lang, string>> = {
  Bullish: { en: "bullish", ar: "صاعد", fr: "haussier" },
  Bearish: { en: "bearish", ar: "هابط", fr: "baissier" },
  Neutral: { en: "neutral", ar: "محايد", fr: "neutre" },
  Weak: { en: "weak", ar: "ضعيفة", fr: "faible" },
  Moderate: { en: "moderate", ar: "متوسطة", fr: "modérée" },
  Strong: { en: "strong", ar: "قوية", fr: "forte" },
};

export type Narrative = {
  structure: string;
  trend: string;
  condition: string;
  bullConfirm: string;
  bearConfirm: string;
};

export function narrative(engine: EngineResult, lang: Lang, fmt: (n: number) => string): Narrative {
  const m = engine.market;
  const tf = (engine.interval ?? "").toUpperCase();
  const labels = m ? m.structure.labelled.slice(-4).map((l) => l.label).join(", ") : "";
  const sw = labels ? ` (${labels})` : "";

  const structure: Record<string, Record<Lang, string>> = {
    Bullish: {
      en: `Confirmed swings are stepping higher${sw}: higher highs and higher lows.`,
      ar: `النقاط المؤكدة ترتفع تدريجيًا${sw}: قمم أعلى وقيعان أعلى.`,
      fr: `Les swings confirmés montent${sw} : sommets et creux plus hauts.`,
    },
    Bearish: {
      en: `Confirmed swings are stepping lower${sw}: lower highs and lower lows.`,
      ar: `النقاط المؤكدة تنخفض تدريجيًا${sw}: قمم أدنى وقيعان أدنى.`,
      fr: `Les swings confirmés baissent${sw} : sommets et creux plus bas.`,
    },
    Ranging: {
      en: `Swings do not form a consistent higher or lower sequence${sw}, so the market is ranging.`,
      ar: `النقاط لا تشكّل تسلسلًا واضحًا أعلى أو أدنى${sw}، لذا السوق متذبذب.`,
      fr: `Les swings ne forment pas de séquence haussière ou baissière cohérente${sw} : le marché est en range.`,
    },
    Unclear: {
      en: "There are not enough confirmed swing points to read the structure.",
      ar: "لا توجد نقاط انعطاف مؤكدة كافية لقراءة هيكل السوق.",
      fr: "Il n'y a pas assez de swings confirmés pour lire la structure.",
    },
  };
  const state = m?.structure.state ?? "Unclear";

  const dir = m?.trend.direction ?? "Neutral";
  const str = m?.trend.strength ?? "Weak";
  const trend: Record<Lang, string> = m
    ? {
        en: `The ${tf} trend is ${WORD[dir].en} with ${WORD[str].en} strength, measured from closed candles. A trend is context, not a trade.`,
        ar: `اتجاه ${tf} ${WORD[dir].ar} بقوة ${WORD[str].ar}، محسوب من الشموع المغلقة. الاتجاه سياق وليس صفقة.`,
        fr: `La tendance ${tf} est ${WORD[dir].fr} avec une force ${WORD[str].fr}, mesurée sur les bougies clôturées. Une tendance est un contexte, pas un trade.`,
      }
    : {
        en: "There is no verified trend reading for this chart.",
        ar: "لا توجد قراءة موثّقة للاتجاه لهذا الرسم.",
        fr: "Aucune lecture de tendance vérifiée pour ce graphique.",
      };

  const cond: Record<string, Record<Lang, string>> = {
    VALID_SETUP: {
      en: "Price is at a confirmed spot support zone; structure, confirmation and risk checks passed.",
      ar: "السعر عند منطقة دعم فورية مؤكدة؛ اجتازت البنية والتأكيد والمخاطرة الفحوص.",
      fr: "Le prix est sur une zone de support spot confirmée ; structure, confirmation et risque validés.",
    },
    WAIT_FOR_CONFIRMATION: {
      en: "A setup may be forming but one or more confirmations are still missing.",
      ar: "قد تتشكل فرصة لكن ما زال ينقصها تأكيد واحد أو أكثر.",
      fr: "Un setup se forme peut-être mais il manque encore une ou plusieurs confirmations.",
    },
    NO_CLEAN_SETUP: {
      en: "No spot setup passes Atlas's checks on the closed candles right now.",
      ar: "لا توجد فرصة فورية تجتاز فحوص أطلس على الشموع المغلقة حاليًا.",
      fr: "Aucun setup spot ne passe les contrôles d'Atlas sur les bougies clôturées pour l'instant.",
    },
    VISUAL_READ_ONLY: {
      en: "This chart could not be checked against real candles; treat the read as visual only.",
      ar: "تعذّر التحقق من هذا الرسم بالشموع الحقيقية؛ اعتبر القراءة بصرية فقط.",
      fr: "Ce graphique n'a pas pu être vérifié avec de vraies bougies ; lecture visuelle uniquement.",
    },
  };

  const w = engine.watch;
  const wp = w ? fmt(w.price) : "";
  const bullByRole: Record<string, Record<Lang, string>> = {
    hold_support: {
      en: `Price holds support at ${wp} and prints a bullish close.`,
      ar: `يثبت السعر عند الدعم ${wp} ويُغلق إغلاقًا صاعدًا.`,
      fr: `Le prix tient le support à ${wp} et clôture en hausse.`,
    },
    pullback_to_support: {
      en: `Price pulls back toward support near ${wp} and prints a bullish close there.`,
      ar: `يتراجع السعر نحو الدعم قرب ${wp} ويُغلق هناك إغلاقًا صاعدًا.`,
      fr: `Le prix revient vers le support près de ${wp} et y clôture en hausse.`,
    },
    breakout_close: {
      en: `A candle closes above ${wp} on strong volume.`,
      ar: `تُغلق شمعة فوق ${wp} بحجم تداول قوي.`,
      fr: `Une bougie clôture au-dessus de ${wp} avec un volume solide.`,
    },
    retest: {
      en: `Price retests ${wp} from above and holds it.`,
      ar: `يعيد السعر اختبار ${wp} من الأعلى ويثبت فوقه.`,
      fr: `Le prix reteste ${wp} par le haut et le tient.`,
    },
  };
  const lastHigh = m?.structure.lastSwingHigh ?? null;
  const lastLow = m?.structure.lastSwingLow ?? null;
  const bullFallback: Record<Lang, string> = lastHigh !== null
    ? {
        en: `Structure turns bullish: a close above the last swing high at ${fmt(lastHigh)} with volume.`,
        ar: `تتحول البنية إلى صاعدة: إغلاق فوق آخر قمة عند ${fmt(lastHigh)} مع حجم تداول.`,
        fr: `La structure devient haussière : clôture au-dessus du dernier sommet à ${fmt(lastHigh)} avec du volume.`,
      }
    : {
        en: "Structure turns bullish with a confirmed higher high and higher low.",
        ar: "تتحول البنية إلى صاعدة بقمة أعلى وقاع أعلى مؤكدين.",
        fr: "La structure devient haussière avec un sommet et un creux plus hauts confirmés.",
      };
  const bullValid: Record<Lang, string> = engine.plan
    ? {
        en: `Price keeps holding the entry zone and closes stay above the stop-loss at ${fmt(engine.plan.stopLoss)}.`,
        ar: `يواصل السعر الثبات في منطقة الدخول وتبقى الإغلاقات فوق وقف الخسارة عند ${fmt(engine.plan.stopLoss)}.`,
        fr: `Le prix continue de tenir la zone d'entrée et les clôtures restent au-dessus du stop à ${fmt(engine.plan.stopLoss)}.`,
      }
    : bullFallback;
  const bullConfirm = engine.verdict === "VALID_SETUP" ? bullValid : w ? bullByRole[w.role] : bullFallback;

  const alreadyBelow = m !== null && lastLow !== null && m.price <= lastLow;
  const bearConfirm: Record<Lang, string> = alreadyBelow
    ? {
        en: `Price is already below the last swing low at ${fmt(lastLow as number)}; the weak structure stays in place while it remains under that level (risk framing for a spot holder, not a short idea).`,
        ar: `السعر تحت آخر قاع عند ${fmt(lastLow as number)} بالفعل؛ تبقى البنية ضعيفة ما دام تحت هذا المستوى (تأطير للمخاطر لحامل فوري، وليس فكرة بيع).`,
        fr: `Le prix est déjà sous le dernier creux à ${fmt(lastLow as number)} ; la structure reste fragile tant qu'il reste sous ce niveau (cadrage du risque pour un détenteur spot, pas une idée de vente à découvert).`,
      }
    : lastLow !== null
      ? {
          en: `A close below the last swing low at ${fmt(lastLow)} would break the structure (risk framing for a spot holder, not a short idea).`,
          ar: `إغلاق تحت آخر قاع عند ${fmt(lastLow)} سيكسر البنية (تأطير للمخاطر لحامل فوري، وليس فكرة بيع).`,
          fr: `Une clôture sous le dernier creux à ${fmt(lastLow)} casserait la structure (cadrage du risque pour un détenteur spot, pas une idée de vente à découvert).`,
        }
      : {
          en: "Loss of the nearest support would weaken the structure (risk framing for a spot holder, not a short idea).",
          ar: "فقدان أقرب دعم سيُضعف البنية (تأطير للمخاطر لحامل فوري، وليس فكرة بيع).",
          fr: "La perte du support le plus proche affaiblirait la structure (cadrage du risque pour un détenteur spot, pas une idée de vente à découvert).",
        };

  return {
    structure: structure[state][lang],
    trend: trend[lang],
    condition: cond[engine.verdict][lang],
    bullConfirm: bullConfirm[lang],
    bearConfirm: bearConfirm[lang],
  };
}

// ───────────────────────── confirmed facts (engine-measured only) ─────────────────────────

const HTF: Record<string, string> = { "15m": "1H", "1h": "4H", "4h": "1D", "1d": "1W" };
const T: Record<string, Record<Lang, string>> = {
  above: { en: "above", ar: "فوق", fr: "au-dessus de" },
  below: { en: "below", ar: "تحت", fr: "en dessous de" },
  and: { en: "and", ar: "و", fr: "et" },
};

/**
 * "Confirmed" observations for a verified market: every statement is a measurement the engine made
 * on closed candles, so it can never contradict the numbers shown next to it.
 */
export function confirmedFacts(engine: EngineResult, lang: Lang): string[] {
  const m = engine.market;
  if (!m) return [];
  const tf = (engine.interval ?? "").toUpperCase();
  const out: string[] = [];

  const ema = ([["EMA 20", m.ema20], ["EMA 50", m.ema50], ["EMA 200", m.ema200]] as const).filter(([, v]) => v !== null) as [string, number][];
  const up = ema.filter(([, v]) => m.price > v).map(([n]) => n);
  const down = ema.filter(([, v]) => m.price <= v).map(([n]) => n);
  const join = (xs: string[]) => xs.join(", ");
  const parts: string[] = [];
  if (up.length) parts.push(`${T.above[lang]} ${join(up)}`);
  if (down.length) parts.push(`${T.below[lang]} ${join(down)}`);
  if (parts.length) {
    const lead = { en: "On the", ar: "على", fr: "Sur le" }[lang];
    out.push(
      lang === "ar"
        ? `${lead} ${tf}: السعر ${parts.join(` ${T.and.ar} `)}.`
        : lang === "fr"
          ? `${lead} ${tf} : le prix est ${parts.join(` ${T.and.fr} `)}.`
          : `${lead} ${tf}, price is ${parts.join(` ${T.and.en} `)}.`
    );
  }

  if (m.rsi14 !== null) {
    const zone = m.rsi14 >= 70
      ? { en: "overbought zone", ar: "منطقة تشبّع شرائي", fr: "zone de surachat" }
      : m.rsi14 <= 30
        ? { en: "oversold zone", ar: "منطقة تشبّع بيعي", fr: "zone de survente" }
        : { en: "neutral zone", ar: "منطقة محايدة", fr: "zone neutre" };
    out.push(`RSI(14) ${lang === "fr" ? ":" : lang === "ar" ? ":" : "is"} ${m.rsi14.toFixed(1)} (${zone[lang]}).`);
  }
  if (m.macd) {
    const pos = m.macd.histogram >= 0;
    out.push(
      lang === "ar"
        ? `هيستوغرام MACD ${pos ? "موجب" : "سالب"}.`
        : lang === "fr"
          ? `L'histogramme MACD est ${pos ? "positif" : "négatif"}.`
          : `The MACD histogram is ${pos ? "positive" : "negative"}.`
    );
  }
  if (m.volume.trend !== "unknown") {
    const v = {
      expanding: { en: "expanding", ar: "في توسع", fr: "en expansion" },
      contracting: { en: "contracting", ar: "في انكماش", fr: "en contraction" },
      flat: { en: "flat", ar: "مستقر", fr: "stable" },
    }[m.volume.trend];
    out.push(
      lang === "ar"
        ? `حجم التداول ${v.ar} مقارنة بمتوسطه الأخير.`
        : lang === "fr"
          ? `Le volume est ${v.fr} par rapport à sa moyenne récente.`
          : `Volume is ${v.en} versus its recent average.`
    );
  }
  if (engine.higherTimeframe && engine.interval && HTF[engine.interval]) {
    const d = engine.higherTimeframe.direction;
    const w = WORD[d][lang];
    out.push(
      lang === "ar"
        ? `اتجاه الإطار الأعلى (${HTF[engine.interval]}) ${w}.`
        : lang === "fr"
          ? `La tendance de l'unité de temps supérieure (${HTF[engine.interval]}) est ${w}.`
          : `The higher-timeframe (${HTF[engine.interval]}) trend is ${w}.`
    );
  }
  return out;
}

// ───────────────────────── engine-owned commentary ─────────────────────────
// With a verified market, every claim-bearing sentence shown to the user is written here from the
// engine's measurements and reason codes. The model keeps only generic "teach me" education.

const MOMENTUM_WORDS = {
  rsiNeutral: { en: "neutral", ar: "محايد", fr: "neutre" },
  rsiOver: { en: "overbought", ar: "تشبّع شرائي", fr: "suracheté" },
  rsiUnder: { en: "oversold", ar: "تشبّع بيعي", fr: "survendu" },
  macdPos: { en: "positive (bullish momentum)", ar: "موجب (زخم صاعد)", fr: "positif (élan haussier)" },
  macdNeg: { en: "negative (bearish momentum)", ar: "سالب (زخم هابط)", fr: "négatif (élan baissier)" },
  volExp: { en: "expanding", ar: "متزايد", fr: "en hausse" },
  volCon: { en: "contracting", ar: "متراجع", fr: "en baisse" },
  volFlat: { en: "flat", ar: "مستقر", fr: "stable" },
} as const;
const pick = <K extends keyof typeof MOMENTUM_WORDS>(k: K, lang: Lang) => MOMENTUM_WORDS[k][lang];

/** One factual momentum line from the engine's RSI, MACD and volume readings (empty without a verified market). */
export function momentumText(engine: EngineResult, lang: Lang): string {
  const m = engine.market;
  if (!m) return "";
  const tf = (engine.interval ?? "").toUpperCase();
  const parts: string[] = [];
  if (m.rsi14 !== null) {
    const v = m.rsi14.toFixed(1);
    const w = pick(m.rsi14 >= 70 ? "rsiOver" : m.rsi14 <= 30 ? "rsiUnder" : "rsiNeutral", lang);
    parts.push({ en: `RSI(14) is ${v} (${w}).`, ar: `مؤشر RSI(14) عند ${v} (${w}).`, fr: `Le RSI(14) est à ${v} (${w}).` }[lang]);
  }
  if (m.macd) {
    const w = pick(m.macd.histogram >= 0 ? "macdPos" : "macdNeg", lang);
    parts.push({ en: `The MACD histogram is ${w}.`, ar: `هيستوغرام MACD ${w}.`, fr: `L'histogramme MACD est ${w}.` }[lang]);
  }
  const vt = m.volume.trend;
  if (vt !== "unknown") {
    const w = pick(vt === "expanding" ? "volExp" : vt === "contracting" ? "volCon" : "volFlat", lang);
    parts.push({ en: `Volume is ${w}.`, ar: `حجم التداول ${w}.`, fr: `Le volume est ${w}.` }[lang]);
  }
  const head = { en: `On the ${tf}:`, ar: `على ${tf}:`, fr: `Sur le ${tf} :` }[lang];
  return parts.length ? `${head} ${parts.join(" ")}` : "";
}

/** Open questions, each one derived from a measured condition (never from model opinion). */
export function uncertainFacts(engine: EngineResult, lang: Lang, overboughtRsi = 75): string[] {
  const m = engine.market;
  if (!m) return [];
  const out: string[] = [];
  const add = (en: string, ar: string, fr: string) => out.push({ en, ar, fr }[lang]);
  if (m.structure.state === "Ranging" || m.structure.state === "Unclear")
    add("The structure does not yet show a clear direction.", "الهيكل لا يُظهر اتجاهًا واضحًا بعد.", "La structure ne montre pas encore de direction claire.");
  if (m.trend.strength === "Weak")
    add("Trend strength is weak: the moving averages are not fully aligned with the structure.", "قوة الاتجاه ضعيفة: المتوسطات غير متوافقة تمامًا مع الهيكل.", "La force de la tendance est faible : les moyennes mobiles ne sont pas alignées avec la structure.");
  if (m.macd && ((m.trend.direction === "Bullish" && m.macd.histogram < 0) || (m.trend.direction === "Bearish" && m.macd.histogram > 0)))
    add("MACD momentum points the opposite way to the structure.", "زخم MACD عكس اتجاه الهيكل.", "L'élan MACD va à l'opposé de la structure.");
  if (m.rsi14 !== null && m.rsi14 >= overboughtRsi)
    add("RSI is overbought, so a pullback is more likely than a clean continuation.", "مؤشر RSI في منطقة التشبّع الشرائي، لذا التراجع أرجح من استمرار نظيف.", "Le RSI est suracheté : un repli est plus probable qu'une continuation propre.");
  if (m.volume.trend === "contracting")
    add("Volume is contracting, so moves may lack follow-through.", "حجم التداول يتراجع، وقد تفتقر الحركات إلى الاستمرارية.", "Le volume baisse : les mouvements peuvent manquer de suivi.");
  if (engine.candidate === "breakout" && m.volume.breakoutConfirmation !== "high-close-on-high-volume")
    add("The breakout is not backed by high volume.", "الاختراق غير مدعوم بحجم تداول مرتفع.", "La cassure n'est pas soutenue par un volume élevé.");
  if (m.ema200 === null)
    add("There is not enough history for EMA 200.", "لا يوجد تاريخ كافٍ لحساب EMA 200.", "L'historique est insuffisant pour l'EMA 200.");
  if (engine.higherTimeframe === null)
    add("The higher-timeframe trend could not be checked.", "تعذّر التحقق من اتجاه الإطار الزمني الأعلى.", "La tendance de l'unité de temps supérieure n'a pas pu être vérifiée.");
  else if (engine.higherTimeframe.direction === "Bearish")
    add("The higher-timeframe trend is bearish.", "اتجاه الإطار الزمني الأعلى هابط.", "La tendance de l'unité de temps supérieure est baissière.");
  return out;
}

export function invalidationExplanation(engine: EngineResult, lang: Lang, fmt: (n: number) => string): string {
  if (engine.plan)
    return {
      en: `A close below the stop-loss at ${fmt(engine.plan.stopLoss)} invalidates this setup.`,
      ar: `إغلاق تحت وقف الخسارة عند ${fmt(engine.plan.stopLoss)} يُبطل هذه الفرصة.`,
      fr: `Une clôture sous le stop-loss à ${fmt(engine.plan.stopLoss)} invalide ce setup.`,
    }[lang];
  return {
    en: "There is no active setup, so there is no invalidation level.",
    ar: "لا توجد فرصة نشطة، لذا لا يوجد مستوى إبطال.",
    fr: "Aucun setup n'est actif, donc il n'y a pas de niveau d'invalidation.",
  }[lang];
}

export const RISK_NOTE: Record<Lang, string> = {
  en: "Structural analysis, not financial advice. Size positions by your own risk tolerance.",
  ar: "تحليل هيكلي وليس نصيحة مالية. حدّد حجم صفقتك وفق قدرتك على تحمّل المخاطر.",
  fr: "Analyse structurelle, pas un conseil financier. Dimensionnez vos positions selon votre tolérance au risque.",
};
// QA-P4-2355
