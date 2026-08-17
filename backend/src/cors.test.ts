import { describe, it, expect } from "vitest";
import { withCors, corsPreflightResponse, CORS_HEADERS } from "./cors";

describe("withCors", () => {
  it("adds CORS headers without disturbing the original status/body", async () => {
    const original = Response.json({ ok: true }, { status: 202 });
    const wrapped = withCors(original);

    expect(wrapped.status).toBe(202);
    expect(wrapped.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await wrapped.json()).toEqual({ ok: true });
  });

  it("preserves a non-200 status (e.g. a 429 rate-limit response)", () => {
    const original = Response.json({ error: "rate_limited" }, { status: 429 });
    const wrapped = withCors(original);
    expect(wrapped.status).toBe(429);
  });
});

describe("corsPreflightResponse", () => {
  it("returns a 204 with the CORS headers, no body", async () => {
    const res = corsPreflightResponse();
    expect(res.status).toBe(204);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      expect(res.headers.get(key)).toBe(value);
    }
    expect(await res.text()).toBe("");
  });
});
