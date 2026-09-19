import { handleLookup } from "./lookup";
import { resolveTier, requireAdminToken } from "./auth";
import { handleCheck } from "./check";
import { handleListPending, handleApprove, handleReject } from "./admin";
import { checkStuckPending, runMonthlyRecheck } from "./cron";
import { withCors, corsPreflightResponse } from "./cors";

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  ADMIN_TOKEN?: string;
  // Optional: enable stuck-pending push alerts (see alert.ts).
  ALERT_BOT_TOKEN?: string;
  ALERT_CHAT_ID?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ ok: true, service: "policypeek-backend" });
    }

    if ((url.pathname === "/v1/lookup" || url.pathname === "/v1/check") && request.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    if (url.pathname === "/v1/lookup" && request.method === "GET") {
      const tier = await resolveTier(request, env);
      return withCors(await handleLookup(request, env, tier));
    }

    if (url.pathname === "/v1/check" && request.method === "POST") {
      return withCors(await handleCheck(request, env, ctx));
    }

    const adminMatch = url.pathname.match(/^\/v1\/admin\/pending(?:\/(\d+)(?:\/(approve|reject))?)?$/);
    if (adminMatch) {
      if (!(await requireAdminToken(request, env))) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const [, idStr, action] = adminMatch;

      if (!idStr && request.method === "GET") {
        return handleListPending(env);
      }
      if (idStr && action === "approve" && request.method === "POST") {
        return handleApprove(env, Number(idStr));
      }
      if (idStr && action === "reject" && request.method === "POST") {
        return handleReject(env, Number(idStr));
      }
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "0 3 1 * *") {
      ctx.waitUntil(runMonthlyRecheck(env));
      return;
    }
    ctx.waitUntil(checkStuckPending(env));
  },
} satisfies ExportedHandler<Env>;
