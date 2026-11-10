import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "./index";
import {
  ADMIN_QUEUE_URL,
  HELD_DIGEST_LIMIT,
  TEST_ALERT_TEXT,
  formatHeldCheckAlert,
  formatHeldDigest,
  maybeAlertHeldCheck,
  alertHeldReviewQueue,
} from "./heldAlert";

type StatusRow = { status: string } | null;

function alertEnv(opts: {
  status?: string | null;
  digestRows?: Array<{ id: number; domain: string }>;
  token?: string;
  chat?: string;
  throwOnRead?: boolean;
}): Env {
  return {
    ALERT_BOT_TOKEN: opts.token,
    ALERT_CHAT_ID: opts.chat,
    ADMIN_TOKEN: "test-admin-token",
    DB: {
      prepare(_sql: string) {
        const st = {
          bind() {
            return st;
          },
          async first(): Promise<StatusRow> {
            if (opts.throwOnRead) throw new Error("d1 down");
            if (opts.status == null) return null;
            return { status: opts.status };
          },
          async all() {
            if (opts.throwOnRead) throw new Error("d1 down");
            return { results: opts.digestRows ?? [] };
          },
          async run() {
            throw new Error("held-alert paths must not write to D1");
          },
        };
        return st;
      },
    },
  } as unknown as Env;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("formatHeldCheckAlert", () => {
  it("includes the domain, check id, source URL, and admin queue pointer", () => {
    const text = formatHeldCheckAlert({
      id: 144,
      domain: "zerodeposit.com",
      source_url: "https://www.zerodeposit.com/privacy-notice.pdf",
    });
    expect(text).toContain("held for review");
    expect(text).toContain("#144 zerodeposit.com");
    expect(text).toContain("https://www.zerodeposit.com/privacy-notice.pdf");
    expect(text).toContain(`GET ${ADMIN_QUEUE_URL}`);
  });

  it("does not include requester IP or other personal fields", () => {
    const text = formatHeldCheckAlert({
      id: 1,
      domain: "example.com",
      source_url: "https://example.com/privacy",
    });
    expect(text).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    expect(text.toLowerCase()).not.toContain("cf-connecting-ip");
    expect(text.toLowerCase()).not.toContain("x-forwarded-for");
    expect(text.toLowerCase()).not.toMatch(/\bip\b/);
  });

  it("cleans and caps a hostile or overlong source URL, and handles a missing one", () => {
    const dirty = formatHeldCheckAlert({
      id: 2,
      domain: "tool.com",
      source_url: "https://example.com/" + "x".repeat(1000) + String.fromCodePoint(0x202e) + "evil",
    });
    expect(dirty.length).toBeLessThan(800);
    expect(dirty).not.toMatch(/[\u202e]/);
    expect(formatHeldCheckAlert({ id: 3, domain: "tool.com", source_url: null })).toContain("(no source URL)");
  });
});

describe("formatHeldDigest", () => {
  it("lists at most 20 rows, shows the total count, and points at the queue", () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, domain: `tool${i + 1}.com` }));
    const text = formatHeldDigest(rows);
    expect(text).toContain("24 check(s) still waiting for review");
    expect(text).toContain("#20 tool20.com");
    expect(text).not.toContain("#21 ");
    expect(text).toContain("and 4 more");
    expect(text).toContain(`GET ${ADMIN_QUEUE_URL}`);
    expect(HELD_DIGEST_LIMIT).toBe(20);
  });

  it("does not include source URLs or personal data in the digest", () => {
    const text = formatHeldDigest([{ id: 144, domain: "zerodeposit.com" }]);
    expect(text).toContain("#144 zerodeposit.com");
    expect(text.toLowerCase()).not.toContain("source");
    expect(text).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  });
});

describe("maybeAlertHeldCheck", () => {
  it("sends one plain-text Telegram message when the check is still extracted", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await maybeAlertHeldCheck(alertEnv({ status: "extracted", token: "SECRET-TOKEN", chat: "999" }), {
      id: 144,
      domain: "zerodeposit.com",
      source_url: "https://www.zerodeposit.com/privacy-notice.pdf",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botSECRET-TOKEN/sendMessage");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("999");
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).toContain("#144 zerodeposit.com");
    expect(body.text).toContain("https://www.zerodeposit.com/privacy-notice.pdf");
    expect(JSON.stringify(body)).not.toContain("SECRET-TOKEN");
  });

  it("does not alert when the check was auto-published or is still pending", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await maybeAlertHeldCheck(alertEnv({ status: "approved", token: "t", chat: "1" }), {
      id: 1,
      domain: "a.com",
      source_url: "https://a.com/p",
    });
    await maybeAlertHeldCheck(alertEnv({ status: "pending", token: "t", chat: "1" }), {
      id: 2,
      domain: "b.com",
      source_url: "https://b.com/p",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a silent no-op when the alert secrets aren't set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      maybeAlertHeldCheck(alertEnv({ status: "extracted" }), { id: 1, domain: "a.com", source_url: "https://a.com/p" })
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never throws or leaks the bot token when D1 or Telegram fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      maybeAlertHeldCheck(alertEnv({ throwOnRead: true, token: "SECRET-TOKEN", chat: "1" }), {
        id: 1,
        domain: "a.com",
        source_url: "https://a.com/p",
      })
    ).resolves.toBeUndefined();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect failed https://api.telegram.org/botSECRET-TOKEN/sendMessage");
      })
    );
    await expect(
      maybeAlertHeldCheck(alertEnv({ status: "extracted", token: "SECRET-TOKEN", chat: "1" }), {
        id: 1,
        domain: "a.com",
        source_url: "https://a.com/p",
      })
    ).resolves.toBeUndefined();

    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET-TOKEN");
    }
  });
});

describe("alertHeldReviewQueue", () => {
  it("sends nothing when the queue is empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await alertHeldReviewQueue(alertEnv({ digestRows: [], token: "t", chat: "1" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends one digest listing waiting checks", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await alertHeldReviewQueue(
      alertEnv({
        digestRows: [
          { id: 144, domain: "zerodeposit.com" },
          { id: 150, domain: "example.com" },
        ],
        token: "SECRET-TOKEN",
        chat: "42",
      })
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text).toContain("2 check(s) still waiting for review");
    expect(body.text).toContain("#144 zerodeposit.com");
    expect(body.text).toContain("#150 example.com");
    expect(body.parse_mode).toBeUndefined();
  });

  it("never throws when the query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(alertHeldReviewQueue(alertEnv({ throwOnRead: true, token: "t", chat: "1" }))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("POST /v1/admin/alerts/test", () => {
  it("is admin-only, sends a fixed test message, and does not touch D1", async () => {
    const worker = (await import("./index")).default;
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const env = alertEnv({ token: "SECRET-TOKEN", chat: "7", throwOnRead: true });
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

    const noToken = await worker.fetch(new Request("https://api.getpolicypeek.com/v1/admin/alerts/test", { method: "POST" }), env, ctx);
    expect(noToken.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();

    const wrongToken = await worker.fetch(
      new Request("https://api.getpolicypeek.com/v1/admin/alerts/test", {
        method: "POST",
        headers: { "X-Admin-Token": "nope" },
      }),
      env,
      ctx
    );
    expect(wrongToken.status).toBe(401);

    const get = await worker.fetch(
      new Request("https://api.getpolicypeek.com/v1/admin/alerts/test", {
        method: "GET",
        headers: { "X-Admin-Token": "test-admin-token" },
      }),
      env,
      ctx
    );
    expect(get.status).toBe(404);

    const ok = await worker.fetch(
      new Request("https://api.getpolicypeek.com/v1/admin/alerts/test", {
        method: "POST",
        headers: { "X-Admin-Token": "test-admin-token", "content-type": "application/json" },
        body: JSON.stringify({ text: "attacker-controlled message", id: 144 }),
      }),
      env,
      ctx
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, sent: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text).toBe(TEST_ALERT_TEXT);
    expect(body.text).not.toContain("attacker-controlled");
    expect(body.text).not.toContain("144");
    expect(body.parse_mode).toBeUndefined();
  });

  it("returns sent: false when Telegram secrets are unset, without writing to D1", async () => {
    const worker = (await import("./index")).default;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = alertEnv({ throwOnRead: true });
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(
      new Request("https://api.getpolicypeek.com/v1/admin/alerts/test", {
        method: "POST",
        headers: { "X-Admin-Token": "test-admin-token" },
      }),
      env,
      ctx
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("scheduled digest reuses the existing 04:00 UTC cron", () => {
  it("waitUntil's the held-review digest on due-rechecks and does not write pending_checks", async () => {
    const worker = (await import("./index")).default;
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const writes: string[] = [];
    const pending: Promise<unknown>[] = [];
    const env = {
      ALERT_BOT_TOKEN: "SECRET-TOKEN",
      ALERT_CHAT_ID: "1",
      DB: {
        prepare(sql: string) {
          const st = {
            bind() {
              return st;
            },
            async first() {
              return null;
            },
            async all() {
              if (sql.includes("FROM pending_checks") && sql.includes("status = 'extracted'")) {
                return { results: [{ id: 144, domain: "zerodeposit.com" }] };
              }
              return { results: [] };
            },
            async run() {
              writes.push(sql);
              return { success: true, meta: { changes: 0 } };
            },
          };
          return st;
        },
      },
    } as unknown as Env;
    const ctx = {
      waitUntil(p: Promise<unknown>) {
        pending.push(p);
      },
      passThroughOnException() {},
    } as unknown as ExecutionContext;

    await worker.scheduled({ cron: "0 4 * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController, env, ctx);
    await Promise.all(pending);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text).toContain("#144 zerodeposit.com");
    expect(body.text).toContain("1 check(s) still waiting for review");
    expect(writes.some((s) => /UPDATE\s+pending_checks|DELETE\s+FROM\s+pending_checks|INSERT\s+INTO\s+pending_checks/i.test(s))).toBe(false);
  });
});
