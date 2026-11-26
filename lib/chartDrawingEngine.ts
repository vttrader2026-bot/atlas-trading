// The drawing interaction state machine (no DOM, no chart library): turns
// pointer events into drawing changes. A thin controller
// (components/charts/drawing/DrawingController.ts) feeds it real pointer
// events and chart coordinates; tests feed it a fake linear view.
//
// Gestures: every tool works both as press-drag-release (mouse) and as
// tap, tap (touch): the first tap fixes the start, the second fixes the end.
// Incomplete or cancelled gestures never reach the host's history.

import {
  CLICK_SLOP_PX,
  HANDLE_TOLERANCE_PX,
  HANDLE_TOLERANCE_TOUCH_PX,
  HIT_TOLERANCE_PX,
  drawingsEqual,
  editHandle,
  handlePosition,
  hitHandle,
  hitTest,
  logicalToTime,
  magnetPrice,
  moveDrawing,
  newDrawingId,
  projectDrawing,
  removeDrawing,
  replaceDrawing,
  snapTimeUnclamped,
  tryAddDrawing,
  validateDrawing,
  type Drawing,
  type DrawingDraft,
  type Geo,
  type OhlcPrices,
  type Pt,
  type Tool,
} from "@/lib/chartDrawings";
import { brushDraft, draftFromAnchors, draftFromPoint, gestureOf, isDegenerateDrawing } from "@/lib/drawingKinds";

/** What the engine needs to know about the chart. */
export type EngineView = {
  /** Candle open times (UTC seconds), ascending. */
  times(): number[];
  xOf(time: number): number | null;
  yOf(price: number): number | null;
  /** Pixel → fractional candle position and price, or null if the chart is not ready. */
  pointAt(x: number, y: number): { logical: number; price: number } | null;
  /** OHLC of the candle at an integer index (for magnet snapping). */
  candleAt(index: number): OhlcPrices | null;
};

/** What the engine tells its owner. */
export type EngineHost = {
  /** Working list while a drag is in progress (repaint only; not a history entry). */
  onLive(list: Drawing[]): void;
  /** A finished change that should become one undo step. */
  onCommit(list: Drawing[]): void;
  onSelect(id: string | null): void;
  onTool(tool: Tool): void;
  /** Dashed preview of the drawing being created (null when none). */
  onDraft(draft: DrawingDraft | null): void;
  /** The measurement tool's current span (kept on screen until dismissed; never part of history). */
  onMeasure(m: { a: Pt; b: Pt } | null): void;
  /** The text tool needs a label: show an input at (x, y). `editId` is set when editing an existing label. */
  onRequestText(req: { x: number; y: number; at: Pt; editId?: string; text?: string }): void;
  /** A refused action, e.g. the session drawing limit. */
  onNotice(code: "limit" | "invalid"): void;
};

type Drag =
  | { kind: "move"; id: string; orig: Drawing[]; startLogical: number; startPrice: number; startX: number; startY: number; moved: boolean }
  | { kind: "handle"; id: string; handle: string; orig: Drawing[]; moved: boolean; offX: number; offY: number };

type Anchor = { a: Pt; down: boolean; gesture: 1 | 2; startX: number; startY: number; moved: boolean };

const MIN_BRUSH_SPACING_PX = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class DrawingEngine {
  private tool: Tool = "cursor";
  private magnet = false;
  private locked = false;
  private hidden = false;
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;

  private drag: Drag | null = null;
  private anchor: Anchor | null = null;
  private single: { down: boolean; at: Pt; x: number; y: number } | null = null; // hline / vline / text
  private brush: { pts: Pt[]; px: [number, number][] } | null = null;
  private measuring: { a: Pt; b: Pt } | null = null;

  constructor(private view: EngineView, private host: EngineHost) {}

  // ------------------------------------------------------------ configuration

  getTool(): Tool {
    return this.tool;
  }
  getSelectedId(): string | null {
    return this.selectedId;
  }
  getDrawings(): Drawing[] {
    return this.drawings;
  }
  /** True while a creation gesture or drag is half-finished. */
  isBusy(): boolean {
    return !!(this.drag || this.anchor || this.single || this.brush);
  }

  setTool(tool: Tool) {
    if (tool === this.tool) return;
    this.abortGesture();
    this.dismissMeasure();
    this.tool = tool;
    if (tool !== "cursor") this.select(null);
    this.host.onTool(tool);
  }
  setMagnet(on: boolean) {
    this.magnet = on;
  }
  setLocked(on: boolean) {
    this.locked = on;
    if (on) {
      this.abortGesture();
      this.select(null);
    }
  }
  setHidden(on: boolean) {
    this.hidden = on;
    if (on) {
      this.abortGesture();
      this.select(null);
    }
  }
  /** The owner's committed list changed (undo, redo, clear, symbol change): drop any in-flight gesture and drop a selection that no longer exists. */
  setDrawings(list: Drawing[]) {
    this.drawings = list;
    this.abortGesture();
    if (this.selectedId && !list.some((d) => d.id === this.selectedId)) this.select(null);
  }

  // ------------------------------------------------------------------ helpers

  private select(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.host.onSelect(id);
  }

  private geos(): Geo[] {
    const out: Geo[] = [];
    for (const d of this.drawings) {
      const g = projectDrawing(d, (t) => this.view.xOf(t), (p) => this.view.yOf(p));
      if (g) out.push(g);
    }
    return out;
  }

  /** Pixel → anchored point: time snapped to a whole candle (may lie in the future), price optionally magnet-snapped. */
  private pointFrom(x: number, y: number): Pt | null {
    const v = this.view.pointAt(x, y);
    const times = this.view.times();
    if (!v || times.length === 0) return null;
    const time = snapTimeUnclamped(times, v.logical);
    if (time === null || !Number.isFinite(v.price) || v.price <= 0) return null;
    let price = v.price;
    if (this.magnet) {
      const idx = clamp(Math.round(v.logical), 0, times.length - 1);
      price = magnetPrice(this.view.candleAt(idx), price, (p) => this.view.yOf(p));
    }
    return { time, price };
  }

  private abortGesture() {
    const hadDraft = !!(this.anchor || this.single || this.brush);
    if (this.drag && this.drag.moved) this.host.onLive(this.drag.orig); // put the list back exactly as it was
    this.drag = null;
    this.anchor = null;
    this.single = null;
    this.brush = null;
    if (hadDraft) this.host.onDraft(null);
  }

  private dismissMeasure() {
    if (this.measuring) {
      this.measuring = null;
      this.host.onMeasure(null);
    }
  }

  private finish(d: Drawing) {
    const r = tryAddDrawing(this.drawings, d);
    this.anchor = null;
    this.single = null;
    this.brush = null;
    this.host.onDraft(null);
    if (!r.ok) {
      this.host.onNotice(r.reason);
    } else {
      this.drawings = r.list;
      this.host.onCommit(r.list);
      this.select(d.id);
    }
    this.tool = "cursor";
    this.host.onTool("cursor");
  }

  // -------------------------------------------------------------- pointer input

  /**
   * Returns true when the engine takes the gesture (the chart must not pan/zoom for it).
   * With the cursor tool that is only when the press lands on a drawing or a handle.
   */
  pointerDown(x: number, y: number, pointerType: "mouse" | "touch" | "pen" = "mouse"): boolean {
    if (this.hidden) return false;
    const tool = this.tool;

    if (tool === "cursor") {
      if (this.locked) return false;
      const geos = this.geos();
      const tol = pointerType === "mouse" ? HANDLE_TOLERANCE_PX : HANDLE_TOLERANCE_TOUCH_PX;
      // 1) a handle of the already-selected drawing
      const sel = this.selectedId ? geos.find((g) => g.id === this.selectedId) : undefined;
      if (sel) {
        const handle = hitHandle(sel, x, y, tol);
        if (handle) {
          // Remember where on the handle the pointer grabbed it, so the handle follows the pointer by that
          // offset instead of jumping to be centred under it.
          const at = handlePosition(sel, handle);
          this.drag = { kind: "handle", id: sel.id, handle, orig: this.drawings, moved: false, offX: at ? x - at.x : 0, offY: at ? y - at.y : 0 };
          return true;
        }
      }
      // 2) any drawing under the pointer
      const hitTol = pointerType === "mouse" ? HIT_TOLERANCE_PX : HIT_TOLERANCE_PX + 8;
      const id = hitTest(geos, x, y, hitTol);
      if (id) {
        this.select(id);
        const v = this.view.pointAt(x, y);
        this.drag = {
          kind: "move",
          id,
          orig: this.drawings,
          startLogical: v?.logical ?? 0,
          startPrice: v?.price ?? 0,
          startX: x,
          startY: y,
          moved: false,
        };
        return true;
      }
      this.select(null);
      return false;
    }

    // A new measurement replaces the previous one.
    if (tool === "measure" && !this.anchor) this.dismissMeasure();

    const p = this.pointFrom(x, y);
    if (!p) return true; // chart not ready: swallow so it doesn't pan under a drawing tool

    switch (gestureOf(tool)) {
      case "point":
      case "text":
        this.single = { down: true, at: p, x, y };
        this.host.onDraft(this.draftForSingle(p));
        return true;
      case "freehand":
        this.brush = { pts: [p], px: [[x, y]] };
        this.host.onDraft(null);
        return true;
      default: // two-point and measure
        if (!this.anchor) this.anchor = { a: p, down: true, gesture: 1, startX: x, startY: y, moved: false };
        else {
          this.anchor.down = true;
          this.anchor.gesture = 2;
        }
        this.emitTwoPoint(p);
        return true;
    }
  }

  /** Returns true if the move was part of an engine gesture (so the chart should ignore it). */
  pointerMove(x: number, y: number): boolean {
    if (this.hidden) return false;
    const drag = this.drag;
    if (drag) {
      const v = this.view.pointAt(x, y);
      if (!v) return true;
      const orig = drag.orig.find((d) => d.id === drag.id);
      if (!orig) return true;
      if (drag.kind === "move") {
        if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) < 3) return true;
        const next = moveDrawing(orig, Math.round(v.logical - drag.startLogical), v.price - drag.startPrice, this.view.times());
        drag.moved = true;
        this.host.onLive(replaceDrawing(drag.orig, next));
      } else {
        const p = this.pointFrom(x - drag.offX, y - drag.offY);
        if (!p) return true;
        drag.moved = true;
        this.host.onLive(replaceDrawing(drag.orig, editHandle(orig, drag.handle, p)));
      }
      return true;
    }

    if (this.brush) {
      const last = this.brush.px[this.brush.px.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) >= MIN_BRUSH_SPACING_PX) {
        const p = this.pointFrom(x, y);
        if (p) {
          // brush keeps exact times (not snapped to whole candles) so strokes stay smooth
          const v = this.view.pointAt(x, y);
          const smooth = v ? { time: Math.round(logicalToTime(this.view.times(), v.logical)), price: p.price } : p;
          this.brush.pts.push(smooth);
          this.brush.px.push([x, y]);
          this.host.onDraft(brushDraft(this.brush.pts));
        }
      }
      return true;
    }

    if (this.single?.down) {
      const p = this.pointFrom(x, y);
      if (p) {
        this.single.at = p;
        this.single.x = x;
        this.single.y = y;
        this.host.onDraft(this.draftForSingle(p));
      }
      return true;
    }

    if (this.anchor) {
      const p = this.pointFrom(x, y);
      if (p) {
        if (this.anchor.down && this.anchor.gesture === 1 && Math.hypot(x - this.anchor.startX, y - this.anchor.startY) > CLICK_SLOP_PX) this.anchor.moved = true;
        this.emitTwoPoint(p);
      }
      return true;
    }
    return false;
  }

  pointerUp(x: number, y: number): boolean {
    if (this.hidden) return false;
    const drag = this.drag;
    if (drag) {
      this.drag = null;
      if (drag.moved) {
        const list = this.latestFor(drag, x, y);
        if (list !== drag.orig) {
          this.drawings = list;
          this.host.onCommit(list);
        } else {
          this.host.onLive(drag.orig); // nothing really changed (or it collapsed): no history entry, restore the list
        }
      }
      return true;
    }

    if (this.brush) {
      const b = this.brush;
      this.brush = null;
      this.host.onDraft(null);
      if (b.pts.length < 2) {
        this.tool = "cursor";
        this.host.onTool("cursor"); // a plain tap with the brush draws nothing
        return true;
      }
      this.finish({ id: newDrawingId(), ...brushDraft(b.pts) });
      return true;
    }

    if (this.single?.down) {
      const s = this.single;
      const p = this.pointFrom(x, y) ?? s.at;
      this.single = null;
      this.host.onDraft(null);
      if (gestureOf(this.tool) === "text") {
        this.host.onRequestText({ x, y, at: p });
        return true;
      }
      const draft = draftFromPoint(this.tool, p);
      if (draft) this.finish({ id: newDrawingId(), ...draft });
      return true;
    }

    if (this.anchor) {
      const an = this.anchor;
      an.down = false;
      const p = this.pointFrom(x, y);
      if (!p) return true;
      if (an.gesture === 1 && !an.moved) {
        // A tap: keep the start point and wait for the second tap.
        this.emitTwoPoint(p);
        return true;
      }
      this.completeTwoPoint(an.a, p);
      return true;
    }
    return false;
  }

  /** Esc / pointercancel / losing the window: abandon the current gesture without recording anything. */
  cancel() {
    if (this.isBusy()) {
      this.abortGesture();
      return;
    }
    if (this.measuring) {
      this.dismissMeasure();
      return;
    }
    if (this.tool !== "cursor") {
      this.tool = "cursor";
      this.host.onTool("cursor");
    } else if (this.selectedId) this.select(null);
  }

  // --------------------------------------------------------------- operations

  deleteSelected(): boolean {
    if (this.locked || !this.selectedId) return false;
    const list = removeDrawing(this.drawings, this.selectedId);
    if (list === this.drawings || list.length === this.drawings.length) return false;
    this.drawings = list;
    this.select(null);
    this.host.onCommit(list);
    return true;
  }

  /** Text tool result: place a label at `at`. */
  addText(at: Pt, text: string) {
    const clean = text.trim();
    if (!clean) {
      this.tool = "cursor";
      this.host.onTool("cursor");
      return;
    }
    this.finish({ id: newDrawingId(), kind: "text", at, text: clean });
  }

  /** Cancel a pending text request without creating anything. */
  cancelText() {
    if (this.tool === "text") {
      this.tool = "cursor";
      this.host.onTool("cursor");
    }
  }

  updateText(id: string, text: string): boolean {
    const clean = text.trim();
    const cur = this.drawings.find((d) => d.id === id);
    if (this.locked || !cur || cur.kind !== "text" || !clean || clean === cur.text) return false;
    const next = { ...cur, text: clean };
    if (!validateDrawing(next)) {
      this.host.onNotice("invalid");
      return false;
    }
    this.drawings = replaceDrawing(this.drawings, next);
    this.host.onCommit(this.drawings);
    return true;
  }

  /** Ask the host to open the text editor for the selected label. */
  requestEditSelected(): boolean {
    if (this.locked) return false;
    const d = this.drawings.find((x) => x.id === this.selectedId);
    if (!d || d.kind !== "text") return false;
    const x = this.view.xOf(d.at.time);
    const y = this.view.yOf(d.at.price);
    if (x === null || y === null) return false;
    this.host.onRequestText({ x, y, at: d.at, editId: d.id, text: d.text });
    return true;
  }

  // ----------------------------------------------------------------- internals

  private latestFor(drag: Drag, x: number, y: number): Drawing[] {
    const orig = drag.orig.find((d) => d.id === drag.id);
    if (!orig) return drag.orig;
    const v = this.view.pointAt(x, y);
    if (!v) return drag.orig;
    let next: Drawing;
    if (drag.kind === "move") {
      next = moveDrawing(orig, Math.round(v.logical - drag.startLogical), v.price - drag.startPrice, this.view.times());
    } else {
      const p = this.pointFrom(x - drag.offX, y - drag.offY);
      next = p ? editHandle(orig, drag.handle, p) : orig;
    }
    // An unchanged drawing (e.g. a horizontal line dragged along itself) is not a history entry.
    if (next === orig || drawingsEqual(next, orig)) return drag.orig;
    // A handle drag that collapses a shape to nothing is reverted rather than recorded.
    if (isDegenerateDrawing(next)) return drag.orig;
    return replaceDrawing(drag.orig, next);
  }

  private draftForSingle(p: Pt): DrawingDraft | null {
    return draftFromPoint(this.tool, p); // text: nothing to preview before the label exists (null)
  }

  private emitTwoPoint(b: Pt) {
    const a = this.anchor?.a;
    if (!a) return;
    if (this.tool === "measure") {
      this.measuring = { a, b };
      this.host.onMeasure(this.measuring);
      return;
    }
    this.host.onDraft(draftFromAnchors(this.tool, a, b));
  }

  private completeTwoPoint(a: Pt, b: Pt) {
    if (this.tool === "measure") {
      // Keep the finished measurement on screen; it is not a drawing and not an undo step.
      this.anchor = null;
      this.measuring = { a, b };
      this.host.onMeasure(this.measuring);
      this.tool = "cursor";
      this.host.onTool("cursor");
      return;
    }
    const draft = draftFromAnchors(this.tool, a, b);
    if (!draft) return this.discardTwoPoint();
    if (isDegenerateDrawing(draft)) return this.discardTwoPoint();
    this.finish({ id: newDrawingId(), ...draft });
  }

  /** A degenerate shape (zero size) is dropped: nothing is recorded and the tool stays armed. */
  private discardTwoPoint() {
    this.anchor = null;
    this.host.onDraft(null);
  }
}
