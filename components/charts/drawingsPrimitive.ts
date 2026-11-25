// Series primitive that paints the user's drawings inside the chart's own
// render loop (price pane only). Because it asks the chart for coordinates on
// every repaint, drawings follow zoom, pan, resize and rescaling by themselves.
//
// It only paints: all interaction lives in lib/chartDrawingEngine.ts, driven by
// components/charts/drawing/DrawingController.ts.

import type {
  ISeriesApi,
  ISeriesPrimitive,
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import { LINE_HANDLE_X, handlesOf, projectDrawing, timeToLogical, type Drawing, type DrawingDraft, type Geo, type Pt } from "@/lib/chartDrawings";

export type MeasureState = { a: Pt; b: Pt; lines: string[] } | null;
export type PrimitiveColors = { accent: string; text: string; surface: string; bull: string; bear: string };

const DEFAULT_COLORS: PrimitiveColors = { accent: "#d4af37", text: "#e6e8eb", surface: "#11151c", bull: "#35c48a", bear: "#ef5350" };

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<"Candlestick", Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private draft: DrawingDraft | null = null;
  private measureState: MeasureState = null;
  private times: number[] = [];
  private colors: PrimitiveColors = DEFAULT_COLORS;
  private hidden = false;

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<"Candlestick", Time>;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  setState(s: {
    drawings?: Drawing[];
    selectedId?: string | null;
    draft?: DrawingDraft | null;
    measure?: MeasureState;
    times?: number[];
    colors?: PrimitiveColors;
    hidden?: boolean;
  }) {
    if (s.drawings !== undefined) this.drawings = s.drawings;
    if (s.selectedId !== undefined) this.selectedId = s.selectedId;
    if (s.draft !== undefined) this.draft = s.draft;
    if (s.measure !== undefined) this.measureState = s.measure;
    if (s.times !== undefined) this.times = s.times;
    if (s.colors !== undefined) this.colors = s.colors;
    if (s.hidden !== undefined) this.hidden = s.hidden;
    this.requestUpdate?.();
  }

  // ---- coordinate conversion (shared with the interaction controller)

  /** x pixel of a time, or null when the chart has no data / is detached. */
  xOf(time: number): number | null {
    if (!this.chart || this.times.length === 0) return null;
    return this.chart.timeScale().logicalToCoordinate(timeToLogical(this.times, time) as Logical);
  }

  yOf(price: number): number | null {
    return this.series ? this.series.priceToCoordinate(price) : null;
  }

  /** Pixel → fractional candle position and price. */
  pointAt(x: number, y: number): { logical: number; price: number } | null {
    if (!this.chart || !this.series) return null;
    const logical = this.chart.timeScale().coordinateToLogical(x);
    const price = this.series.coordinateToPrice(y);
    if (logical === null || price === null) return null;
    return { logical: logical as number, price: price as number };
  }

  /** Pixel geometry of one drawing right now. */
  project(d: DrawingDraft & { id?: string }): Geo | null {
    return projectDrawing(d, (t) => this.xOf(t), (p) => this.yOf(p));
  }

  paneViews(): readonly IPrimitivePaneView[] {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          const c = this.colors;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.font = "13px Inter, system-ui, sans-serif";
          ctx.textBaseline = "middle";

          const paint = (g: Geo, opts: { selected: boolean; dashed: boolean }) => {
            ctx.strokeStyle = c.accent;
            ctx.fillStyle = c.accent;
            ctx.lineWidth = opts.selected ? 2.5 : 1.5;
            ctx.setLineDash(opts.dashed ? [5, 4] : []);
            switch (g.kind) {
              case "hline":
                ctx.beginPath();
                ctx.moveTo(0, g.y);
                ctx.lineTo(mediaSize.width, g.y);
                ctx.stroke();
                break;
              case "vline":
                ctx.beginPath();
                ctx.moveTo(g.x, 0);
                ctx.lineTo(g.x, mediaSize.height);
                ctx.stroke();
                break;
              case "trend":
                ctx.beginPath();
                ctx.moveTo(g.x1, g.y1);
                ctx.lineTo(g.x2, g.y2);
                ctx.stroke();
                break;
              case "rect": {
                ctx.globalAlpha = opts.selected ? 0.22 : 0.14;
                ctx.fillRect(g.x1, g.y1, g.x2 - g.x1, g.y2 - g.y1);
                ctx.globalAlpha = 1;
                ctx.strokeRect(g.x1, g.y1, g.x2 - g.x1, g.y2 - g.y1);
                break;
              }
              case "zone": {
                const top = Math.min(g.y1, g.y2);
                const h = Math.abs(g.y2 - g.y1);
                ctx.globalAlpha = opts.selected ? 0.22 : 0.14;
                ctx.fillRect(0, top, mediaSize.width, h);
                ctx.globalAlpha = 1;
                ctx.lineWidth = opts.selected ? 2 : 1;
                ctx.setLineDash(opts.dashed ? [5, 4] : [6, 4]);
                ctx.beginPath();
                ctx.moveTo(0, g.y1);
                ctx.lineTo(mediaSize.width, g.y1);
                ctx.moveTo(0, g.y2);
                ctx.lineTo(mediaSize.width, g.y2);
                ctx.stroke();
                break;
              }
              case "brush": {
                ctx.beginPath();
                g.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
                ctx.stroke();
                break;
              }
              case "text": {
                // g.y is the label's bottom-left; the box grows upward so a click lands just above the anchor price
                ctx.setLineDash([]);
                ctx.globalAlpha = 0.92;
                ctx.fillStyle = c.surface;
                ctx.fillRect(g.x, g.y - g.h, g.w, g.h);
                ctx.globalAlpha = 1;
                ctx.lineWidth = opts.selected ? 2 : 1;
                ctx.strokeRect(g.x, g.y - g.h, g.w, g.h);
                ctx.fillStyle = c.text;
                ctx.fillText(g.text, g.x + 7, g.y - g.h / 2);
                break;
              }
            }
            ctx.setLineDash([]);
          };

          const handle = (x: number, y: number) => {
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
            ctx.fillStyle = c.surface;
            ctx.strokeStyle = c.accent;
            ctx.beginPath();
            ctx.arc(x, y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          };

          if (!this.hidden) {
            for (const d of this.drawings) {
              const g = this.project(d);
              if (!g) continue;
              const selected = d.id === this.selectedId;
              paint(g, { selected, dashed: false });
              if (selected) {
                const hs = handlesOf(g);
                for (const h of hs) handle(h.x, h.y);
                if (g.kind === "hline") handle(LINE_HANDLE_X, g.y);
                else if (g.kind === "vline") handle(g.x, LINE_HANDLE_X);
                else if (g.kind === "brush") {
                  const first = g.pts[0], last = g.pts[g.pts.length - 1];
                  handle(first[0], first[1]);
                  handle(last[0], last[1]);
                }
              }
            }

            if (this.draft) {
              const g = this.project({ ...this.draft, id: "draft" });
              if (g) paint(g, { selected: false, dashed: true });
              if (this.draft.kind === "trend" || this.draft.kind === "rect") {
                const a = this.project({ kind: "hline", price: this.draft.a.price });
                const x = this.xOf(this.draft.a.time);
                if (a && a.kind === "hline" && x !== null) handle(x, a.y);
              }
            }

            const m = this.measureState;
            if (m) {
              const x1 = this.xOf(m.a.time), y1 = this.yOf(m.a.price), x2 = this.xOf(m.b.time), y2 = this.yOf(m.b.price);
              if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                const up = m.b.price >= m.a.price;
                const col = up ? c.bull : c.bear;
                ctx.setLineDash([]);
                ctx.globalAlpha = 0.14;
                ctx.fillStyle = col;
                ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = col;
                ctx.lineWidth = 1;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                // label box next to the end point, kept inside the pane
                const lines = m.lines;
                const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
                const h = lines.length * 18 + 8;
                const bx = Math.min(Math.max(4, x2 + 8), mediaSize.width - w - 4);
                const by = Math.min(Math.max(4, (up ? y2 - h - 8 : y2 + 8)), mediaSize.height - h - 4);
                ctx.fillStyle = c.surface;
                ctx.globalAlpha = 0.95;
                ctx.fillRect(bx, by, w, h);
                ctx.globalAlpha = 1;
                ctx.strokeRect(bx, by, w, h);
                ctx.fillStyle = c.text;
                lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 13 + i * 18));
              }
            }
          }
        });
      },
    };
    return [{ zOrder: () => "top", renderer: () => renderer }];
  }
}
