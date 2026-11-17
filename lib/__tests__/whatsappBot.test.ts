// WHATSAPP-BOT-v1
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { detectLang, matchIntent, decide, parseIncoming, verifySignature } from "@/lib/whatsappBot";

const mem = new Map<string, string>();
const fake = {
  set: vi.fn(async (k: string, v: string, o?: { nx?: boolean }) => { if (o?.nx && mem.has(k)) return null; mem.set(k, v); return "OK"; }),
  get: vi.fn(async (k: string) => mem.get(k) ?? null),
  del: vi.fn(async (k: string) => { mem.delete(k); return 1; }),
  incr: vi.fn(async (k: string) => { const n = Number(mem.get(k) ?? 0) + 1; mem.set(k, String(n)); return n; }),
  expire: vi.fn(async () => 1),
};
vi.mock("@/lib/redis", () => ({ getRedis: () => fake }));

const SECRET = "s3cret";
const sign = (b: string) => createHmac("sha256", SECRET).update(b).digest("hex");
const payload = (id: string, text: string, from = "22200000001") => ({ phone_number_id: "PN1", message: { id, from, type: "text", text: { body: text }, kapso: { direction: "inbound" } } });
const call = async (p: unknown, opts: { sig?: string; event?: string } = {}) => {
  const body = JSON.stringify(p);
  const { POST } = await import("@/app/api/whatsapp/webhook/route");
  return POST(new Request("https://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-webhook-signature": opts.sig ?? sign(body), "x-webhook-event": opts.event ?? "whatsapp.message.received" } }));
};

describe("fixed-answer logic", () => {
  it("detects language", () => {
    expect(detectLang("كم سعر الاشتراك")).toBe("ar");
    expect(detectLang("bonjour, quel est le prix ?")).toBe("fr");
    expect(detectLang("how much is elite")).toBe("en");
  });
  it("matches intents in 3 languages and menu digits", () => {
    expect(matchIntent("What is the price?")).toBe("elite");
    expect(matchIntent("كم سعر الاشتراك")).toBe("elite");
    expect(matchIntent("Quel est le prix ?")).toBe("elite");
    expect(matchIntent("how do I pay with bankily")).toBe("payment");
    expect(matchIntent("hello")).toBe("menu");
    expect(matchIntent("5")).toBe("feed");
    expect(matchIntent("blah blah unknown")).toBeNull();
  });
  it("uses the real price and limits from the config", () => {
    const r = decide("price").reply;
    expect(r).toContain("14.99");
    expect(r).toContain("600");
    expect(r).toContain("20");
  });
  it("unknown text or a person request hands off", () => {
    expect(decide("asdf qwer").handoff).toBe(true);
    expect(decide("I want to talk to a person").handoff).toBe(true);
    expect(decide("price").handoff).toBe(false);
  });
  it("parses customers only and ignores our own outbound messages", () => {
    expect(parseIncoming(payload("m1", "hi"))?.senderKey).toBe("22200000001");
    const out = payload("m2", "hi"); (out.message.kapso as { direction: string }).direction = "outbound";
    expect(parseIncoming(out)).toBeNull();
    expect(parseIncoming({ message: { id: "m3", from_user_id: "US.1", type: "text", text: { body: "x" } } })?.to).toEqual({ bsuid: "US.1" });
  });
  it("verifies signatures in constant time and rejects bad ones", () => {
    expect(verifySignature("abc", sign("abc"), SECRET)).toBe(true);
    expect(verifySignature("abc", "00", SECRET)).toBe(false);
    expect(verifySignature("abc", null, SECRET)).toBe(false);
    expect(verifySignature("abc", sign("abc"), undefined)).toBe(false);
  });
});

describe("webhook route", () => {
  let sent: { url: string; body: { to?: string; text: { body: string } }; key: string }[];
  beforeEach(() => {
    mem.clear(); sent = [];
    process.env.KAPSO_WEBHOOK_SECRET = SECRET; process.env.KAPSO_API_KEY = "k"; delete process.env.KAPSO_PHONE_NUMBER_ID;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => { sent.push({ url, body: JSON.parse(init.body), key: init.headers["X-API-Key"] }); return new Response("{}", { status: 200 }); }));
  });
  it("rejects a bad signature and sends nothing", async () => {
    const res = await call(payload("a1", "price"), { sig: "bad" });
    expect(res.status).toBe(401); expect(sent).toHaveLength(0);
  });
  it("ignores other events", async () => {
    const res = await call(payload("a2", "price"), { event: "whatsapp.message.sent" });
    expect(res.status).toBe(200); expect(sent).toHaveLength(0);
  });
  it("replies once, to the right number, even when Kapso retries", async () => {
    await call(payload("a3", "price")); await call(payload("a3", "price"));
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain("/v24.0/PN1/messages");
    expect(sent[0].body).toMatchObject({ messaging_product: "whatsapp", to: "22200000001", type: "text" });
    expect(sent[0].body.text.body).toContain("14.99");
  });
  it("handoff: replies once, then stays quiet for that chat", async () => {
    await call(payload("b1", "asdf qwer")); await call(payload("b2", "price"));
    expect(sent).toHaveLength(1);
  });
  it("caps replies per customer per day", async () => {
    for (let i = 0; i < 25; i++) await call(payload("c" + i, "price", "22200000009"));
    expect(sent).toHaveLength(20);
  });
  it("a failed send is released so the retry can reply", async () => {
    (fetch as unknown as { mockResolvedValueOnce: (v: Response) => void }).mockResolvedValueOnce(new Response("no", { status: 500 }));
    expect((await call(payload("d1", "price"))).status).toBe(500);
    expect((await call(payload("d1", "price"))).status).toBe(200);
    expect(sent).toHaveLength(1);
  });
  it("never touches the Telegram trade bot routes", () => {
    const s = readFileSync("app/api/whatsapp/webhook/route.ts", "utf8");
    expect(s).not.toMatch(/trade-feed|TRADE_BOT_SECRET/);
  });
});
