// Shared types and constants for the drawing registry (lib/drawingKinds/).
// Everything here is dependency-free so kind modules, the engine, the painter
// and lib/chartDrawings.ts can all import it without cycles.

export type Tool = "cursor" | "trend" | "hline" | "vline" | "rect" | "zone" | "brush" | "text" | "measure";
export type Pt = { time: number; price: number };
export type DrawingDraft =
  | { kind: "hline"; price: number }
  | { kind: "vline"; time: number }
  | { kind: "trend"; a: Pt; b: Pt }
  | { kind: "rect"; a: Pt; b: Pt }
  /** Support/resistance zone: a price band that spans the full chart width. */
  | { kind: "zone"; top: number; bottom: number }
  | { kind: "brush"; pts: Pt[] }
  | { kind: "text"; at: Pt; text: string };
export type Drawing = DrawingDraft & { id: string };
export type Geo =
  | { id: string; kind: "hline"; y: number }
  | { id: string; kind: "vline"; x: number }
  | { id: string; kind: "trend" | "rect"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "zone"; y1: number; y2: number }
  | { id: string; kind: "brush"; pts: [number, number][] }
  | { id: string; kind: "text"; x: number; y: number; w: number; h: number; text: string };
export type Handle = { name: string; x: number; y: number };

// Safeguards (replace the old arbitrary 50-drawing cap).
/** Generous ceiling on drawings in one session; keeps repaint cost bounded. */
export const MAX_DRAWINGS = 500;
/** Points kept for one brush stroke (longer strokes are evenly thinned). */
export const MAX_BRUSH_POINTS = 600;
/** Total brush points across all drawings. */
export const MAX_TOTAL_BRUSH_POINTS = 20_000;
export const MAX_TEXT_LENGTH = 80;
export const HIT_TOLERANCE_PX = 10;
export const HANDLE_TOLERANCE_PX = 12;
export const HANDLE_TOLERANCE_TOUCH_PX = 20;
export const CLICK_SLOP_PX = 6;
export const MAGNET_TOLERANCE_PX = 24;
/** Left offset (px) where grab handles for full-width lines are drawn. */
export const LINE_HANDLE_X = 24;

// ------------------------------------------------------------- registry types

export type DrawingKind = DrawingDraft["kind"];
export type DraftOf<K extends DrawingKind> = Extract<DrawingDraft, { kind: K }>;
export type DrawingOf<K extends DrawingKind> = DraftOf<K> & { id: string };
type GeoFor<G, K extends string> = G extends { kind: infer GK } ? (K extends GK ? G : never) : never;
export type GeoOf<K extends DrawingKind> = GeoFor<Geo, K>;

/**
 * How a tool turns pointer input into a drawing.
 *  none       cursor: select / move / edit existing drawings
 *  point      one press places the drawing (horizontal / vertical line)
 *  text       one press asks for a label first
 *  freehand   press-drag collects points (brush)
 *  two-point  press-drag-release or tap, tap (trendline, rectangle, zone)
 *  measure    two-point, but the result is a temporary readout, never a drawing
 */
export type ToolGesture = "none" | "point" | "text" | "freehand" | "two-point" | "measure";

export type PaintColors = { accent: string; text: string; surface: string; bull: string; bear: string };
/** What a kind painter needs besides its geometry. The painter has already set stroke/fill/width/dash. */
export type PaintEnv = { colors: PaintColors; width: number; height: number };
export type PaintOpts = { selected: boolean; dashed: boolean };

/**
 * Everything the app needs to know about one drawing kind. Methods use method
 * syntax on purpose: it keeps the per-kind definitions assignable to the
 * generic `KindDef` used for registry-wide dispatch.
 */
export interface KindDef<K extends DrawingKind = DrawingKind> {
  readonly kind: K;
  readonly gesture: ToolGesture;
  /** Structural validation: finite coordinates, positive prices, bounded sizes. */
  validate(d: DraftOf<K>): boolean;
  /** Pixel geometry from time→x / price→y mappers (null = off-screen or unknown). */
  project(d: DraftOf<K> & { id?: string }, xOf: (time: number) => number | null, yOf: (price: number) => number | null): GeoOf<K> | null;
  /** Pixel distance from (x, y) to the drawing's selectable part (Infinity = not hit). */
  hit(g: GeoOf<K>, x: number, y: number, tol: number): number;
  /** Fill area that selects the drawing only when nothing else is close. */
  inside?(g: GeoOf<K>, x: number, y: number): boolean;
  /** Grab handles used for editing (hit-tested and painted). */
  handles(g: GeoOf<K>): Handle[];
  /** Extra painted-only markers for a selected drawing (it moves as a whole). */
  markers?(g: GeoOf<K>): Handle[];
  /** Shift by whole candles and a price amount (unvalidated; the registry validates). */
  move(d: DrawingOf<K>, dLogical: number, dPrice: number, times: number[]): DrawingOf<K>;
  /** Move one grab handle; null for an unknown handle (unvalidated). */
  edit?(d: DrawingOf<K>, handle: string, p: Pt): DrawingOf<K> | null;
  /** A shape collapsed to nothing: dropped on creation, reverted on edit. */
  isDegenerate?(d: DraftOf<K>): boolean;
  /** Two-point tools: build the (possibly degenerate) draft from the two anchors. */
  fromAnchors?(a: Pt, b: Pt): DraftOf<K>;
  /** Point tools: build the drawing from the pressed point. */
  fromPoint?(p: Pt): DraftOf<K>;
  /** The fixed start point shown while the second point of a two-point drawing is pending. */
  draftAnchor?(d: DraftOf<K>): Pt | null;
  /** Per-kind session limit beyond MAX_DRAWINGS (true = refuse). */
  exceedsLimit?(list: Drawing[], d: DrawingOf<K>): boolean;
  /** Paint the body. Stroke/fill style, width and dash are already set for this drawing. */
  paint(ctx: CanvasRenderingContext2D, g: GeoOf<K>, opts: PaintOpts, env: PaintEnv): void;
}
