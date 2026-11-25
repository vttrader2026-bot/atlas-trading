// Small stroke icons for the chart workspace (original artwork; no third-party assets).
import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icons = {
  cursor: <Svg><path d="M5 3l10 6.5-4.6 1.2L8.6 15.5 5 3z" /></Svg>,
  trend: <Svg><path d="M3.5 15.5l13-11" /><circle cx="3.5" cy="15.5" r="1.6" /><circle cx="16.5" cy="4.5" r="1.6" /></Svg>,
  hline: <Svg><path d="M2.5 10h15" /><circle cx="10" cy="10" r="1.6" /></Svg>,
  vline: <Svg><path d="M10 2.5v15" /><circle cx="10" cy="10" r="1.6" /></Svg>,
  rect: <Svg><rect x="3.5" y="5" width="13" height="10" rx="1" /></Svg>,
  zone: <Svg><path d="M2.5 6.5h15M2.5 13.5h15" /><path d="M2.5 6.5h15v7h-15z" fill="currentColor" fillOpacity=".18" stroke="none" /></Svg>,
  brush: <Svg><path d="M3.5 16.5c3 .2 4.5-1 4.5-2.8 0-1.2-1-1.7-1.9-1.2-1.5.9-1.2 3.5-2.6 4z" /><path d="M8.5 11.5l7-7a1.7 1.7 0 012.4 2.4l-7 7" /></Svg>,
  text: <Svg><path d="M4.5 5.5v-1h11v1M10 4.5v11M8 15.5h4" /></Svg>,
  measure: <Svg><path d="M2.5 13.5l11-11 4 4-11 11-4-4z" /><path d="M6 10l1.6 1.6M8.2 7.8l1 1M10.4 5.6l1.6 1.6" /></Svg>,
  zoomIn: <Svg><circle cx="8.5" cy="8.5" r="5" /><path d="M12.3 12.3l4.2 4.2M8.5 6.3v4.4M6.3 8.5h4.4" /></Svg>,
  zoomOut: <Svg><circle cx="8.5" cy="8.5" r="5" /><path d="M12.3 12.3l4.2 4.2M6.3 8.5h4.4" /></Svg>,
  fit: <Svg><path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" /></Svg>,
  magnet: <Svg><path d="M5 3v7a5 5 0 0010 0V3" /><path d="M5 6.5h3M12 6.5h3" /></Svg>,
  lock: <Svg><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 016 0V9" /></Svg>,
  unlock: <Svg><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 015.6-1.5" /></Svg>,
  eye: <Svg><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.4" /></Svg>,
  eyeOff: <Svg><path d="M3.5 3.5l13 13" /><path d="M8.2 5a8 8 0 011.8-.5c5 0 8 5.5 8 5.5a14 14 0 01-2.7 3.3M5.7 6.3A14 14 0 002 10s3 5.5 8 5.5c1 0 1.9-.2 2.8-.6" /></Svg>,
  trash: <Svg><path d="M4 5.5h12M8 5.5V4h4v1.5M5.5 5.5l.7 10.5h7.6l.7-10.5M8.5 8.5v5M11.5 8.5v5" /></Svg>,
  undo: <Svg><path d="M7 4.5L3.5 8 7 11.5" /><path d="M3.5 8H12a4.5 4.5 0 010 9H8" /></Svg>,
  redo: <Svg><path d="M13 4.5L16.5 8 13 11.5" /><path d="M16.5 8H8a4.5 4.5 0 000 9h4" /></Svg>,
  indicators: <Svg><path d="M3 14l3.5-4 3 2.5L14 6l3 3" /><path d="M3 17h14" /></Svg>,
  settings: <Svg><circle cx="10" cy="10" r="2.6" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></Svg>,
  chevron: <Svg><path d="M5.5 8l4.5 4.5L14.5 8" /></Svg>,
  edit: <Svg><path d="M3.5 16.5l.8-3.6L13.5 3.7a1.7 1.7 0 012.4 2.4L6.7 15.3l-3.2 1.2z" /></Svg>,
};
export type IconName = keyof typeof Icons;
