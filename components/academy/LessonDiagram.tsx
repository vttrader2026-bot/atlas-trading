// Shared flat palette across every diagram — no gradients, no shadows.
const BLUE = "#378ADD"; // price / primary
const GOLD = "#F0A830"; // resistance / entry / primary accent
const TEAL = "#2DD4BF"; // support / secondary accent
const GREEN = "#4ADE80"; // bullish / good outcome
const RED = "#EF5350"; // bearish / loss / danger
const MUTED = "#8A94A6"; // neutral / BTC baseline / inactive

function SupportResistanceDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="50" x2="580" y2="50" stroke={GOLD} strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="20" y="40" fill={GOLD} fontSize="12" fontFamily="sans-serif">مقاومة</text>
      <line x1="20" y1="170" x2="420" y2="170" stroke={TEAL} strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="20" y="188" fill={TEAL} fontSize="12" fontFamily="sans-serif">دعم</text>
      <path
        d="M 20 110 C 60 60, 90 50, 110 50 C 140 50, 150 150, 170 170 C 190 190, 210 170, 230 170
           C 260 170, 270 60, 300 50 C 330 40, 350 150, 370 170 C 390 190, 410 170, 420 170
           C 450 170, 480 90, 520 55 C 545 32, 565 20, 580 15"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx="110" cy="50" r="5" fill={GOLD} />
      <circle cx="170" cy="170" r="5" fill={TEAL} />
      <circle cx="300" cy="50" r="5" fill={GOLD} />
      <circle cx="420" cy="170" r="5" fill={TEAL} />
      <path d="M 520 55 L 540 20 L 533 32 M 540 20 L 528 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="470" y="100" fill={GREEN} fontSize="13" fontFamily="sans-serif" fontWeight="600">اختراق صعودي</text>
    </svg>
  );
}

function WhatIsCryptoDiagram() {
  const blocks = [80, 190, 300, 410, 520];
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {blocks.slice(0, -1).map((x, i) => (
        <line key={i} x1={x + 30} y1="110" x2={blocks[i + 1] - 30} y2="110" stroke={MUTED} strokeWidth="2" />
      ))}
      {blocks.map((x, i) => (
        <g key={x}>
          <rect
            x={x - 30} y="80" width="60" height="60" rx="8"
            fill="none" stroke={i === 2 ? GOLD : BLUE} strokeWidth="2.5"
          />
          <text x={x} y="115" fill={i === 2 ? GOLD : BLUE} fontSize="11" fontFamily="monospace" textAnchor="middle">#{i + 1}</text>
        </g>
      ))}
      <text x="300" y="170" fill={MUTED} fontSize="13" fontFamily="sans-serif" textAnchor="middle">
        سجل موزّع يملك نسخته آلاف الأجهزة
      </text>
    </svg>
  );
}

function InvestingVsTradingDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <line x1="300" y1="20" x2="300" y2="200" stroke={MUTED} strokeWidth="1" strokeDasharray="4 4" />
      <text x="150" y="30" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">استثمار طويل المدى</text>
      <path d="M 40 160 C 100 150, 150 120, 200 90 C 230 70, 250 55, 270 45" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="40" cy="160" r="4" fill={TEAL} />
      <circle cx="270" cy="45" r="4" fill={TEAL} />

      <text x="450" y="30" fill={BLUE} fontSize="12" fontFamily="sans-serif" textAnchor="middle">تداول نشط</text>
      <path
        d="M 330 120 L 360 90 L 385 140 L 410 80 L 435 130 L 460 70 L 485 125 L 510 95 L 560 110"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
      {[360, 410, 460, 510].map((x, i) => (
        <circle key={x} cx={x} cy={[90, 80, 70, 95][i]} r="3.5" fill={GOLD} />
      ))}
    </svg>
  );
}

function ReadingCandlesticksDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Bullish candle */}
      <line x1="180" y1="30" x2="180" y2="190" stroke={GREEN} strokeWidth="2" />
      <rect x="150" y="90" width="60" height="70" fill={GREEN} opacity="0.85" />
      <text x="90" y="95" fill={MUTED} fontSize="11" fontFamily="sans-serif">إغلاق</text>
      <text x="90" y="165" fill={MUTED} fontSize="11" fontFamily="sans-serif">افتتاح</text>
      <text x="90" y="35" fill={MUTED} fontSize="11" fontFamily="sans-serif">أعلى</text>
      <text x="90" y="195" fill={MUTED} fontSize="11" fontFamily="sans-serif">أدنى</text>

      {/* Bearish candle */}
      <line x1="420" y1="40" x2="420" y2="185" stroke={RED} strokeWidth="2" />
      <rect x="390" y="70" width="60" height="65" fill={RED} opacity="0.85" />
      <text x="470" y="75" fill={MUTED} fontSize="11" fontFamily="sans-serif">افتتاح</text>
      <text x="470" y="140" fill={MUTED} fontSize="11" fontFamily="sans-serif">إغلاق</text>

      <text x="300" y="210" fill={MUTED} fontSize="12" fontFamily="sans-serif" textAnchor="middle">صاعدة ← | → هابطة</text>
    </svg>
  );
}

function TrendDirectionDiagram() {
  const mkZigzag = (pts: number[][]) => "M " + pts.map((p) => p.join(" ")).join(" L ");
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <text x="90" y="25" fill={GREEN} fontSize="12" fontFamily="sans-serif" textAnchor="middle">صاعد</text>
      <path d={mkZigzag([[20,170],[55,110],[40,130],[90,70],[75,90],[160,30]])} fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <text x="300" y="25" fill={RED} fontSize="12" fontFamily="sans-serif" textAnchor="middle">هابط</text>
      <path d={mkZigzag([[220,40],[255,90],[240,75],[290,140],[275,120],[360,180]])} fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      <text x="500" y="25" fill={GOLD} fontSize="12" fontFamily="sans-serif" textAnchor="middle">عرضي</text>
      <line x1="420" y1="70" x2="580" y2="70" stroke={GOLD} strokeWidth="1" strokeDasharray="4 4" />
      <line x1="420" y1="150" x2="580" y2="150" stroke={GOLD} strokeWidth="1" strokeDasharray="4 4" />
      <path d="M 420 110 L 450 80 L 480 140 L 510 85 L 540 135 L 580 105" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BreakoutRetestDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="90" x2="580" y2="90" stroke={GOLD} strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="20" y="80" fill={GOLD} fontSize="12" fontFamily="sans-serif">مقاومة</text>
      <path
        d="M 20 160 C 80 150, 130 100, 180 90 C 230 80, 260 40, 310 35
           C 340 32, 360 70, 390 90 C 410 103, 420 95, 440 80
           C 480 50, 530 25, 580 15"
        fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx="310" cy="35" r="5" fill={GREEN} />
      <text x="310" y="22" fill={GREEN} fontSize="11" fontFamily="sans-serif" textAnchor="middle">اختراق</text>
      <circle cx="390" cy="90" r="5" fill={TEAL} />
      <text x="390" y="112" fill={TEAL} fontSize="11" fontFamily="sans-serif" textAnchor="middle">إعادة اختبار</text>
      <path d="M 500 45 L 520 15 L 513 27 M 520 15 L 508 19" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RelativeStrengthBtcDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <path d="M 20 150 L 150 140 L 280 130 L 410 120 L 580 110" fill="none" stroke={MUTED} strokeWidth="2" strokeDasharray="5 5" />
      <text x="585" y="105" fill={MUTED} fontSize="12" fontFamily="sans-serif">BTC</text>

      <path d="M 20 150 L 150 120 L 280 90 L 410 55 L 580 25" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="585" y="22" fill={BLUE} fontSize="12" fontFamily="sans-serif" fontWeight="600">عملة</text>

      <circle cx="20" cy="150" r="4" fill={GOLD} />
      <text x="20" y="175" fill={GOLD} fontSize="11" fontFamily="sans-serif" textAnchor="middle">نقطة البداية</text>

      <line x1="410" y1="55" x2="410" y2="120" stroke={GREEN} strokeWidth="1.5" strokeDasharray="3 3" />
      <text x="430" y="90" fill={GREEN} fontSize="11" fontFamily="sans-serif">تفوّق نسبي</text>
    </svg>
  );
}

function RiskPercentageDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <text x="150" y="25" fill={RED} fontSize="12" fontFamily="sans-serif" textAnchor="middle">مخاطرة 20%</text>
      <path d="M 60 50 L 240 50 L 240 185 L 60 185 Z" fill="none" stroke={MUTED} strokeWidth="1" />
      <path d="M 60 50 L 240 50 L 240 95 C 180 105, 120 140, 90 185 L 60 185 Z" fill={RED} opacity="0.75" />
      <text x="150" y="205" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">صفقتان خاسرتان = تصفية تقريباً</text>

      <text x="450" y="25" fill={TEAL} fontSize="12" fontFamily="sans-serif" textAnchor="middle">مخاطرة 1%</text>
      <path d="M 360 50 L 540 50 L 540 185 L 360 185 Z" fill="none" stroke={MUTED} strokeWidth="1" />
      <path d="M 360 50 L 540 50 L 540 70 L 360 75 Z" fill={TEAL} opacity="0.75" />
      <text x="450" y="205" fill={MUTED} fontSize="11" fontFamily="sans-serif" textAnchor="middle">نفس الصفقتين = أثر بسيط</text>
    </svg>
  );
}

function StopLossDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <path d="M 20 110 C 80 90, 120 70, 170 60" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="170" cy="60" r="5" fill={GOLD} />
      <text x="170" y="42" fill={GOLD} fontSize="11" fontFamily="sans-serif" textAnchor="middle">دخول</text>

      <path d="M 170 60 C 220 80, 260 130, 300 160" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="20" y1="160" x2="580" y2="160" stroke={RED} strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="20" y="178" fill={RED} fontSize="12" fontFamily="sans-serif">وقف الخسارة</text>
      <circle cx="300" cy="160" r="6" fill={RED} />
      <path d="M 293 153 L 307 167 M 307 153 L 293 167" stroke="#0a0d12" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PositionSizingDiagram() {
  const inputs = [
    { x: 90, label: "حجم الحساب" },
    { x: 300, label: "نسبة المخاطرة" },
    { x: 510, label: "مسافة الوقف" },
  ];
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {inputs.map((inp) => (
        <g key={inp.x}>
          <rect x={inp.x - 65} y="20" width="130" height="50" rx="8" fill="none" stroke={BLUE} strokeWidth="2" />
          <text x={inp.x} y="50" fill={BLUE} fontSize="12" fontFamily="sans-serif" textAnchor="middle">{inp.label}</text>
          <line x1={inp.x} y1="70" x2="300" y2="140" stroke={MUTED} strokeWidth="1.5" />
        </g>
      ))}
      <rect x="220" y="150" width="160" height="50" rx="8" fill="none" stroke={GOLD} strokeWidth="2.5" />
      <text x="300" y="180" fill={GOLD} fontSize="13" fontFamily="sans-serif" fontWeight="600" textAnchor="middle">حجم الصفقة</text>
    </svg>
  );
}

function TradePlanChecklistDiagram() {
  const items = ["نقطة الدخول", "الهدف", "وقف الخسارة", "نسبة R:R"];
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <rect x="140" y="10" width="320" height="200" rx="12" fill="none" stroke={MUTED} strokeWidth="1.5" />
      {items.map((label, i) => {
        const y = 45 + i * 42;
        return (
          <g key={label}>
            <circle cx="175" cy={y} r="11" fill="none" stroke={GREEN} strokeWidth="2" />
            <path d={`M 170 ${y} L 174 ${y + 4} L 181 ${y - 5}`} fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x="200" y={y + 5} fill={BLUE} fontSize="14" fontFamily="sans-serif">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FomoDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M 20 180 C 80 175, 140 160, 190 130 C 230 105, 260 60, 300 30 C 330 10, 350 15, 370 25"
        fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx="370" cy="25" r="6" fill={RED} />
      <text x="400" y="20" fill={RED} fontSize="12" fontFamily="sans-serif">دخول متأخر (FOMO)</text>
      <path
        d="M 370 25 C 400 35, 430 90, 470 130 C 500 160, 530 175, 580 185"
        fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 0"
      />
      <text x="470" y="200" fill={MUTED} fontSize="11" fontFamily="sans-serif">تصحيح طبيعي</text>
    </svg>
  );
}

function TradingJournalHabitDiagram() {
  const steps = [
    { x: 300, y: 35, label: "خطة" },
    { x: 500, y: 110, label: "تنفيذ" },
    { x: 400, y: 195, label: "تسجيل" },
    { x: 200, y: 195, label: "مراجعة" },
    { x: 100, y: 110, label: "تحسين" },
  ];
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <circle cx="300" cy="115" r="95" fill="none" stroke={MUTED} strokeWidth="1" strokeDasharray="3 5" />
      {steps.map((s, i) => {
        const next = steps[(i + 1) % steps.length];
        return (
          <line
            key={`line-${i}`}
            x1={s.x} y1={s.y} x2={next.x} y2={next.y}
            stroke={BLUE} strokeWidth="1.5"
          />
        );
      })}
      {steps.map((s, i) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r="26" fill={i === 0 ? GOLD : "none"} stroke={GOLD} strokeWidth="2" opacity={i === 0 ? 0.25 : 1} />
          <circle cx={s.x} cy={s.y} r="26" fill="none" stroke={GOLD} strokeWidth="2" />
          <text x={s.x} y={s.y + 5} fill={GOLD} fontSize="12" fontFamily="sans-serif" textAnchor="middle">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

function PlaceholderDiagram() {
  return (
    <div className="w-full aspect-[600/220] rounded-xl border border-dashed border-line flex items-center justify-center text-text-muted text-sm">
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
  const Diagram = DIAGRAMS[diagramId];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      {Diagram ? <Diagram /> : <PlaceholderDiagram />}
    </div>
  );
}
