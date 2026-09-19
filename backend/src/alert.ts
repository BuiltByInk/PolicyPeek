import type { Env } from "./index";

// Pushes a short plain-text message to Elliot's Telegram via a dedicated
// alert bot (not the bot Claude Code's Telegram plugin uses -- that token
// shouldn't also live in Cloudflare). Both secrets are optional: with either
// unset this is a silent no-op, so the Worker runs identically until they're
// added with `wrangler secret put ALERT_BOT_TOKEN` / `ALERT_CHAT_ID`.
//
// Never throws: an alert failing must not fail the cron run that raised it.
// And it never logs the request URL or the raw error, because the URL
// contains the bot token -- only a status code or a fixed string is logged.
export async function sendAlert(env: Env, text: string): Promise<boolean> {
  if (!env.ALERT_BOT_TOKEN || !env.ALERT_CHAT_ID) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.ALERT_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // No parse_mode: plain text, so nothing in `text` is interpreted.
      body: JSON.stringify({ chat_id: env.ALERT_CHAT_ID, text: text.slice(0, 3500) }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`[alert] Telegram send failed with status ${res.status}`);
      return false;
    }
    return true;
  } catch {
    console.warn("[alert] Telegram send failed (network error or timeout)");
    return false;
  }
}
