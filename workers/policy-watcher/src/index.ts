// Policy watcher Worker. Cron (production block only) enqueues one message per
// host; the queue consumer (max_concurrency 6, batch 1) processes that host
// sequentially. Manual run: POST /admin/run with X-Admin-Token (constant-time
// check, Worker-only secret WATCHER_ADMIN_TOKEN). No send_email binding.
import { finishRun, groupByHost, processHost, type Target, type WatchEnv } from "./watch";

export interface Env extends WatchEnv { WATCH_QUEUE: Queue<HostJob>; WATCHER_ADMIN_TOKEN?: string }
export interface HostJob { run_id: string; host: string; targets: Target[]; last?: boolean }

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = (await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function enqueueRun(env: Env, now = new Date()): Promise<{ run_id: string; hosts: number; targets: number }> {
  const run_id = `run-${now.toISOString().replace(/[:.]/g, "-")}`;
  const targets = (await env.DB.prepare("SELECT id, tool_slug, policy_url, pinned_host FROM watch_targets WHERE active = 1 ORDER BY id").all<Target>()).results;
  await env.DB.prepare("INSERT INTO runs (run_id, started_at, targets) VALUES (?, ?, ?)").bind(run_id, now.toISOString(), targets.length).run();
  // Retention: change records and per-run results kept 24 months.
  const cut = new Date(now.getTime() - 730 * 86_400_000).toISOString();
  await env.DB.batch([env.DB.prepare("DELETE FROM changes WHERE detected_at < ?").bind(cut), env.DB.prepare("DELETE FROM results WHERE checked_at < ?").bind(cut)]);
  const jobs = [...groupByHost(targets)].map(([host, ts]) => ({ body: { run_id, host, targets: ts } }));
  for (let i = 0; i < jobs.length; i += 100) await env.WATCH_QUEUE.sendBatch(jobs.slice(i, i + 100));
  return { run_id, hosts: jobs.length, targets: targets.length };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/admin/run") return new Response("Not found", { status: 404 });
    const tok = req.headers.get("X-Admin-Token");
    if (!env.WATCHER_ADMIN_TOKEN || env.WATCHER_ADMIN_TOKEN.length < 32 || !tok || !(await timingSafeEqual(tok, env.WATCHER_ADMIN_TOKEN))) return new Response("Unauthorized", { status: 401 });
    return Response.json(await enqueueRun(env));
  },
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(enqueueRun(env).then((r) => console.log(JSON.stringify({ event: "enqueued", ...r }))));
  },
  async queue(batch: MessageBatch<HostJob>, env: Env): Promise<void> {
    for (const m of batch.messages) {
      await processHost(env, m.body.run_id, m.body.targets);
      // Refresh the daily report after each host (cheap; last writer wins).
      await finishRun(env, m.body.run_id, new Date());
      m.ack();
    }
  },
} satisfies ExportedHandler<Env, HostJob>;
