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
