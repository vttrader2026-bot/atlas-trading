"use client";

import { useEffect, useRef, useState } from "react";

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

// ───────────────────────── Legend ─────────────────────────
function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <g>
      <line x1="16" y1="246" x2="364" y2="246" stroke="#212a36" strokeWidth="1" />
      {items.map((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 20 + col * 185;
        const y = 268 + row * 24;
        return (
          <g key={item.label}>
            <circle cx={x} cy={y} r="5" fill={item.color} />
            <text x={x + 12} y={y + 4} fill={MUTED} fontSize="12" fontFamily="sans-serif">
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ───────────────────────── 1. Support & Resistance (redone) ─────────────────────────
function SupportResistanceDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
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
      <circle className="pulse-dot" style={{ "--delay": "0.5s" } as React.CSSProperties} cx="85" cy="50" r="5" fill={AMBER} />
      <circle className="pulse-dot" style={{ "--delay": "0.8s" } as React.CSSProperties} cx="175" cy="170" r="5" fill={TEAL} />
      <circle className="pulse-dot" style={{ "--delay": "1.0s" } as React.CSSProperties} cx="230" cy="50" r="5" fill={AMBER} />
      <circle className="pulse-dot" style={{ "--delay": "1.3s" } as React.CSSProperties} cx="280" cy="170" r="5" fill={TEAL} />
      <g className="emphasis" style={{ "--delay": `${DRAW_S}s` } as React.CSSProperties}>
        <path d="M 335 50 L 352 20 L 345 32 M 352 20 L 340 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Legend items={[
        { color: BLUE, label: "السعر" },
        { color: AMBER, label: "مقاومة" },
        { color: TEAL, label: "دعم" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 2. What is Crypto ─────────────────────────
function WhatIsCryptoDiagram() {
  const blocks = [60, 140, 220, 300];
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {blocks.slice(0, -1).map((x, i) => (
        <line key={i} className="draw-path" pathLength="1" x1={x + 26} y1="100" x2={blocks[i + 1] - 26} y2="100" stroke={MUTED} strokeWidth="2" />
      ))}
      {blocks.map((x, i) => {
        const isLast = i === blocks.length - 1;
        return (
          <g key={x} className={isLast ? "emphasis" : undefined} style={isLast ? ({ "--delay": `${DRAW_S}s` } as React.CSSProperties) : undefined}>
            <rect x={x - 26} y="72" width="52" height="56" rx="8" fill="none" stroke={isLast ? AMBER : BLUE} strokeWidth="2.5" />
            <text x={x} y="105" fill={isLast ? AMBER : BLUE} fontSize="11" fontFamily="monospace" textAnchor="middle">#{i + 1}</text>
          </g>
        );
      })}
      <text x="190" y="170" fill={MUTED} fontSize="12" fontFamily="sans-serif" textAnchor="middle">
        سجل موزّع يملك نسخته آلاف الأجهزة
      </text>
      <Legend items={[
        { color: BLUE, label: "كتل سابقة" },
        { color: AMBER, label: "الكتلة الحالية" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 3. Investing vs Trading ─────────────────────────
function InvestingVsTradingDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <text x="190" y="30" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">استثمار طويل المدى</text>
      <path className="draw-path" pathLength="1" d="M 20 90 C 80 85, 140 65, 200 50 C 250 38, 300 30, 360 22" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" />
      <circle className="pulse-dot" style={{ "--delay": "1.5s" } as React.CSSProperties} cx="360" cy="22" r="5" fill={TEAL} />

      <text x="190" y="150" fill={BLUE} fontSize="12" fontFamily="sans-serif" textAnchor="middle">تداول نشط</text>
      <path
        className="draw-path" pathLength="1"
        d="M 20 220 L 60 185 L 95 235 L 130 170 L 165 225 L 200 160 L 235 220 L 270 175 L 360 195"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
      {[60, 130, 200, 270].map((x, i) => (
        <circle key={x} className="pulse-dot" style={{ "--delay": `${0.5 + i * 0.25}s` } as React.CSSProperties} cx={x} cy={[185, 170, 160, 175][i]} r="4" fill={AMBER} />
      ))}
      <Legend items={[
        { color: TEAL, label: "استثمار طويل المدى" },
        { color: BLUE, label: "تداول نشط" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 4. Reading Candlesticks (rebuilt with care) ─────────────────────────
function ReadingCandlesticksDiagram() {
  // Three candles: bearish, bullish (labeled), bearish — real bodies + wicks.
  const candles = [
    { x: 70, open: 110, close: 150, high: 95, low: 165, bullish: false },
    { x: 190, open: 155, close: 90, high: 75, low: 170, bullish: true },
    { x: 310, open: 100, close: 135, high: 85, low: 150, bullish: false },
  ];
  const mid = candles[1];
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {candles.map((c, i) => {
        const bodyTop = Math.min(c.open, c.close);
        const bodyBottom = Math.max(c.open, c.close);
        const color = c.bullish ? TEAL : AMBER;
        return (
          <g key={c.x} className="emphasis" style={{ "--delay": `${0.2 + i * 0.3}s` } as React.CSSProperties}>
            <line className="draw-path" pathLength="1" x1={c.x} y1={c.high} x2={c.x} y2={c.low} stroke={color} strokeWidth="2" />
            <rect x={c.x - 18} y={bodyTop} width="36" height={Math.max(bodyBottom - bodyTop, 2)} fill={color} />
          </g>
        );
      })}

      {/* Leader lines + labels for the middle (bullish) candle */}
      <g className="emphasis" style={{ "--delay": "1.3s" } as React.CSSProperties}>
        <line x1={mid.x + 18} y1={mid.close} x2={mid.x + 55} y2={mid.close} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x + 60} y={mid.close + 4} fill={MUTED} fontSize="11" fontFamily="sans-serif">إغلاق</text>

        <line x1={mid.x - 18} y1={mid.open} x2={mid.x - 55} y2={mid.open} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x - 60} y={mid.open + 4} fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="end">افتتاح</text>

        <line x1={mid.x} y1={mid.high} x2={mid.x} y2={mid.high - 20} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x} y={mid.high - 25} fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">أعلى</text>

        <line x1={mid.x} y1={mid.low} x2={mid.x} y2={mid.low + 20} stroke={MUTED} strokeWidth="1" />
        <text x={mid.x} y={mid.low + 32} fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">أدنى</text>
      </g>

      <Legend items={[
        { color: TEAL, label: "شمعة صاعدة" },
        { color: AMBER, label: "شمعة هابطة" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 5. Trend Direction ─────────────────────────
function TrendDirectionDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <text x="190" y="22" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">صاعد</text>
      <path className="draw-path" pathLength="1" d="M 20 68 L 55 40 L 42 52 L 100 15 L 85 28 L 150 5" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <text x="190" y="118" fill={AMBER} fontSize="12" fontFamily="sans-serif" textAnchor="middle">هابط</text>
      <path className="draw-path" pathLength="1" d="M 20 130 L 55 158 L 42 146 L 100 185 L 85 172 L 150 205" fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <text x="190" y="218" fill={BLUE} fontSize="12" fontFamily="sans-serif" textAnchor="middle">عرضي</text>
      <line x1="20" y1="240" x2="360" y2="240" stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="20" y1="228" x2="360" y2="228" stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
      <path className="draw-path" pathLength="1" d="M 20 234 L 55 228 L 90 240 L 125 230 L 160 238 L 195 229" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <Legend items={[
        { color: TEAL, label: "اتجاه صاعد" },
        { color: AMBER, label: "اتجاه هابط" },
        { color: BLUE, label: "اتجاه عرضي" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 6. Breakout & Retest ─────────────────────────
function BreakoutRetestDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <line x1="16" y1="90" x2="364" y2="90" stroke={AMBER} strokeWidth="1.5" strokeDasharray="4 4" />
      <path
        className="draw-path" pathLength="1"
        d="M 16 170 C 60 160, 100 110, 140 90 C 175 72, 200 40, 230 35
           C 255 32, 270 68, 290 90 C 305 105, 315 95, 330 78
           C 345 60, 355 35, 364 18"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle className="pulse-dot" style={{ "--delay": "0.7s" } as React.CSSProperties} cx="230" cy="35" r="5" fill={TEAL} />
      <circle className="pulse-dot" style={{ "--delay": "1.0s" } as React.CSSProperties} cx="290" cy="90" r="5" fill={AMBER} />
      <g className="emphasis" style={{ "--delay": `${DRAW_S}s` } as React.CSSProperties}>
        <path d="M 345 40 L 360 15 L 353 27 M 360 15 L 348 19" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <Legend items={[
        { color: BLUE, label: "السعر" },
        { color: AMBER, label: "المقاومة المكسورة" },
        { color: TEAL, label: "نجاح إعادة الاختبار" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 7. Relative Strength vs BTC ─────────────────────────
function RelativeStrengthBtcDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <path className="draw-path" pathLength="1" d="M 16 190 L 110 178 L 200 168 L 290 158 L 364 150" fill="none" stroke={MUTED} strokeWidth="2" strokeDasharray="5 5" />
      <path className="draw-path" pathLength="1" d="M 16 190 L 110 155 L 200 110 L 290 65 L 364 28" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="pulse-dot" style={{ "--delay": "0.3s" } as React.CSSProperties} cx="16" cy="190" r="4" fill={MUTED} />
      <g className="emphasis" style={{ "--delay": `${DRAW_S}s` } as React.CSSProperties}>
        <line x1="290" y1="65" x2="290" y2="158" stroke={TEAL} strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="290" cy="65" r="5" fill={TEAL} />
      </g>
      <Legend items={[
        { color: BLUE, label: "العملة" },
        { color: MUTED, label: "BTC (مرجع)" },
        { color: TEAL, label: "نقطة التفوق" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 8. Risk Percentage ─────────────────────────
function RiskPercentageDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <text x="95" y="22" fill={AMBER} fontSize="12" fontFamily="sans-serif" textAnchor="middle">مخاطرة 20%</text>
      <rect x="30" y="35" width="130" height="150" fill="none" stroke="#212a36" strokeWidth="1" />
      <g className="emphasis" style={{ "--delay": "0.3s" } as React.CSSProperties}>
        <path d="M 30 35 L 160 35 L 160 70 C 120 85, 70 130, 45 185 L 30 185 Z" fill={AMBER_FILL} />
      </g>
      <text x="95" y="205" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">خسارتان = تصفية تقريباً</text>

      <text x="285" y="22" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">مخاطرة 1%</text>
      <rect x="220" y="35" width="130" height="150" fill="none" stroke="#212a36" strokeWidth="1" />
      <g className="emphasis" style={{ "--delay": "0.6s" } as React.CSSProperties}>
        <path d="M 220 35 L 350 35 L 350 45 L 220 48 Z" fill={TEAL_FILL} />
      </g>
      <text x="285" y="205" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">نفس الخسارتين = أثر بسيط</text>

      <Legend items={[
        { color: AMBER, label: "مخاطرة مرتفعة لكل صفقة" },
        { color: TEAL, label: "مخاطرة منخفضة وثابتة" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 9. Stop-Loss ─────────────────────────
function StopLossDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <path className="draw-path" pathLength="1" d="M 16 110 C 60 90, 90 70, 120 55" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <circle className="pulse-dot" style={{ "--delay": "0.4s" } as React.CSSProperties} cx="120" cy="55" r="5" fill={TEAL} />
      <text x="120" y="38" fill={TEAL} fontSize="11" fontFamily="sans-serif" textAnchor="middle">دخول</text>

      <path className="draw-path" pathLength="1" d="M 120 55 C 160 80, 190 130, 220 165" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="165" x2="364" y2="165" stroke={AMBER} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="16" y="182" fill={AMBER} fontSize="12" fontFamily="sans-serif">وقف الخسارة</text>
      <g className="emphasis" style={{ "--delay": `${DRAW_S}s` } as React.CSSProperties}>
        <circle cx="220" cy="165" r="6" fill={AMBER} />
        <path d="M 213 158 L 227 172 M 227 158 L 213 172" stroke="#0a0d12" strokeWidth="2" strokeLinecap="round" />
      </g>
      <Legend items={[
        { color: BLUE, label: "السعر" },
        { color: TEAL, label: "نقطة الدخول" },
        { color: AMBER, label: "وقف الخسارة" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 10. Position Sizing ─────────────────────────
function PositionSizingDiagram() {
  const inputs = [
    { x: 70, label: "حجم الحساب" },
    { x: 190, label: "نسبة المخاطرة" },
    { x: 310, label: "مسافة الوقف" },
  ];
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {inputs.map((inp, i) => (
        <g key={inp.x}>
          <rect x={inp.x - 55} y="20" width="110" height="46" rx="8" fill="none" stroke={BLUE} strokeWidth="2" />
          <text x={inp.x} y="48" fill={BLUE} fontSize="11" fontFamily="sans-serif" textAnchor="middle">{inp.label}</text>
          <line className="draw-path" pathLength="1" x1={inp.x} y1="66" x2="190" y2="130" stroke={MUTED} strokeWidth="1.5" />
          <circle className="pulse-dot" style={{ "--delay": `${0.5 + i * 0.2}s` } as React.CSSProperties} cx={inp.x} cy="66" r="3.5" fill={BLUE} />
        </g>
      ))}
      <g className="emphasis" style={{ "--delay": `${DRAW_S}s` } as React.CSSProperties}>
        <rect x="120" y="135" width="140" height="48" rx="8" fill="none" stroke={TEAL} strokeWidth="2.5" />
        <text x="190" y="164" fill={TEAL} fontSize="13" fontFamily="sans-serif" fontWeight="600" textAnchor="middle">حجم الصفقة</text>
      </g>
      <Legend items={[
        { color: BLUE, label: "المدخلات الثلاثة" },
        { color: TEAL, label: "الناتج المحسوب" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 11. Trade Plan Checklist ─────────────────────────
function TradePlanChecklistDiagram() {
  const items = ["نقطة الدخول", "الهدف", "وقف الخسارة", "نسبة R:R"];
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <rect x="60" y="15" width="260" height="215" rx="12" fill="none" stroke="#212a36" strokeWidth="1.5" />
      {items.map((label, i) => {
        const y = 55 + i * 45;
        return (
          <g key={label} className="emphasis" style={{ "--delay": `${0.2 + i * 0.25}s` } as React.CSSProperties}>
            <circle cx="95" cy={y} r="11" fill="none" stroke={TEAL} strokeWidth="2" />
            <path d={`M 90 ${y} L 94 ${y + 4} L 101 ${y - 5}`} fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x="120" y={y + 5} fill={BLUE} fontSize="14" fontFamily="sans-serif">{label}</text>
          </g>
        );
      })}
      <Legend items={[{ color: TEAL, label: "عنصر مكتمل في الخطة" }]} />
    </svg>
  );
}

// ───────────────────────── 12. FOMO ─────────────────────────
function FomoDiagram() {
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <path
        className="draw-path" pathLength="1"
        d="M 16 195 C 60 188, 110 165, 150 130 C 185 100, 210 55, 240 25"
        fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle className="pulse-dot" style={{ "--delay": "1.1s" } as React.CSSProperties} cx="240" cy="25" r="6" fill={AMBER} />
      <text x="260" y="20" fill={AMBER} fontSize="11" fontFamily="sans-serif">دخول متأخر</text>
      <path
        className="draw-path" pathLength="1"
        d="M 240 25 C 265 38, 290 90, 315 130 C 335 160, 350 175, 364 190"
        fill="none" stroke={AMBER} strokeWidth="2.5" strokeLinecap="round"
      />
      <text x="300" y="210" fill={MUTED} fontSize="11" fontFamily="sans-serif">تصحيح طبيعي</text>
      <Legend items={[
        { color: TEAL, label: "الحركة الأساسية" },
        { color: AMBER, label: "دخول متأخر وتصحيح" },
      ]} />
    </svg>
  );
}

// ───────────────────────── 13. Trading Journal Habit ─────────────────────────
function TradingJournalHabitDiagram() {
  const steps = [
    { x: 190, y: 30, label: "خطة" },
    { x: 320, y: 100, label: "تنفيذ" },
    { x: 270, y: 200, label: "تسجيل" },
    { x: 110, y: 200, label: "مراجعة" },
    { x: 60, y: 100, label: "تحسين" },
  ];
  return (
    <svg viewBox="0 0 380 320" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
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
          <g key={s.label} className="pulse-dot" style={{ "--delay": `${0.4 + i * 0.22}s` } as React.CSSProperties}>
            <circle cx={s.x} cy={s.y} r="24" fill="none" stroke={color} strokeWidth="2" />
            <text x={s.x} y={s.y + 4} fill={color} fontSize="11" fontFamily="sans-serif" textAnchor="middle">{s.label}</text>
          </g>
        );
      })}
      <Legend items={[
        { color: BLUE, label: "خطوات الدورة المتكررة" },
        { color: TEAL, label: "التحسين المستمر" },
      ]} />
    </svg>
  );
}

// ───────────────────────── Placeholder (unbuilt diagrams fallback) ─────────────────────────
function PlaceholderDiagram() {
  return (
    <div className="w-full aspect-[380/320] rounded-xl border border-dashed border-line flex items-center justify-center text-text-muted text-sm">
      الرسم التوضيحي قيد الإعداد
    </div>
  );
}

const DIAGRAMS: Record<string, () => React.JSX.Element> = {
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
  const { ref, inView } = useInView<HTMLDivElement>();
  const Diagram = DIAGRAMS[diagramId];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <DiagramStyles />
      <div ref={ref} className={`lesson-diagram${inView ? " in-view" : ""}`}>
        {Diagram ? <Diagram /> : <PlaceholderDiagram />}
      </div>
    </div>
  );
}
