// WHATSAPP-BOT-v1
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { detectLang, matchIntent, decide, parseIncoming, parseOutbound, verifySignature, mediaPromptText, MEDIA_PROMPT, replyFor } from "@/lib/whatsappBot";

const mem = new Map<string, string>();
const fake = {
  set: vi.fn(async (k: string, v: string, o?: { nx?: boolean }) => { if (o?.nx && mem.has(k)) return null; mem.set(k, v); return "OK"; }),
  get: vi.fn(async (k: string) => mem.get(k) ?? null),
  del: vi.fn(async (k: string) => { mem.delete(k); return 1; }),
  incr: vi.fn(async (k: string) => { const n = Number(mem.get(k) ?? 0) + 1; mem.set(k, String(n)); return n; }),
  expire: vi.fn(async () => 1),
};
vi.mock("@/lib/redis", () => ({ getRedis: () => fake }));
const notify = vi.fn<(t: string) => Promise<void>>(async () => {});
vi.mock("@/lib/telegram", () => ({ notifyAdmin: (t: string) => notify(t) }));

const SECRET = "s3cret";
const sign = (b: string) => createHmac("sha256", SECRET).update(b).digest("hex");
const payload = (id: string, text: string, from = "22200000001") => ({ phone_number_id: "PN1", message: { id, from, type: "text", text: { body: text }, kapso: { direction: "inbound" } } });
const mediaPayload = (id: string, type: string, from = "22200000001") => ({ phone_number_id: "PN1", message: { id, from, type, kapso: { direction: "inbound" } } });
const sentPayload = (id: string, text: string | null, to = "22200000001", origin = "cloud_api") => ({ phone_number_id: "PN1", message: { id, to, type: text === null ? "image" : "text", ...(text === null ? {} : { text: { body: text } }), kapso: { direction: "outbound", origin } } });
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
  it("menu option 6 is the owner and 8 is the Academy", () => {
    expect(matchIntent("6")).toBe("human");
    expect(matchIntent("8")).toBe("academy");
    expect(replyFor("menu", "en")).toContain("6 - Talk to the owner");
    expect(replyFor("menu", "ar")).toContain("6 - التحدث مع المالك");
    expect(replyFor("menu", "fr")).toContain("6 - Parler au propriétaire");
  });
  it("specific topics beat generic help words; generic help shows the menu", () => {
    expect(matchIntent("help me with payment")).toBe("payment");
    expect(matchIntent("I need support about the price")).toBe("elite");
    expect(matchIntent("aide pour le paiement")).toBe("payment");
    expect(matchIntent("help me")).toBe("menu");
    expect(matchIntent("support")).toBe("menu");
    expect(matchIntent("I want to talk to a person")).toBe("human");
    expect(matchIntent("je veux parler à un humain")).toBe("human");
    expect(matchIntent("اريد التحدث مع المالك")).toBe("human");
  });
  it("uses the real price and limits from the config", () => {
    const r = decide("price").reply;
    expect(r).toContain("14.99");
    expect(r).toContain("600");
    expect(r).toContain("20");
  });
  it("unmatched text shows the main menu and never hands off; only an explicit request does", () => {
    const u = decide("ATLAS TEST");
    expect(u.handoff).toBe(false);
    expect(u.reply).toBe(replyFor("menu", "en"));
    expect(decide("asdf qwer").handoff).toBe(false);
    expect(decide("I want to talk to a person").handoff).toBe(true);
    expect(decide("6").handoff).toBe(true);
    expect(decide("price").handoff).toBe(false);
  });
  it("the English menu is exactly the agreed reference", () => {
    expect(replyFor("menu", "en")).toBe("Welcome to ATLAS TRADING 👋\nReply with a number:\n1 - ATLAS ELITE (price & benefits)\n2 - Free account\n3 - How to pay\n4 - AI chart analysis\n5 - Trade Feed & signals\n6 - Talk to the owner\n7 - Community\n8 - Academy\n\nhttps://www.atlastrading.app");
  });
  it("Arabic and French menus have the same structure and numbering as English", () => {
    const shape = (m: string) => m.split("\n").map((l) => (l.match(/^(\d) - /)?.[1] ?? (l.startsWith("http") ? "url" : l === "" ? "blank" : "text")));
    expect(shape(replyFor("menu", "ar"))).toEqual(shape(replyFor("menu", "en")));
    expect(shape(replyFor("menu", "fr"))).toEqual(shape(replyFor("menu", "en")));
  });
  it("Arabic greetings and general messages show the menu, never the Elite pricing", () => {
    const menuAr = replyFor("menu", "ar");
    for (const t of ["السلام عليكم", "السلام عليكم ورحمة الله وبركاته", "مرحبا", "مرحبا بكم", "اهلا وسهلا", "أهلاً بكم", "صباح الخير", "مساء الخير", "هلا والله", "اريد معلومات", "عندي سؤال", "السلام عليكم عندي سؤال"]) {
      expect(matchIntent(t), t).toBe(t === "اريد معلومات" || t.endsWith("سؤال") ? null : "menu");
      const r = decide(t).reply;
      expect(r, t).toBe(menuAr);
      expect(r).not.toContain("14.99");
    }
  });
  it("French and English greetings show the menu too", () => {
    expect(decide("Bonjour").reply).toBe(replyFor("menu", "fr"));
    expect(decide("bonsoir !").reply).toBe(replyFor("menu", "fr"));
    expect(decide("Hello").reply).toBe(replyFor("menu", "en"));
    expect(decide("good morning").reply).toBe(replyFor("menu", "en"));
  });
  it("a greeting followed by a real question still gets the right answer", () => {
    expect(matchIntent("السلام عليكم كم سعر الاشتراك")).toBe("elite");
    expect(matchIntent("السلام عليكم هل توجد اشارات")).toBe("feed");
    expect(matchIntent("السلام عليكم اريد الدفع")).toBe("payment");
    expect(matchIntent("بكم الاشتراك")).toBe("elite");
    expect(matchIntent("كم")).toBe("elite");
    expect(matchIntent("كلمة")).toBeNull();
    expect(matchIntent("اريد التحدث مع المالك")).toBe("human");
    expect(matchIntent("كلمني")).toBe("human");
  });
  it("option 1 shows the Elite information in every language", () => {
    expect(decide("1").reply).toContain("14.99");
    expect(decide("1", "ar").reply).toBe(replyFor("elite", "ar"));
    expect(decide("1", "fr").reply).toBe(replyFor("elite", "fr"));
    expect(replyFor("elite", "ar")).toContain("14.99");
  });
  it("no reply mentions a team or paused automation", () => {
    const all = (["menu", "human", "elite", "free", "payment", "analyzer", "feed", "academy", "community"] as const)
      .flatMap((i) => (["en", "ar", "fr"] as const).map((l) => replyFor(i, l))).join("\n") + mediaPromptText();
    expect(all).not.toMatch(/team|équipe|فريق|paused|suspendues|إيقاف الردود/i);
  });
  it("a digit keeps the customer's earlier language", () => {
    expect(decide("1", "ar").reply).toBe(decide("سعر").reply);
    expect(decide("1").reply).toBe(decide("price").reply);
  });
  it("parses attachments, ignores reactions, and reads outbound messages", () => {
    expect(parseIncoming(mediaPayload("x1", "image"))?.kind).toBe("media");
    expect(parseIncoming(mediaPayload("x2", "audio"))?.kind).toBe("media");
    expect(parseIncoming(mediaPayload("x3", "video"))?.kind).toBe("media");
    expect(parseIncoming(mediaPayload("x4", "document"))?.kind).toBe("media");
    expect(parseIncoming(mediaPayload("x5", "location"))?.kind).toBe("other");
    expect(parseIncoming(mediaPayload("x6", "reaction"))).toBeNull();
    expect(parseIncoming(payload("x7", "hi"))?.kind).toBe("text");
    expect(parseOutbound(sentPayload("o1", "hello", "+222 0000 0001"))?.keys).toEqual(["22200000001"]);
    expect(parseOutbound(payload("o2", "hi"))).toBeNull();
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
    mem.clear(); sent = []; notify.mockClear();
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
  it("unmatched text gets the menu, and the next message is answered normally (no silence)", async () => {
    await call(payload("b1", "ATLAS TEST")); await call(payload("b2", "price"));
    expect(sent).toHaveLength(2);
    expect(sent[0].body.text.body).toBe(replyFor("menu", "en"));
    expect(sent[1].body.text.body).toContain("14.99");
    expect(notify).not.toHaveBeenCalled();
  });
  it("asking for the owner alerts the owner once, replies, and the bot keeps working", async () => {
    await call(payload("h1", "6")); await call(payload("h2", "talk to a person")); await call(payload("h3", "price"));
    expect(sent).toHaveLength(3);
    expect(sent[0].body.text.body).toBe(replyFor("human", "en"));
    expect(sent[2].body.text.body).toContain("14.99");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("22200000001");
  });
  it("attachments get the exact prompt; 1 returns to the menu; 2 asks for the owner; the state is then cleared", async () => {
    await call(mediaPayload("m1", "image"));
    expect(sent[0].body.text.body.startsWith(MEDIA_PROMPT.en)).toBe(true);
    await call(payload("m2", "1"));
    expect(sent[1].body.text.body).toBe(replyFor("menu", "en"));
    await call(payload("m3", "1")); // no longer in the media state: 1 is ELITE again
    expect(sent[2].body.text.body).toContain("14.99");
    await call(mediaPayload("m4", "audio"));
    await call(payload("m5", "2"));
    expect(sent[4].body.text.body).toBe(replyFor("human", "en"));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("sent an attachment");
  });
  it("first Arabic message gets the Arabic menu; only option 1 then sends the Elite details", async () => {
    await call(payload("ar1", "السلام عليكم"));
    expect(sent[0].body.text.body).toBe(replyFor("menu", "ar"));
    await call(payload("ar2", "1"));
    expect(sent[1].body.text.body).toBe(replyFor("elite", "ar"));
  });
  it("outside the media prompt, 2 is still the free account", async () => {
    await call(payload("n1", "2"));
    expect(sent[0].body.text.body).toContain("sign-up");
  });
  it("manual takeover: the owner's own reply pauses the bot; /bot hands the chat back", async () => {
    await call(payload("t1", "price"));
    expect(sent).toHaveLength(1);
    await call(sentPayload("t1-out", sent[0].body.text.body), { event: "whatsapp.message.sent" }); // the bot's own message does NOT pause
    await call(payload("t2", "price"));
    expect(sent).toHaveLength(2);
    await call(sentPayload("o1", "Hi, this is the owner, one moment"), { event: "whatsapp.message.sent" });
    await call(payload("t3", "price")); await call(payload("t4", "hello"));
    expect(sent).toHaveLength(2); // paused
    await call(payload("u1", "price", "22200000002")); // other customers are unaffected
    expect(sent).toHaveLength(3);
    await call(sentPayload("o2", "/bot"), { event: "whatsapp.message.sent" });
    await call(payload("t5", "price"));
    expect(sent).toHaveLength(4);
  });
  it("a message from the WhatsApp Business app, or an attachment from the owner, also pauses", async () => {
    await call(sentPayload("b1", sent.length ? "x" : "hello there", "22200000003", "business_app"), { event: "whatsapp.message.sent" });
    await call(payload("p1", "price", "22200000003"));
    await call(sentPayload("b2", null, "22200000004"), { event: "whatsapp.message.sent" });
    await call(payload("p2", "price", "22200000004"));
    expect(sent).toHaveLength(0);
  });
  it("the webhook never sends a reply to its own sent event and rejects a bad signature on it", async () => {
    const r = await call(sentPayload("z1", "hi"), { event: "whatsapp.message.sent", sig: "bad" });
    expect(r.status).toBe(401);
    expect(sent).toHaveLength(0);
  });
  it("old 12-hour silence keys are no longer used", async () => {
    mem.set("wa:quiet:22200000001", "1");
    await call(payload("q1", "price"));
    expect(sent).toHaveLength(1);
    expect(readFileSync("app/api/whatsapp/webhook/route.ts", "utf8")).not.toMatch(/wa:quiet|HANDOFF_SILENCE/);
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
