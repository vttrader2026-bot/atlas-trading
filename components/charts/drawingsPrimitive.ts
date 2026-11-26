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
import { projectDrawing, timeToLogical, type Drawing, type DrawingDraft, type Geo, type Pt } from "@/lib/chartDrawings";
import { defOf, logicalToX, paintMeasure, type PaintColors, type PaintEnv, type PaintOpts } from "@/lib/drawingKinds";

export type MeasureState = { a: Pt; b: Pt; lines: string[] } | null;
export type PrimitiveColors = PaintColors;

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
    const scale = this.chart.timeScale();
    // fractional candle positions (any time between two candles) need interpolation: see logicalToX
    return logicalToX(timeToLogical(this.times, time), (i) => scale.logicalToCoordinate(i as Logical));
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

          const env: PaintEnv = { colors: c, width: mediaSize.width, height: mediaSize.height };
          const paint = (g: Geo, opts: PaintOpts) => {
            ctx.strokeStyle = c.accent;
            ctx.fillStyle = c.accent;
            ctx.lineWidth = opts.selected ? 2.5 : 1.5;
            ctx.setLineDash(opts.dashed ? [5, 4] : []);
            defOf(g.kind).paint(ctx, g, opts, env); // per-kind body (lib/drawingKinds/*)
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
                const def = defOf(g.kind);
                for (const h of def.handles(g)) handle(h.x, h.y);
                for (const h of def.markers?.(g) ?? []) handle(h.x, h.y);
              }
            }

            if (this.draft) {
              const g = this.project({ ...this.draft, id: "draft" });
              if (g) paint(g, { selected: false, dashed: true });
              const anchor = defOf(this.draft.kind).draftAnchor?.(this.draft);
              if (anchor) {
                const x = this.xOf(anchor.time);
                const y = this.yOf(anchor.price);
                if (x !== null && y !== null) handle(x, y);
              }
            }

            if (this.measureState) paintMeasure(ctx, this.measureState, (t) => this.xOf(t), (p) => this.yOf(p), env);
          }
        });
      },
    };
    return [{ zOrder: () => "top", renderer: () => renderer }];
  }
}
