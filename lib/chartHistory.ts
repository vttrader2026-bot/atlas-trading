// Undo/redo for chart drawings: an immutable snapshot history. One history
// belongs to one chart session (it is created when the workspace mounts and
// reset when the symbol changes); nothing here touches storage.

export type History<T> = { past: T[]; present: T; future: T[] };

/** Most undo steps kept; the oldest are dropped beyond this. */
export const MAX_HISTORY = 200;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

/** Records `next` as the new present. A no-op (same reference) adds no entry, and any redo branch is discarded. */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h;
  const past = [...h.past, h.present];
  return { past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past, present: next, future: [] };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}
