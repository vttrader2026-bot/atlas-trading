/**
 * Minimal Telegram notifier for admin alerts (e.g. new payment request).
 * Uses the bot's raw HTTP API directly - no SDK dependency needed for a
 * single sendMessage call. Requires TELEGRAM_BOT_TOKEN and
 * TELEGRAM_ADMIN_CHAT_ID to be set; if either is missing, this logs and
 * no-ops rather than throwing, so a misconfigured env var never blocks
 * the actual payment submission from succeeding.
 */
export async function notifyAdmin(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.error("telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set, skipping notification");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error("telegram: sendMessage failed", await res.text());
    }
  } catch (err) {
    console.error("telegram: sendMessage threw", err);
  }
}

/**
 * Sends the payment-proof screenshot straight to the admin's Telegram DM,
 * with the request details as the photo caption (so it's one message, not
 * a text alert followed by a separate photo).
 *
 * `photoDataUrl` is the base64 data URL produced client-side by
 * fileToCompressedBase64() in app/elite/page.tsx (e.g.
 * "data:image/jpeg;base64,...."). Telegram's sendPhoto endpoint needs the
 * actual image bytes as multipart form data, not a data URL string, so
 * this decodes the base64 payload into a Buffer first.
 *
 * Falls back to a text-only notifyAdmin() call if the proof isn't a
 * recognizable base64 data URL, or if the photo upload itself fails - a
 * malformed image should never mean the admin gets no alert at all.
 */
export async function sendPaymentProofToAdmin(photoDataUrl: string, caption: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) {
    console.error("telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set, skipping photo notification");
    return;
  }

  const match = photoDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    console.error("telegram: proof was not a base64 image data URL, falling back to text-only alert");
    await notifyAdmin(caption);
    return;
  }

  try {
    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, "base64");
    const ext = mimeType.split("/")[1] || "jpg";

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([buffer], { type: mimeType }), `payment-proof.${ext}`);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      console.error("telegram: sendPhoto failed", await res.text());
      await notifyAdmin(caption);
    }
  } catch (err) {
    console.error("telegram: sendPhoto threw", err);
    await notifyAdmin(caption);
  }
}
