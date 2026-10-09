"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage, type Lang } from "@/lib/i18n";

// ───────────────────────── Shared palette & system ─────────────────────────
// Exactly three accents, used consistently in meaning across every diagram:
//   BLUE  = the main price/action line (always)
//   AMBER = the unfavorable / danger / resistance / bearish state
//   TEAL  = the favorable / safe / support / bullish state
// MUTED is used only for neutral/reference elements (grid lines, baselines).
const BLUE = "#378ADD";
const AMBER = "#BA7517";
const AMBER_FILL = "#854F0B";
const TEAL = "#0F6E56";
const TEAL_FILL = "#085041";
const MUTED = "#8A94A6";

const DRAW_S = 1.6; // seconds — standard draw-in duration for every diagram

// ───────────────────────── Localized text ─────────────────────────
type Tx = { en: string; ar: string; fr: string };
const tx = (lang: Lang, o: Tx) => o[lang];

// ───────────────────────── Animation CSS (once) ─────────────────────────
function DiagramStyles() {
  return (
    <style>{`
      .lesson-diagram .draw-path { stroke-dasharray: 1; stroke-dashoffset: 0; }
      .lesson-diagram .pulse-dot, .lesson-diagram .emphasis { opacity: 1; }
      .lesson-diagram circle, .lesson-diagram rect, .lesson-diagram g {
        transform-box: fill-box; transform-origin: center;
      }

      @media (prefers-reduced-motion: no-preference) {
        .lesson-diagram .draw-path { stroke-dashoffset: 1; }
        .lesson-diagram.in-view .draw-path {
          animation: lessonDrawPath ${DRAW_S}s ease-out forwards;
        }
        .lesson-diagram .pulse-dot { opacity: 0; transform: scale(0.3); }
        .lesson-diagram.in-view .pulse-dot {
          animation: lessonPulseDot 0.5s ease-out forwards;
          animation-delay: var(--delay, 0.4s);
        }
        .lesson-diagram .emphasis { opacity: 0; transform: scale(0.7); }
        .lesson-diagram.in-view .emphasis {
          animation: lessonEmphasis 0.6s ease-out forwards;
          animation-delay: var(--delay, ${DRAW_S}s);
        }
        @keyframes lessonDrawPath { to { stroke-dashoffset: 0; } }
        @keyframes lessonPulseDot {
          0% { opacity: 0; transform: scale(0.3); }
          60% { opacity: 1; transform: scale(1.4); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes lessonEmphasis {
          0% { opacity: 0; transform: scale(0.7); }
          60% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 1; transform: scale(1); }
        }
      }
    `}</style>
  );
}

// ───────────────────────── Scroll-into-view wrapper ─────────────────────────
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

// ───────────────────────── SVG root ─────────────────────────
// Pinned to direction: ltr so text-anchor start/end always mean physical
// left/right. Without this, SVG text inherits the page's direction and the
// anchors flip when the site is in Arabic (RTL), misplacing every label.
// Arabic is mirrored explicitly where it matters (legend, checklist).
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 380 320"
      className="w-full h-auto"
      xmlns="http://www.w3.org/2000/svg"
      style={{ direction: "ltr" }}
    >
      {children}
    </svg>
  );
}

// ───────────────────────── Legend ─────────────────────────
// Single column, full width per row. Left-aligned (dot on the left) for
// English/French, mirrored (dot on the right, text right-aligned) for Arabic.
function Legend({ items, lang }: { items: { color: string; label: Tx }[]; lang: Lang }) {
  const isAr = lang === "ar";
  const dividerY = 238;
  const rowStart = 262;
  const rowGap = 22;
  return (
    <g>
      <line x1="16" y1={dividerY} x2="364" y2={dividerY} stroke="#212a36" strokeWidth="1" />
      {items.map((item, i) => {
        const y = rowStart + i * rowGap;
        return (
          <g key={item.label.en}>
            <circle cx={isAr ? 356 : 24} cy={y} r="5" fill={item.color} />
            <text
              x={isAr ? 342 : 38}
              y={y + 4}
              fill={MUTED}
              fontSize="12"
              fontFamily="sans-serif"
              textAnchor={isAr ? "end" : "start"}
            >
              {tx(lang, item.label)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

type DiagramProps = { lang: Lang };
const delay = (s: string) => ({ "--delay": s }) as React.CSSProperties;

// ───────────────────────── 1. Support & Resistance ─────────────────────────
function SupportResistanceDiagram({ lang }: DiagramProps) {
  return (
    <Svg>
      <line x1="16" y1="50" x2="364" y2="50" stroke={AMBER} strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="16" y1="170" x2="280" y2="170" stroke={TEAL} strokeWidth="1.5" strokeDasharray="4 4" />
      <path
        className="draw-path"
        pathLength="1"
        d="M 16 110 C 50 65, 70 50, 85 50 C 105 50, 112 150, 128 170
           C 145 190, 160 170, 175 170 C 200 170, 208 65, 230 50
           C 250 40, 265 150, 280 170 C 300 190, 315 150, 335 85
           C 350 50, 358 25, 364 15"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle className="pulse-dot" style={delay("0.5s")} cx="85" cy="50" r="5" fill={AMBER} />
      <circle className="pulse-dot" style={delay("0.8s")} cx="175" cy="170" r="5" fill={TEAL} />
      <circle className="pulse-dot" style={delay("1.0s")} cx="230" cy="50" r="5" fill={AMBER} />
      <circle className="pulse-dot" style={delay("1.3s")} cx="280" cy="170" r="5" fill={TEAL} />
      <g className="emphasis" style={delay(`${DRAW_S}s`)}>
        <path d="M 335 50 L 352 20 L 345 32 M 352 20 L 340 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "Price", ar: "السعر", fr: "Prix" } },
          { color: AMBER, label: { en: "Resistance", ar: "مقاومة", fr: "Résistance" } },
          { color: TEAL, label: { en: "Support", ar: "دعم", fr: "Support" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 2. What is Crypto ─────────────────────────
function WhatIsCryptoDiagram({ lang }: DiagramProps) {
  const blocks = [60, 140, 220, 300];
  return (
    <Svg>
      {blocks.slice(0, -1).map((x, i) => (
        <line key={i} className="draw-path" pathLength="1" x1={x + 26} y1="100" x2={blocks[i + 1] - 26} y2="100" stroke={MUTED} strokeWidth="2" />
      ))}
      {blocks.map((x, i) => {
        const isLast = i === blocks.length - 1;
        return (
          <g key={x} className={isLast ? "emphasis" : undefined} style={isLast ? delay(`${DRAW_S}s`) : undefined}>
            <rect x={x - 26} y="72" width="52" height="56" rx="8" fill="none" stroke={isLast ? AMBER : BLUE} strokeWidth="2.5" />
            <text x={x} y="105" fill={isLast ? AMBER : BLUE} fontSize="11" fontFamily="monospace" textAnchor="middle">#{i + 1}</text>
          </g>
        );
      })}
      <text x="190" y="170" fill={MUTED} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, {
          en: "A shared ledger held by thousands of devices",
          ar: "سجل موزّع يملك نسخته آلاف الأجهزة",
          fr: "Un registre partagé sur des milliers d'appareils",
        })}
      </text>
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "Previous blocks", ar: "كتل سابقة", fr: "Blocs précédents" } },
          { color: AMBER, label: { en: "Current block", ar: "الكتلة الحالية", fr: "Bloc actuel" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 3. Investing vs Trading ─────────────────────────
function InvestingVsTradingDiagram({ lang }: DiagramProps) {
  const investing: Tx = { en: "Long-term investing", ar: "استثمار طويل المدى", fr: "Investissement à long terme" };
  const trading: Tx = { en: "Active trading", ar: "تداول نشط", fr: "Trading actif" };
  return (
    <Svg>
      <text x="190" y="30" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">{tx(lang, investing)}</text>
      <path className="draw-path" pathLength="1" d="M 20 90 C 80 85, 140 65, 200 50 C 250 38, 300 30, 360 22" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" />
      <circle className="pulse-dot" style={delay("1.5s")} cx="360" cy="22" r="5" fill={TEAL} />

      <text x="190" y="140" fill={BLUE} fontSize="12" fontFamily="sans-serif" textAnchor="middle">{tx(lang, trading)}</text>
      <path
        className="draw-path" pathLength="1"
        d="M 20 200 L 60 170 L 95 215 L 130 155 L 165 205 L 200 150 L 235 195 L 270 165 L 360 180"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
      {[60, 130, 200, 270].map((x, i) => (
        <circle key={x} className="pulse-dot" style={delay(`${0.5 + i * 0.25}s`)} cx={x} cy={[170, 155, 150, 165][i]} r="4" fill={AMBER} />
      ))}
      <Legend
        lang={lang}
        items={[
          { color: TEAL, label: investing },
          { color: BLUE, label: trading },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 4. Reading Candlesticks ─────────────────────────
function ReadingCandlesticksDiagram({ lang }: DiagramProps) {
  // Three candles: bearish, bullish (labeled), bearish — real bodies + wicks.
  const candles = [
    { x: 70, open: 110, close: 150, high: 95, low: 165, bullish: false },
    { x: 190, open: 155, close: 90, high: 75, low: 170, bullish: true },
    { x: 310, open: 100, close: 135, high: 85, low: 150, bullish: false },
  ];
  const mid = candles[1];
  return (
    <Svg>
      {candles.map((c, i) => {
        const bodyTop = Math.min(c.open, c.close);
        const bodyBottom = Math.max(c.open, c.close);
        const color = c.bullish ? TEAL : AMBER;
        return (
          <g key={c.x} className="emphasis" style={delay(`${0.2 + i * 0.3}s`)}>
            <line className="draw-path" pathLength="1" x1={c.x} y1={c.high} x2={c.x} y2={c.low} stroke={color} strokeWidth="2" />
            <rect x={c.x - 18} y={bodyTop} width="36" height={Math.max(bodyBottom - bodyTop, 2)} fill={color} />
          </g>
        );
      })}

      {/* Leader lines + labels for the middle (bullish) candle */}
      <g className="emphasis" style={delay("1.3s")}>
        <line x1={mid.x + 18} y1={mid.close} x2={mid.x + 55} y2={mid.close} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x + 60} y={mid.close + 4} fill={MUTED} fontSize="11" fontFamily="sans-serif">
          {tx(lang, { en: "Close", ar: "إغلاق", fr: "Clôture" })}
        </text>

        <line x1={mid.x - 18} y1={mid.open} x2={mid.x - 55} y2={mid.open} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x - 60} y={mid.open + 4} fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="end">
          {tx(lang, { en: "Open", ar: "افتتاح", fr: "Ouverture" })}
        </text>

        <line x1={mid.x} y1={mid.high} x2={mid.x} y2={mid.high - 20} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x} y={mid.high - 25} fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
          {tx(lang, { en: "High", ar: "أعلى", fr: "Plus haut" })}
        </text>

        <line x1={mid.x} y1={mid.low} x2={mid.x} y2={mid.low + 20} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x} y={mid.low + 32} fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
          {tx(lang, { en: "Low", ar: "أدنى", fr: "Plus bas" })}
        </text>
      </g>

      <Legend
        lang={lang}
        items={[
          { color: TEAL, label: { en: "Bullish candle", ar: "شمعة صاعدة", fr: "Bougie haussière" } },
          { color: AMBER, label: { en: "Bearish candle", ar: "شمعة هابطة", fr: "Bougie baissière" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 5. Trend Direction ─────────────────────────
function TrendDirectionDiagram({ lang }: DiagramProps) {
  return (
    <Svg>
      <text x="190" y="22" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "Uptrend", ar: "صاعد", fr: "Haussier" })}
      </text>
      <path className="draw-path" pathLength="1" d="M 20 68 L 55 40 L 42 52 L 100 15 L 85 28 L 150 5" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <text x="190" y="98" fill={AMBER} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "Downtrend", ar: "هابط", fr: "Baissier" })}
      </text>
      <path className="draw-path" pathLength="1" d="M 20 110 L 55 128 L 42 120 L 100 146 L 85 138 L 150 150" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <text x="190" y="172" fill={BLUE} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "Sideways", ar: "عرضي", fr: "Latéral" })}
      </text>
      <line x1="20" y1="200" x2="360" y2="200" stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="20" y1="185" x2="360" y2="185" stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
      <path className="draw-path" pathLength="1" d="M 20 192 L 55 198 L 90 187 L 125 199 L 160 189 L 195 196" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <Legend
        lang={lang}
        items={[
          { color: TEAL, label: { en: "Uptrend", ar: "اتجاه صاعد", fr: "Tendance haussière" } },
          { color: AMBER, label: { en: "Downtrend", ar: "اتجاه هابط", fr: "Tendance baissière" } },
          { color: BLUE, label: { en: "Sideways trend", ar: "اتجاه عرضي", fr: "Tendance latérale" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 6. Breakout & Retest ─────────────────────────
function BreakoutRetestDiagram({ lang }: DiagramProps) {
  return (
    <Svg>
      <line x1="16" y1="90" x2="364" y2="90" stroke={AMBER} strokeWidth="1.5" strokeDasharray="4 4" />
      <path
        className="draw-path" pathLength="1"
        d="M 16 170 C 60 160, 100 110, 140 90 C 175 72, 200 40, 230 35
           C 255 32, 270 68, 290 90 C 305 105, 315 95, 330 78
           C 345 60, 355 35, 364 18"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle className="pulse-dot" style={delay("0.7s")} cx="230" cy="35" r="5" fill={TEAL} />
      <circle className="pulse-dot" style={delay("1.0s")} cx="290" cy="90" r="5" fill={AMBER} />
      <g className="emphasis" style={delay(`${DRAW_S}s`)}>
        <path d="M 345 40 L 360 15 L 353 27 M 360 15 L 348 19" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "Price", ar: "السعر", fr: "Prix" } },
          { color: AMBER, label: { en: "Broken resistance", ar: "المقاومة المكسورة", fr: "Résistance cassée" } },
          { color: TEAL, label: { en: "Successful retest", ar: "نجاح إعادة الاختبار", fr: "Retest réussi" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 7. Relative Strength vs BTC ─────────────────────────
function RelativeStrengthBtcDiagram({ lang }: DiagramProps) {
  return (
    <Svg>
      <path className="draw-path" pathLength="1" d="M 16 190 L 110 178 L 200 168 L 290 158 L 364 150" fill="none" stroke={MUTED} strokeWidth="2" strokeDasharray="5 5" />
      <path className="draw-path" pathLength="1" d="M 16 190 L 110 155 L 200 110 L 290 65 L 364 28" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="pulse-dot" style={delay("0.3s")} cx="16" cy="190" r="4" fill={MUTED} />
      <g className="emphasis" style={delay(`${DRAW_S}s`)}>
        <line x1="290" y1="65" x2="290" y2="158" stroke={TEAL} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="290" cy="65" r="5" fill={TEAL} />
      </g>
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "The coin", ar: "العملة", fr: "La crypto" } },
          { color: MUTED, label: { en: "BTC (reference)", ar: "BTC (مرجع)", fr: "BTC (référence)" } },
          { color: TEAL, label: { en: "Outperformance point", ar: "نقطة التفوق", fr: "Point de surperformance" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 8. Risk Percentage ─────────────────────────
function RiskPercentageDiagram({ lang }: DiagramProps) {
  return (
    <Svg>
      <text x="95" y="22" fill={AMBER} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "20% risk", ar: "مخاطرة 20%", fr: "Risque de 20 %" })}
      </text>
      <rect x="30" y="35" width="130" height="150" fill="none" stroke="#212a36" strokeWidth="1" />
      <g className="emphasis" style={delay("0.3s")}>
        <path d="M 30 35 L 160 35 L 160 70 C 120 85, 70 130, 45 185 L 30 185 Z" fill={AMBER_FILL} />
      </g>
      <text x="95" y="205" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "2 losses ≈ wiped out", ar: "خسارتان = تصفية تقريباً", fr: "2 pertes ≈ compte ruiné" })}
      </text>

      <text x="285" y="22" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "1% risk", ar: "مخاطرة 1%", fr: "Risque de 1 %" })}
      </text>
      <rect x="220" y="35" width="130" height="150" fill="none" stroke="#212a36" strokeWidth="1" />
      <g className="emphasis" style={delay("0.6s")}>
        <path d="M 220 35 L 350 35 L 350 45 L 220 48 Z" fill={TEAL_FILL} />
      </g>
      <text x="285" y="205" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "Same 2 losses = small dent", ar: "نفس الخسارتين = أثر بسيط", fr: "Mêmes 2 pertes = impact léger" })}
      </text>

      <Legend
        lang={lang}
        items={[
          { color: AMBER, label: { en: "High risk per trade", ar: "مخاطرة مرتفعة لكل صفقة", fr: "Risque élevé par trade" } },
          { color: TEAL, label: { en: "Low, fixed risk", ar: "مخاطرة منخفضة وثابتة", fr: "Risque faible et fixe" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 9. Stop-Loss ─────────────────────────
function StopLossDiagram({ lang }: DiagramProps) {
  const stopLabel: Tx = { en: "Stop-loss", ar: "وقف الخسارة", fr: "Stop-loss" };
  return (
    <Svg>
      <path className="draw-path" pathLength="1" d="M 16 110 C 60 90, 90 70, 120 55" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <circle className="pulse-dot" style={delay("0.4s")} cx="120" cy="55" r="5" fill={TEAL} />
      <text x="120" y="38" fill={TEAL} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "Entry", ar: "دخول", fr: "Entrée" })}
      </text>

      <path className="draw-path" pathLength="1" d="M 120 55 C 160 80, 190 130, 220 165" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="165" x2="364" y2="165" stroke={AMBER} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="16" y="182" fill={AMBER} fontSize="12" fontFamily="sans-serif">{tx(lang, stopLabel)}</text>
      <g className="emphasis" style={delay(`${DRAW_S}s`)}>
        <circle cx="220" cy="165" r="6" fill={AMBER} />
        <path d="M 213 158 L 227 172 M 227 158 L 213 172" stroke="#0a0d12" strokeWidth="2" strokeLinecap="round" />
      </g>
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "Price", ar: "السعر", fr: "Prix" } },
          { color: TEAL, label: { en: "Entry point", ar: "نقطة الدخول", fr: "Point d'entrée" } },
          { color: AMBER, label: stopLabel },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 10. Position Sizing ─────────────────────────
function PositionSizingDiagram({ lang }: DiagramProps) {
  const inputs: { x: number; label: Tx }[] = [
    { x: 70, label: { en: "Account size", ar: "حجم الحساب", fr: "Taille du compte" } },
    { x: 190, label: { en: "Risk %", ar: "نسبة المخاطرة", fr: "% de risque" } },
    { x: 310, label: { en: "Stop distance", ar: "مسافة الوقف", fr: "Distance du stop" } },
  ];
  return (
    <Svg>
      {inputs.map((inp, i) => (
        <g key={inp.x}>
          <rect x={inp.x - 55} y="20" width="110" height="46" rx="8" fill="none" stroke={BLUE} strokeWidth="2" />
          <text x={inp.x} y="48" fill={BLUE} fontSize="11" fontFamily="sans-serif" textAnchor="middle">{tx(lang, inp.label)}</text>
          <line className="draw-path" pathLength="1" x1={inp.x} y1="66" x2="190" y2="130" stroke={MUTED} strokeWidth="1.5" />
          <circle className="pulse-dot" style={delay(`${0.5 + i * 0.2}s`)} cx={inp.x} cy="66" r="3.5" fill={BLUE} />
        </g>
      ))}
      <g className="emphasis" style={delay(`${DRAW_S}s`)}>
        <rect x="105" y="135" width="170" height="48" rx="8" fill="none" stroke={TEAL} strokeWidth="2.5" />
        <text x="190" y="164" fill={TEAL} fontSize="13" fontFamily="sans-serif" fontWeight="600" textAnchor="middle">
          {tx(lang, { en: "Position size", ar: "حجم الصفقة", fr: "Taille de position" })}
        </text>
      </g>
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "The three inputs", ar: "المدخلات الثلاثة", fr: "Les trois données" } },
          { color: TEAL, label: { en: "Calculated result", ar: "الناتج المحسوب", fr: "Résultat calculé" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 11. Trade Plan Checklist ─────────────────────────
function TradePlanChecklistDiagram({ lang }: DiagramProps) {
  const isAr = lang === "ar";
  const items: Tx[] = [
    { en: "Entry point", ar: "نقطة الدخول", fr: "Point d'entrée" },
    { en: "Target", ar: "الهدف", fr: "Objectif" },
    { en: "Stop-loss", ar: "وقف الخسارة", fr: "Stop-loss" },
    { en: "R:R ratio", ar: "نسبة R:R", fr: "Ratio R:R" },
  ];
  // Mirrored for Arabic: checkmark on the right, text right-aligned.
  const cx = isAr ? 285 : 95;
  return (
    <Svg>
      <rect x="60" y="15" width="260" height="215" rx="12" fill="none" stroke="#212a36" strokeWidth="1.5" />
      {items.map((label, i) => {
        const y = 55 + i * 45;
        return (
          <g key={label.en} className="emphasis" style={delay(`${0.2 + i * 0.25}s`)}>
            <circle cx={cx} cy={y} r="11" fill="none" stroke={TEAL} strokeWidth="2" />
            <path d={`M ${cx - 5} ${y} L ${cx - 1} ${y + 4} L ${cx + 6} ${y - 5}`} fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text
              x={isAr ? cx - 25 : cx + 25}
              y={y + 5}
              fill={BLUE}
              fontSize="14"
              fontFamily="sans-serif"
              textAnchor={isAr ? "end" : "start"}
            >
              {tx(lang, label)}
            </text>
          </g>
        );
      })}
      <Legend
        lang={lang}
        items={[{ color: TEAL, label: { en: "Completed plan item", ar: "عنصر مكتمل في الخطة", fr: "Élément du plan complété" } }]}
      />
    </Svg>
  );
}

// ───────────────────────── 12. FOMO ─────────────────────────
function FomoDiagram({ lang }: DiagramProps) {
  return (
    <Svg>
      <path
        className="draw-path" pathLength="1"
        d="M 16 195 C 60 188, 110 165, 150 130 C 185 100, 210 55, 240 25"
        fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle className="pulse-dot" style={delay("1.1s")} cx="240" cy="25" r="6" fill={AMBER} />
      <text x="260" y="20" fill={AMBER} fontSize="11" fontFamily="sans-serif">
        {tx(lang, { en: "Late entry", ar: "دخول متأخر", fr: "Entrée tardive" })}
      </text>
      <path
        className="draw-path" pathLength="1"
        d="M 240 25 C 265 38, 290 90, 315 130 C 335 160, 350 175, 364 190"
        fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round"
      />
      <text x="300" y="210" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">
        {tx(lang, { en: "Natural pullback", ar: "تصحيح طبيعي", fr: "Repli naturel" })}
      </text>
      <Legend
        lang={lang}
        items={[
          { color: TEAL, label: { en: "The underlying move", ar: "الحركة الأساسية", fr: "Le mouvement de fond" } },
          { color: AMBER, label: { en: "Late entry and pullback", ar: "دخول متأخر وتصحيح", fr: "Entrée tardive et repli" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── 13. Trading Journal Habit ─────────────────────────
function TradingJournalHabitDiagram({ lang }: DiagramProps) {
  const steps: { x: number; y: number; label: Tx }[] = [
    { x: 190, y: 30, label: { en: "Plan", ar: "خطة", fr: "Plan" } },
    { x: 320, y: 100, label: { en: "Execute", ar: "تنفيذ", fr: "Exécuter" } },
    { x: 270, y: 200, label: { en: "Log", ar: "تسجيل", fr: "Noter" } },
    { x: 110, y: 200, label: { en: "Review", ar: "مراجعة", fr: "Revoir" } },
    { x: 60, y: 100, label: { en: "Improve", ar: "تحسين", fr: "Améliorer" } },
  ];
  return (
    <Svg>
      <circle cx="190" cy="115" r="95" fill="none" stroke="#212a36" strokeWidth="1" strokeDasharray="3 5" />
      {steps.map((s, i) => {
        const next = steps[(i + 1) % steps.length];
        return (
          <line
            key={`l-${i}`} className="draw-path" pathLength="1"
            x1={s.x} y1={s.y} x2={next.x} y2={next.y}
            stroke={BLUE} strokeWidth="1.5"
          />
        );
      })}
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const color = isLast ? TEAL : BLUE;
        return (
          <g key={s.label.en} className="pulse-dot" style={delay(`${0.4 + i * 0.22}s`)}>
            <circle cx={s.x} cy={s.y} r="27" fill="none" stroke={color} strokeWidth="2" />
            <text x={s.x} y={s.y + 4} fill={color} fontSize="11" fontFamily="sans-serif" textAnchor="middle">{tx(lang, s.label)}</text>
          </g>
        );
      })}
      <Legend
        lang={lang}
        items={[
          { color: BLUE, label: { en: "Steps of the repeating cycle", ar: "خطوات الدورة المتكررة", fr: "Étapes du cycle répété" } },
          { color: TEAL, label: { en: "Continuous improvement", ar: "التحسين المستمر", fr: "Amélioration continue" } },
        ]}
      />
    </Svg>
  );
}

// ───────────────────────── Placeholder (unbuilt diagrams fallback) ─────────────────────────
function PlaceholderDiagram({ lang }: DiagramProps) {
  return (
    <div className="w-full aspect-[380/320] rounded-xl border border-dashed border-line flex items-center justify-center text-text-muted text-sm">
      {tx(lang, { en: "Diagram coming soon", ar: "الرسم التوضيحي قيد الإعداد", fr: "Schéma bientôt disponible" })}
    </div>
  );
}

const DIAGRAMS: Record<string, (props: DiagramProps) => React.JSX.Element> = {
  "support-resistance": SupportResistanceDiagram,
  "what-is-crypto": WhatIsCryptoDiagram,
  "investing-vs-trading": InvestingVsTradingDiagram,
  "reading-candlesticks": ReadingCandlesticksDiagram,
  "trend-direction": TrendDirectionDiagram,
  "breakout-retest": BreakoutRetestDiagram,
  "relative-strength-btc": RelativeStrengthBtcDiagram,
  "risk-percentage": RiskPercentageDiagram,
  "stop-loss": StopLossDiagram,
  "position-sizing": PositionSizingDiagram,
  "trade-plan-checklist": TradePlanChecklistDiagram,
  fomo: FomoDiagram,
  "trading-journal-habit": TradingJournalHabitDiagram,
};

export default function LessonDiagram({ diagramId }: { diagramId: string }) {
  const { lang } = useLanguage();
  const { ref, inView } = useInView<HTMLDivElement>();
  const Diagram = DIAGRAMS[diagramId];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <DiagramStyles />
      <div ref={ref} className={`lesson-diagram${inView ? " in-view" : ""}`}>
        {Diagram ? <Diagram lang={lang} /> : <PlaceholderDiagram lang={lang} />}
      </div>
    </div>
  );
}
