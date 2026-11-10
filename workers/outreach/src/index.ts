// Outreach sender Worker. Cron-only sending (no HTTP send route). Defaults:
// OUTREACH_MODE=dry_run, OUTREACH_ENABLED unset, D1 paused='1'.
import { handleAdmin, type AdminEnv } from "./admin";
import { runPurge } from "./purge";
import { runDaily, type SendEnv } from "./send";

export interface Env extends SendEnv, AdminEnv {}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleAdmin(req, env);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "30 3 * * *") {
      ctx.waitUntil(runPurge(env.DB).then((c) => console.log(JSON.stringify({ event: "purge", ...c }))));
      return;
    }
    ctx.waitUntil(runDaily(env).then((r) => console.log(JSON.stringify({ event: "daily", mode: r.mode, allowed: r.allowed, reason: r.reason ?? null, planned: r.planned, sent: r.sent.length }))));
  },
} satisfies ExportedHandler<Env>;
