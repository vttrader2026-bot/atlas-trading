import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyDoc, parseDoc, sortCashNewestFirst, type CashEntry, type InvestorDoc } from "@/lib/investor/model";
import { cashBalance } from "@/lib/investor/calc";

const e = (id: string, date: string, extra: Partial<CashEntry> = {}): CashEntry => ({ id, date, type: "deposit", amount: 10, ...extra });
const ids = (l: CashEntry[]) => l.map((x) => x.id);

describe("Cash ledger order (newest first)", () => {
  it("sorts by the transaction date, not insertion order", () => {
    const list = [e("a", "2026-01-05"), e("b", "2026-03-01"), e("c", "2026-02-10"), e("d", "2025-12-31")];
    expect(ids(sortCashNewestFirst(list))).toEqual(["b", "c", "a", "d"]);
  });
  it("a back-dated entry added last still lands in its chronological place", () => {
    const list = [e("new", "2026-05-01"), e("old", "2026-01-01"), e("backdated", "2026-03-15", { createdAt: 9_999_999_999_999 })];
    expect(ids(sortCashNewestFirst(list))).toEqual(["new", "backdated", "old"]);
  });
  it("same date: the later-recorded entry (createdAt) is first", () => {
    const list = [e("x", "2026-04-01", { createdAt: 1000 }), e("y", "2026-04-01", { createdAt: 3000 }), e("z", "2026-04-01", { createdAt: 2000 })];
    expect(ids(sortCashNewestFirst(list))).toEqual(["y", "z", "x"]);
  });
  it("same date, no timestamps (older saved data): later in the saved list counts as newer", () => {
    const list = [e("first", "2026-04-01"), e("second", "2026-04-01"), e("third", "2026-04-01")];
    expect(ids(sortCashNewestFirst(list))).toEqual(["third", "second", "first"]);
  });
  it("same date mixing timestamped and older entries: timestamped (recorded after the feature) come first", () => {
    const list = [e("legacy1", "2026-04-01"), e("legacy2", "2026-04-01"), e("stamped", "2026-04-01", { createdAt: 5 })];
    expect(ids(sortCashNewestFirst(list))).toEqual(["stamped", "legacy2", "legacy1"]);
  });
  it("identical date and timestamp: ordered consistently by list position, then id — whatever the input order", () => {
    const a = e("a", "2026-04-01", { createdAt: 7 });
    const b = e("b", "2026-04-01", { createdAt: 7 });
    expect(ids(sortCashNewestFirst([a, b]))).toEqual(["b", "a"]);
    expect(ids(sortCashNewestFirst([b, a]))).toEqual(["a", "b"]); // position decides; repeated calls never differ
    for (let i = 0; i < 5; i++) expect(ids(sortCashNewestFirst([a, b]))).toEqual(["b", "a"]);
  });
  it("does not modify the input and does not change the balance", () => {
    const doc: InvestorDoc = { ...emptyDoc(), cash: [e("a", "2026-01-01"), { ...e("b", "2026-02-01"), type: "withdrawal", amount: 4 }, e("c", "2026-03-01", { amount: 25 })] };
    const before = JSON.stringify(doc.cash);
    const sorted = sortCashNewestFirst(doc.cash);
    expect(JSON.stringify(doc.cash)).toBe(before);
    expect(sorted).toHaveLength(3);
    expect(cashBalance({ ...doc, cash: sorted, purchases: [], sales: [] })).toBe(cashBalance({ ...doc, purchases: [], sales: [] }));
    expect(cashBalance({ ...doc, purchases: [], sales: [] })).toBe(31);
  });
  it("empty list", () => expect(sortCashNewestFirst([])).toEqual([]));
});

describe("cash entries: saved data compatibility", () => {
  const base = { revision: 1, purchases: [], sales: [], plans: [], manualPrices: {}, bnbDiscount: false };
  it("entries without createdAt (saved before) still validate unchanged", () => {
    const r = parseDoc({ ...base, cash: [{ id: "c1", date: "2026-01-02", type: "deposit", amount: 100 }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.cash[0]).toEqual({ id: "c1", date: "2026-01-02", type: "deposit", amount: 100 });
  });
  it("createdAt round-trips and bad values are rejected", () => {
    const ok = parseDoc({ ...base, cash: [{ id: "c1", date: "2026-01-02", type: "deposit", amount: 100, createdAt: 1_700_000_000_000 }] });
    expect(ok.ok && ok.doc.cash[0].createdAt).toBe(1_700_000_000_000);
    for (const bad of ["x", -5, NaN, null]) {
      expect(parseDoc({ ...base, cash: [{ id: "c1", date: "2026-01-02", type: "deposit", amount: 1, createdAt: bad }] }).ok).toBe(false);
    }
  });
  it("the Ledger renders the cash list through the shared sorter and stamps new entries", () => {
    const src = readFileSync("components/investor/Ledger.tsx", "utf8");
    expect(src).toContain("sortCashNewestFirst(doc.cash)");
    expect(src).toMatch(/createdAt: Date\.now\(\)/);
  });
});
