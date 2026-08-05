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

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
