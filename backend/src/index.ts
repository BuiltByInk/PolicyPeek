import { handleLookup } from "./lookup";
import { resolveTier } from "./auth";

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  ADMIN_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ ok: true, service: "policypeek-backend" });
    }

    if (url.pathname === "/v1/lookup" && request.method === "GET") {
      const tier = await resolveTier(request, env);
      return handleLookup(request, env, tier);
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
