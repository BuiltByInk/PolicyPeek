import { describe, it, expect } from "vitest";
import worker from "./index";
import { SECURITY_HEADERS } from "./securityHeaders";

const env = { DB: {} as D1Database } as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://api.getpolicypeek.com${path}`, init), env, ctx);

function expectSecurityHeaders(res: Response) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k)).toBe(v);
}

describe("API security headers", () => {
  it("are on /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
    expect(await res.json()).toMatchObject({ ok: true });
  });
  it("are on 404s", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });
  it("are on CORS preflight, alongside the CORS headers", async () => {
    const res = await call("/v1/check", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expectSecurityHeaders(res);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
  it("are on admin 401s", async () => {
    const res = await call("/v1/admin/pending");
    expect(res.status).toBe(401);
    expectSecurityHeaders(res);
  });
});
