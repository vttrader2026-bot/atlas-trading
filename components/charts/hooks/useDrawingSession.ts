"use client";

// The drawing session for the open chart: drawings + undo history, the active
// tool, selection, magnet/lock/hide, the text editor request and notices.
// Everything is in memory (nothing persisted). Owns the DrawingController's
// lifecycle and keeps the engine and the painter in sync with React state.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { formatPrice } from "@/lib/binance";
import { formatDuration, measure, type Drawing, type Tool } from "@/lib/chartDrawings";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/chartHistory";
import { DrawingController } from "@/components/charts/drawing/DrawingController";
import type { ChartCore } from "@/components/charts/hooks/chartCore";

export type TextRequest = { x: number; y: number; at: { time: number; price: number }; editId?: string; text?: string };

export function useDrawingSession(core: ChartCore, containerRef: RefObject<HTMLDivElement | null>, chartReady: boolean, t: (key: string) => string) {
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [history, setHistory] = useState<History<Drawing[]>>(() => createHistory<Drawing[]>([]));
  const [tool, setToolState] = useState<Tool>("cursor");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [textReq, setTextReq] = useState<TextRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const controllerRef = useRef<DrawingController | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((code: string) => {
    setNotice(code);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  // Controller lifecycle: created once the chart exists, destroyed with it.
  useEffect(() => {
    const container = containerRef.current;
    const chart = core.chartRef.current;
    const primitive = core.primitiveRef.current;
    if (!chartReady || !container || !chart || !primitive) return;

    const measureLines = (m: { a: { time: number; price: number }; b: { time: number; price: number } }) => {
      const times = core.candlesRef.current.map((c) => Math.floor(c.openTime / 1000));
      const r = measure(m.a, m.b, times);
      const sign = r.dPrice >= 0 ? "+" : "−";
      return [
        `${sign}${formatPrice(Math.abs(r.dPrice))} (${sign}${Math.abs(r.pct).toFixed(2)}%)`,
        `${Math.abs(r.bars)} ${tRef.current("charts.measureBars")} · ${formatDuration(r.seconds)}`,
      ];
    };

    const controller = new DrawingController({
      container,
      chart,
      primitive,
      getCandles: () => core.candlesRef.current,
      host: {
        onLive: (list) => primitive.setState({ drawings: list }),
        onCommit: (list) => setHistory((h) => commit(h, list)),
        onSelect: (id) => {
          setSelectedId(id);
          primitive.setState({ selectedId: id });
        },
        onTool: (next) => {
          setToolState(next);
          controller.syncTool(next);
        },
        onDraft: (d) => primitive.setState({ draft: d }),
        onMeasure: (m) => primitive.setState({ measure: m ? { a: m.a, b: m.b, lines: measureLines(m) } : null }),
        onRequestText: (req) => setTextReq(req),
        onNotice: (code) => showNotice(code),
      },
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [core, containerRef, chartReady, showNotice]);

  // React state -> painter / engine
  useEffect(() => {
    core.primitiveRef.current?.setState({ drawings: history.present });
    controllerRef.current?.engine.setDrawings(history.present);
  }, [core, history.present, chartReady]);
  useEffect(() => {
    controllerRef.current?.engine.setMagnet(magnet);
  }, [magnet, chartReady]);
  useEffect(() => {
    controllerRef.current?.engine.setLocked(locked);
  }, [locked, chartReady]);
  useEffect(() => {
    controllerRef.current?.engine.setHidden(hidden);
    core.primitiveRef.current?.setState({ hidden });
  }, [core, hidden, chartReady]);

  const selectTool = useCallback(
    (next: Tool) => {
      const engine = controllerRef.current?.engine;
      if (!engine) return;
      if (next !== "cursor" && hidden) {
        setHidden(false);
        engine.setHidden(false); // drawing while drawings are hidden would be invisible
      }
      engine.setTool(engine.getTool() === next && next !== "cursor" ? "cursor" : next);
    },
    [hidden]
  );

  const doUndo = useCallback(() => setHistory((h) => undo(h)), []);
  const doRedo = useCallback(() => setHistory((h) => redo(h)), []);
  const clearAll = useCallback(() => setHistory((h) => commit(h, [])), []);
  const deleteSelected = useCallback(() => {
    controllerRef.current?.engine.deleteSelected();
  }, []);
  const editSelectedText = useCallback(() => {
    controllerRef.current?.engine.requestEditSelected();
  }, []);

  /** Drawings are priced for one pair, so a symbol change starts a fresh session (drawings + undo history). */
  const reset = useCallback(() => {
    setHistory(createHistory<Drawing[]>([]));
    controllerRef.current?.engine.setTool("cursor");
  }, []);

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y (not while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // Text label editor (a small input shown over the chart)
  const submitText = useCallback(
    (value: string) => {
      const engine = controllerRef.current?.engine;
      const req = textReq;
      setTextReq(null);
      if (!engine || !req) return;
      if (req.editId) engine.updateText(req.editId, value);
      else engine.addText(req.at, value);
    },
    [textReq]
  );
  const cancelText = useCallback(() => {
    setTextReq(null);
    controllerRef.current?.engine.cancelText();
  }, []);

  const selectedDrawing = useMemo(() => history.present.find((d) => d.id === selectedId) ?? null, [history.present, selectedId]);

  return {
    drawings: history.present,
    tool,
    selectTool,
    selectedDrawing,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    undo: doUndo,
    redo: doRedo,
    clearAll,
    deleteSelected,
    canDelete: !!selectedDrawing && !locked,
    editSelectedText,
    magnet,
    toggleMagnet: () => setMagnet((m) => !m),
    locked,
    toggleLocked: () => setLocked((l) => !l),
    hidden,
    toggleHidden: () => setHidden((h) => !h),
    textReq,
    submitText,
    cancelText,
    notice,
    reset,
  };
}
