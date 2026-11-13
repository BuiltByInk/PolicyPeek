import type { Env } from "./index";

// Pushes a short plain-text email to elliotink@pm.me via a Cloudflare
// Email Sending binding (ALERT_EMAIL) pinned to that one destination.
// Elliot does not use Telegram, so this replaced the previous bot path.
//
// The binding is optional: when it is unset this is a silent no-op, so the
// Worker runs identically until the binding is added on deploy. Never throws:
// an alert failing must not fail /v1/check or the cron that raised it.
// Logs never include the message body, the destination, or a raw error.

export const ALERT_FROM_EMAIL = "privacy@mail.getpolicypeek.com";
export const ALERT_FROM_NAME = "PolicyPeek";
export const ALERT_TO = "elliotink@pm.me";
export const ALERT_REPLY_TO = ALERT_TO; // replies go to Elliot, not privacy@
export const ALERT_TIMEOUT_MS = 5_000;
const MAX_TEXT = 3500;
const MAX_SUBJECT = 200;

/** First line, with CR/LF and control chars stripped so they cannot break headers. */
export function subjectFrom(text: string): string {
  const first = (text.split(/\r?\n/)[0] ?? "PolicyPeek alert").trim() || "PolicyPeek alert";
  return first.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SUBJECT);
}

export async function sendAlert(env: Env, text: string): Promise<boolean> {
  if (!env.ALERT_EMAIL) return false;

  const body = text.slice(0, MAX_TEXT);
  const subject = subjectFrom(body);

  try {
    await Promise.race([
      env.ALERT_EMAIL.send({
        from: { email: ALERT_FROM_EMAIL, name: ALERT_FROM_NAME },
        to: ALERT_TO,
        replyTo: ALERT_REPLY_TO,
        subject,
        text: body,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), ALERT_TIMEOUT_MS)
      ),
    ]);
    return true;
  } catch {
    console.warn("[alert] Email send failed (network error, timeout, or rejected)");
    return false;
  }
}
