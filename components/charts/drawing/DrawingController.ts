// Binds the pure drawing engine to the real chart: reads pointer/touch/keyboard
// input on the chart container, converts pixels with the primitive's chart
// coordinate helpers, and keeps the chart's own pan/zoom from reacting to a
// gesture the engine has taken over.
//
// How the chart is kept from panning: listeners run in the capture phase on
// the chart container, i.e. before Lightweight Charts sees the event. When the
// engine reports "consumed" (a drawing tool is active, or the press landed on
// a drawing/handle) the event is stopped there. Presses on empty chart with the
// cursor tool are not consumed, so scrolling and zooming behave exactly as before.

import type { IChartApi } from "lightweight-charts";
import { DrawingEngine, type EngineHost, type EngineView } from "@/lib/chartDrawingEngine";
import type { DrawingsPrimitive } from "@/components/charts/drawingsPrimitive";
import type { Candle } from "@/lib/marketDataTypes";
import type { Tool } from "@/lib/chartDrawings";

export type DrawingControllerOptions = {
  container: HTMLElement;
  chart: IChartApi;
  primitive: DrawingsPrimitive;
  host: EngineHost;
  getCandles: () => Candle[];
};

const DOUBLE_TAP_MS = 350;

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export class DrawingController {
  readonly engine: DrawingEngine;
  private container: HTMLElement;
  private chart: IChartApi;
  private active = false; // a gesture owned by the engine is in progress
  private activePointer: number | null = null;
  private lastTap = { t: 0, id: null as string | null };
  private cachedCandles: Candle[] | null = null;
  private cachedTimes: number[] = [];
  private destroyed = false;
  private listeners: Array<() => void> = [];

  constructor(private opts: DrawingControllerOptions) {
    this.container = opts.container;
    this.chart = opts.chart;
    const { primitive } = opts;

    const view: EngineView = {
      times: () => this.times(),
      xOf: (t) => primitive.xOf(t),
      yOf: (p) => primitive.yOf(p),
      pointAt: (x, y) => primitive.pointAt(x, y),
      candleAt: (i) => {
        const c = this.opts.getCandles()[i];
        return c ? { open: c.open, high: c.high, low: c.low, close: c.close } : null;
      },
    };
    this.engine = new DrawingEngine(view, opts.host);

    const add = (target: HTMLElement | Window, type: string, fn: (e: never) => void, options: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, options);
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, options));
    };

    const cap: AddEventListenerOptions = { capture: true };
    const capNonPassive: AddEventListenerOptions = { capture: true, passive: false };
    add(this.container, "pointerdown", (e: PointerEvent) => this.onPointerDown(e), cap);
    add(this.container, "mousedown", (e: MouseEvent) => this.swallowIfActive(e), cap);
    add(this.container, "touchstart", (e: TouchEvent) => this.swallowIfActive(e, true), capNonPassive);
    add(this.container, "pointermove", (e: PointerEvent) => this.onContainerMove(e), cap);
    add(this.container, "mousemove", (e: MouseEvent) => this.swallowIfActive(e), cap);
    add(this.container, "touchmove", (e: TouchEvent) => this.swallowIfActive(e, true), capNonPassive);
    add(this.container, "dblclick", (e: MouseEvent) => this.onDoubleClick(e), cap);
    add(window, "pointermove", (e: PointerEvent) => this.onWindowMove(e), cap);
    add(window, "pointerup", (e: PointerEvent) => this.onPointerUp(e), cap);
    add(window, "pointercancel", () => this.onPointerCancel(), cap);
    add(window, "blur", () => this.engine.cancel(), cap);
    add(window, "keydown", (e: KeyboardEvent) => this.onKeyDown(e), cap);
  }

  /** Current tool → browser touch behaviour: while drawing, the chart area must not scroll the page. */
  syncTool(tool: Tool) {
    this.container.style.touchAction = tool === "cursor" ? "" : "none";
  }

  private times(): number[] {
    const candles = this.opts.getCandles();
    if (candles !== this.cachedCandles) {
      this.cachedCandles = candles;
      this.cachedTimes = candles.map((c) => Math.floor(c.openTime / 1000));
    }
    return this.cachedTimes;
  }

  /** Pointer position relative to the chart's price pane, or null when outside it (price axis, volume pane, other page areas). */
  private local(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.container.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const size = this.chart.paneSize(0);
    if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
    return { x, y };
  }

  private localLoose(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.container.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  private swallowIfActive(e: Event, preventDefault = false) {
    if (!this.active) return;
    e.stopPropagation();
    if (preventDefault && e.cancelable) e.preventDefault();
  }

  private onPointerDown(e: PointerEvent) {
    if (this.destroyed || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p = this.local(e.clientX, e.clientY);
    if (!p) return;
    const type = (e.pointerType === "touch" || e.pointerType === "pen" ? e.pointerType : "mouse") as "mouse" | "touch" | "pen";
    if (this.engine.pointerDown(p.x, p.y, type)) {
      this.active = true;
      this.activePointer = e.pointerId;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
    }
  }

  /** Hover (no button held): lets the second point of a tap-tap drawing follow the mouse. */
  private onContainerMove(e: PointerEvent) {
    if (this.active) {
      e.stopPropagation();
      return;
    }
    if (e.pointerType === "mouse" && this.engine.isBusy()) {
      const p = this.local(e.clientX, e.clientY);
      if (p) this.engine.pointerMove(p.x, p.y);
    }
  }

  private onWindowMove(e: PointerEvent) {
    if (!this.active || (this.activePointer !== null && e.pointerId !== this.activePointer)) return;
    const p = this.localLoose(e.clientX, e.clientY);
    this.engine.pointerMove(p.x, p.y);
    e.stopPropagation();
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.active || (this.activePointer !== null && e.pointerId !== this.activePointer)) return;
    const p = this.localLoose(e.clientX, e.clientY);
    const wasCursor = this.engine.getTool() === "cursor";
    this.engine.pointerUp(p.x, p.y);
    this.active = false;
    this.activePointer = null;
    e.stopPropagation();
    // double tap on a selected text label opens its editor (touch has no dblclick)
    if (wasCursor && e.pointerType !== "mouse") {
      const id = this.engine.getSelectedId();
      const now = Date.now();
      if (id && this.lastTap.id === id && now - this.lastTap.t < DOUBLE_TAP_MS) {
        this.engine.requestEditSelected();
        this.lastTap = { t: 0, id: null };
      } else this.lastTap = { t: now, id };
    }
  }

  private onPointerCancel() {
    if (!this.active) return;
    this.active = false;
    this.activePointer = null;
    this.engine.cancel();
  }

  private onDoubleClick(e: MouseEvent) {
    if (this.engine.getTool() !== "cursor") return;
    const p = this.local(e.clientX, e.clientY);
    if (!p) return;
    if (this.engine.requestEditSelected()) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (isTypingTarget(e.target)) return;
    if (e.key === "Escape") this.engine.cancel();
    else if ((e.key === "Delete" || e.key === "Backspace") && this.engine.getSelectedId()) {
      if (this.engine.deleteSelected()) e.preventDefault();
    } else if (e.key === "Enter" && this.engine.getSelectedId()) {
      if (this.engine.requestEditSelected()) e.preventDefault();
    }
  }

  destroy() {
    this.destroyed = true;
    for (const off of this.listeners) off();
    this.listeners = [];
    this.container.style.touchAction = "";
    this.active = false;
  }
}
