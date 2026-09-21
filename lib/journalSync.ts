import { Trade, loadTrades, writeLocalTrades, setJournalSaveListener } from "@/lib/journal";

const SYNCED_FOR_KEY = "atlas-trading.journal.syncedFor";
const DIRTY_KEY = "atlas-trading.journal.dirty";
export const JOURNAL_UPDATED_EVENT = "atlas-journal-updated";

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function setDirty(dirty: boolean) {
  try {
    if (dirty) window.localStorage.setItem(DIRTY_KEY, "1");
    else window.localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* storage unavailable: nothing to track */
  }
}

async function push(trades: Trade[]): Promise<boolean> {
  try {
    const res = await fetch("/api/me/journal", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function schedulePush(trades: Trade[]) {
  setDirty(true);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (await push(trades)) setDirty(false);
  }, 800);
}

// First sync on a device: keep everything from both sides (matched by id, local wins).
function mergeById(local: Trade[], server: Trade[]): Trade[] {
  const ids = new Set(local.map((t) => t.id));
  return [...local, ...server.filter((t) => !ids.has(t.id))].sort((a, b) =>
    (b.date || "").localeCompare(a.date || ""),
  );
}

export function startJournalSync(userId: string): () => void {
  let cancelled = false;
  setJournalSaveListener(schedulePush);

  (async () => {
    try {
      const res = await fetch("/api/me/journal", { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      const server: Trade[] = Array.isArray(data.trades) ? data.trades : [];
      const local = loadTrades();
      const syncedFor = window.localStorage.getItem(SYNCED_FOR_KEY);
      const dirty = window.localStorage.getItem(DIRTY_KEY) === "1";

      let result: Trade[];
      if (syncedFor === null) {
        // Never synced on this device: combine both sides.
        result = mergeById(local, server);
      } else if (syncedFor !== userId) {
        // The local copy belongs to another account: use this account's copy.
        result = server;
      } else if (dirty || server.length === 0) {
        // Unsent local changes (or an empty server copy) must not be overwritten.
        result = local;
      } else {
        // Same account, nothing unsent: the account copy is the source of truth.
        result = server;
      }
      if (cancelled) return;

      if (JSON.stringify(result) !== JSON.stringify(local)) {
        writeLocalTrades(result);
        window.dispatchEvent(new Event(JOURNAL_UPDATED_EVENT));
      }
      window.localStorage.setItem(SYNCED_FOR_KEY, userId);

      if (JSON.stringify(result) !== JSON.stringify(server)) {
        if (await push(result)) setDirty(false);
      } else {
        setDirty(false);
      }
    } catch {
      /* offline or server error: local data stays untouched */
    }
  })();

  return () => {
    cancelled = true;
    setJournalSaveListener(null);
    if (pushTimer) clearTimeout(pushTimer);
  };
}