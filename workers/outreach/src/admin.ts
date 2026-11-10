// Admin endpoints for the outreach Worker. Constant-time token check (same
// pattern as backend/src/auth.ts), using a Worker-only secret OUTREACH_ADMIN_TOKEN
// (never the backend's ADMIN_TOKEN). There is NO send route. Unpausing is not
// possible over HTTP: only `wrangler d1 execute` can set paused='0'.
import { planDay, render } from "./send";

export interface AdminEnv { DB: D1Database; OUTREACH_ADMIN_TOKEN?: string }

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function isAdmin(req: Request, env: AdminEnv): Promise<boolean> {
  const expected = env.OUTREACH_ADMIN_TOKEN;
  const provided = req.headers.get("X-Admin-Token");
  if (!expected || expected.length < 32 || !provided) return false;
  return timingSafeEqual(provided, expected);
}

export async function handleAdmin(req: Request, env: AdminEnv, now = new Date()): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/admin/")) return new Response("Not found", { status: 404 });
  if (!(await isAdmin(req, env))) return new Response("Unauthorized", { status: 401 });

  if (req.method === "GET" && url.pathname === "/admin/dry-run") {
    const plan = await planDay(env.DB, now);
    const gates = (await env.DB.prepare("SELECT tool_slug, passes, card_confirmed, gate_reason FROM card_gate ORDER BY tool_slug").all()).results;
    return Response.json({
      note: "DRY RUN: nothing was sent. Recipient addresses shown are what live mode would use.",
      cap: plan.cap, already_today: plan.alreadyToday,
      would_send: plan.queue.map((c) => ({ tool_slug: c.contact.tool_slug, kind: c.kind, to: c.contact.contact_email, card_gate: c.gateReason, ...render(c) })),
      skipped: plan.skipped, card_gate: gates,
    });
  }
  if (req.method === "POST" && url.pathname === "/admin/card-confirm") {
    const body = (await req.json().catch(() => null)) as { tool_slug?: string; confirmed_by?: string } | null;
    const slug = body?.tool_slug?.trim().toLowerCase();
    const by = body?.confirmed_by?.trim();
    if (!slug || !by || !/^[a-z0-9.-]{3,80}$/.test(slug) || by.length > 80) return Response.json({ error: "tool_slug and confirmed_by required" }, { status: 400 });
    const r = await env.DB.prepare("UPDATE card_gate SET card_confirmed = 1, confirmed_by = ?, confirmed_at = ? WHERE tool_slug = ?").bind(by, now.toISOString(), slug).run();
    if (r.meta.changes !== 1) return Response.json({ error: "unknown tool_slug" }, { status: 404 });
    return Response.json({ ok: true, tool_slug: slug });
  }
  if (req.method === "POST" && url.pathname === "/admin/pause") {
    await env.DB.prepare("UPDATE outreach_settings SET value = '1' WHERE key = 'paused'").run();
    return Response.json({ ok: true, paused: true });
  }
  return new Response("Not found", { status: 404 });
}
