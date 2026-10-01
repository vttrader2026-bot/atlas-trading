function SupportResistanceDiagram() {
  return (
    <svg viewBox="0 0 600 220" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Resistance (dashed, gold) */}
      <line x1="20" y1="50" x2="580" y2="50" stroke="#F0A830" strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="20" y="40" fill="#F0A830" fontSize="12" fontFamily="sans-serif">
        مقاومة
      </text>

      {/* Support (dashed, teal) */}
      <line x1="20" y1="170" x2="420" y2="170" stroke="#2DD4BF" strokeWidth="1.5" strokeDasharray="6 6" />
      <text x="20" y="188" fill="#2DD4BF" fontSize="12" fontFamily="sans-serif">
        دعم
      </text>

      {/* Price path: bounces between support/resistance, then breaks out */}
      <path
        d="M 20 110
           C 60 60, 90 50, 110 50
           C 140 50, 150 150, 170 170
           C 190 190, 210 170, 230 170
           C 260 170, 270 60, 300 50
           C 330 40, 350 150, 370 170
           C 390 190, 410 170, 420 170
           C 450 170, 480 90, 520 55
           C 545 32, 565 20, 580 15"
        fill="none"
        stroke="#378ADD"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Bounce markers */}
      <circle cx="110" cy="50" r="5" fill="#F0A830" />
      <circle cx="170" cy="170" r="5" fill="#2DD4BF" />
      <circle cx="300" cy="50" r="5" fill="#F0A830" />
      <circle cx="420" cy="170" r="5" fill="#2DD4BF" />

      {/* Breakout arrow + label */}
      <path d="M 520 55 L 540 20 L 533 32 M 540 20 L 528 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="470" y="100" fill="#4ADE80" fontSize="13" fontFamily="sans-serif" fontWeight="600">
        اختراق صعودي
      </text>
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
};

export default function LessonDiagram({ diagramId }: { diagramId: string }) {
  const Diagram = DIAGRAMS[diagramId];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      {Diagram ? <Diagram /> : <PlaceholderDiagram />}
    </div>
  );
}
