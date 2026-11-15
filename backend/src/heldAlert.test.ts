import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "./index";
import { ALERT_FROM_EMAIL, ALERT_TO } from "./alert";
import {
  HELD_DIGEST_LIMIT,
  TEST_ALERT_TEXT,
  formatHeldCheckAlert,
  formatHeldDigest,
  maybeAlertHeldCheck,
  alertHeldReviewQueue,
} from "./heldAlert";

type StatusRow = { status: string } | null;

function mockEmail(opts: { reject?: boolean; timeout?: boolean } = {}) {
  return {
    send: vi.fn(async (_msg: unknown) => {
      if (opts.reject) throw new Error("send rejected");
      if (opts.timeout) await new Promise((r) => setTimeout(r, 20_000));
      return { messageId: "<test@mail.getpolicypeek.com>" };
    }),
  };
}

function alertEnv(opts: {
  status?: string | null;
  digestRows?: Array<{ id: number; domain: string }>;
  email?: ReturnType<typeof mockEmail>;
  throwOnRead?: boolean;
}): Env {
  return {
    ALERT_EMAIL: opts.email,
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
  it("includes the domain and check id only, never the source URL or queue page body", () => {
    const text = formatHeldCheckAlert({
      id: 144,
      domain: "zerodeposit.com",
      source_url: "https://www.zerodeposit.com/privacy-notice.pdf",
    });
    expect(text).toContain("held for review");
    expect(text).toContain("#144 zerodeposit.com");
    expect(text).not.toContain("zerodeposit.com/privacy");
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text.toLowerCase()).not.toContain("source");
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

  it("ignores a hostile or overlong source URL, and a missing one", () => {
    const dirty = formatHeldCheckAlert({
      id: 2,
      domain: "tool.com",
      source_url: "https://example.com/" + "x".repeat(1000) + String.fromCodePoint(0x202e) + "evil",
    });
    expect(dirty).not.toContain("example.com");
    expect(dirty).not.toMatch(/[\u202e]/);
    expect(formatHeldCheckAlert({ id: 3, domain: "tool.com", source_url: null })).toContain("#3 tool.com");
    expect(formatHeldCheckAlert({ id: 3, domain: "tool.com", source_url: null })).not.toMatch(/https?:\/\//i);
  });
});

describe("formatHeldDigest", () => {
  it("lists at most 20 rows and shows the total count", () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, domain: `tool${i + 1}.com` }));
    const text = formatHeldDigest(rows);
    expect(text).toContain("24 check(s) still waiting for review");
    expect(text).toContain("#20 tool20.com");
    expect(text).not.toContain("#21 ");
    expect(text).toContain("and 4 more");
    expect(HELD_DIGEST_LIMIT).toBe(20);
    expect(text).not.toMatch(/https?:\/\//i);
  });

  it("does not include source URLs or personal data in the digest", () => {
    const text = formatHeldDigest([{ id: 144, domain: "zerodeposit.com" }]);
    expect(text).toContain("#144 zerodeposit.com");
    expect(text.toLowerCase()).not.toContain("source");
    expect(text).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  });
});

describe("maybeAlertHeldCheck", () => {
  it("sends one plain-text email when the check is still extracted", async () => {
    const email = mockEmail();
    await maybeAlertHeldCheck(alertEnv({ status: "extracted", email }), {
      id: 144,
      domain: "zerodeposit.com",
      source_url: "https://www.zerodeposit.com/privacy-notice.pdf",
    });
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { from: { email: string }; to: string; subject: string; text: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.from.email).toBe(ALERT_FROM_EMAIL);
    expect(msg.subject).toContain("held for review");
    expect(msg.text).toContain("#144 zerodeposit.com");
    expect(msg.text).not.toContain("zerodeposit.com/privacy");
    expect(msg.text).not.toMatch(/https?:\/\//i);
    expect(msg).not.toHaveProperty("html");
  });

  it("does not alert when the check was auto-published or is still pending", async () => {
    const email = mockEmail();
    await maybeAlertHeldCheck(alertEnv({ status: "approved", email }), {
      id: 1,
      domain: "a.com",
      source_url: "https://a.com/p",
    });
    await maybeAlertHeldCheck(alertEnv({ status: "pending", email }), {
      id: 2,
      domain: "b.com",
      source_url: "https://b.com/p",
    });
    expect(email.send).not.toHaveBeenCalled();
  });

  it("is a silent no-op when the email binding isn't set", async () => {
    await expect(
      maybeAlertHeldCheck(alertEnv({ status: "extracted" }), { id: 1, domain: "a.com", source_url: "https://a.com/p" })
    ).resolves.toBeUndefined();
  });

  it("never throws when D1 or email send fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      maybeAlertHeldCheck(alertEnv({ throwOnRead: true, email: mockEmail() }), {
        id: 1,
        domain: "a.com",
        source_url: "https://a.com/p",
      })
    ).resolves.toBeUndefined();

    const email = mockEmail({ reject: true });
    await expect(
      maybeAlertHeldCheck(alertEnv({ status: "extracted", email }), {
        id: 1,
        domain: "a.com",
        source_url: "https://a.com/p",
      })
    ).resolves.toBeUndefined();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe("alertHeldReviewQueue", () => {
  it("sends nothing when the queue is empty", async () => {
    const email = mockEmail();
    await alertHeldReviewQueue(alertEnv({ digestRows: [], email }));
    expect(email.send).not.toHaveBeenCalled();
  });

  it("sends one digest listing waiting checks, IDs and domains only", async () => {
    const email = mockEmail();
    await alertHeldReviewQueue(
      alertEnv({
        digestRows: [
          { id: 144, domain: "zerodeposit.com" },
          { id: 150, domain: "example.com" },
        ],
        email,
      })
    );
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { to: string; text: string; subject: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.text).toContain("2 check(s) still waiting for review");
    expect(msg.text).toContain("#144 zerodeposit.com");
    expect(msg.text).toContain("#150 example.com");
    expect(msg.text).not.toMatch(/https?:\/\//i);
  });

  it("never throws when the query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(alertHeldReviewQueue(alertEnv({ throwOnRead: true, email: mockEmail() }))).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("POST /v1/admin/alerts/test", () => {
  it("is admin-only, sends a fixed test message, and does not touch D1", async () => {
    const worker = (await import("./index")).default;
    const email = mockEmail();
    const env = alertEnv({ email, throwOnRead: true });
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

    const noToken = await worker.fetch(new Request("https://api.getpolicypeek.com/v1/admin/alerts/test", { method: "POST" }), env, ctx);
    expect(noToken.status).toBe(401);
    expect(email.send).not.toHaveBeenCalled();

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
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { text: string; to: string; subject: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.text).toBe(TEST_ALERT_TEXT);
    expect(msg.text).not.toContain("attacker-controlled");
    expect(msg.text).not.toContain("144");
  });

  it("returns sent: false when the email binding is unset, without writing to D1", async () => {
    const worker = (await import("./index")).default;
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
  });
});

describe("scheduled digest reuses the existing 04:00 UTC cron", () => {
  it("waitUntil's the held-review digest on due-rechecks and does not write pending_checks", async () => {
    const worker = (await import("./index")).default;
    const email = mockEmail();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const writes: string[] = [];
    const pending: Promise<unknown>[] = [];
    const env = {
      ALERT_EMAIL: email,
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

    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { text: string; to: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.text).toContain("#144 zerodeposit.com");
    expect(msg.text).toContain("1 check(s) still waiting for review");
    expect(msg.text).not.toMatch(/https?:\/\//i);
    expect(writes.some((s) => /UPDATE\s+pending_checks|DELETE\s+FROM\s+pending_checks|INSERT\s+INTO\s+pending_checks/i.test(s))).toBe(false);
  });
});
