// Series primitive that paints the user's drawings inside the chart's own
// render loop (price pane only). Because it asks the chart for coordinates on
// every repaint, drawings follow zoom, pan, resize and rescaling by themselves.

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
import { timeToLogical, type Drawing, type Geo, type Pt } from "@/lib/chartDrawings";

type Preview = { a: Pt; b: Pt | null } | null;

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<"Candlestick", Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private preview: Preview = null;
  private times: number[] = [];
  private color = "#d4af37";

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

  setState(s: { drawings?: Drawing[]; selectedId?: string | null; preview?: Preview; times?: number[]; color?: string }) {
    if (s.drawings !== undefined) this.drawings = s.drawings;
    if (s.selectedId !== undefined) this.selectedId = s.selectedId;
    if (s.preview !== undefined) this.preview = s.preview;
    if (s.times !== undefined) this.times = s.times;
    if (s.color !== undefined) this.color = s.color;
    this.requestUpdate?.();
  }

  private x(time: number): number | null {
    if (!this.chart || this.times.length === 0) return null;
    return this.chart.timeScale().logicalToCoordinate(timeToLogical(this.times, time) as Logical);
  }

  private y(price: number): number | null {
    return this.series ? this.series.priceToCoordinate(price) : null;
  }

  /** Current pixel geometry of one drawing (used for painting and for hit-testing). */
  project(d: Drawing): Geo | null {
    if (d.kind === "hline") {
      const y = this.y(d.price);
      return y === null ? null : { id: d.id, kind: "hline", y };
    }
    const x1 = this.x(d.a.time), y1 = this.y(d.a.price), x2 = this.x(d.b.time), y2 = this.y(d.b.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { id: d.id, kind: "trend", x1, y1, x2, y2 };
  }

  projectAll(): Geo[] {
    const out: Geo[] = [];
    for (const d of this.drawings) {
      const g = this.project(d);
      if (g) out.push(g);
    }
    return out;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          ctx.lineCap = "round";
          for (const g of this.projectAll()) {
            const selected = g.id === this.selectedId;
            ctx.strokeStyle = this.color;
            ctx.fillStyle = this.color;
            ctx.lineWidth = selected ? 3 : 1.5;
            ctx.beginPath();
            if (g.kind === "hline") {
              ctx.moveTo(0, g.y);
              ctx.lineTo(mediaSize.width, g.y);
            } else {
              ctx.moveTo(g.x1, g.y1);
              ctx.lineTo(g.x2, g.y2);
            }
            ctx.stroke();
            if (selected) {
              const pts = g.kind === "hline" ? [[24, g.y]] : [[g.x1, g.y1], [g.x2, g.y2]];
              for (const [px, py] of pts) {
                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          const p = this.preview;
          if (p) {
            const x1 = this.x(p.a.time), y1 = this.y(p.a.price);
            if (x1 !== null && y1 !== null) {
              ctx.strokeStyle = this.color;
              ctx.fillStyle = this.color;
              ctx.beginPath();
              ctx.arc(x1, y1, 4, 0, Math.PI * 2);
              ctx.fill();
              const x2 = p.b ? this.x(p.b.time) : null, y2 = p.b ? this.y(p.b.price) : null;
              if (x2 !== null && y2 !== null) {
                ctx.lineWidth = 1.5;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }
          }
        });
      },
    };
    return [{ zOrder: () => "top", renderer: () => renderer }];
  }
}
