import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "./index";
import { ALERT_FROM_EMAIL, ALERT_TO } from "./alert";
import {
  TEST_ALERT_TEXT,
  formatHeldCheckAlert,
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

const HELD_ROW = {
  id: 144, domain: "zerodeposit.com", name: null, is_recheck: 0,
  source_url: "https://www.zerodeposit.com/privacy-notice.pdf", archived_source_url: null,
  sourced_from_archive: 0, shared_domain: 0,
  extracted_facts: JSON.stringify({ trains_on_user_data: null, data_retention: null, gdpr_mentioned: true, opt_out_available: null, relevant_clauses: ["We process tenancy data <b>only</b> as described."] }),
  extraction_error: null, created_at: "2026-11-10T07:41:00.000Z", updated_at: "2026-11-10T07:41:30.000Z", raw_fetch: "text",
};

function sqlEnv(opts: { status?: string | null; held?: unknown[]; tools?: unknown[]; email?: ReturnType<typeof mockEmail>; throwOnRead?: boolean; throwOnDetail?: boolean }): Env {
  return {
    ALERT_EMAIL: opts.email,
    ADMIN_TOKEN: "test-admin-token",
    DB: {
      prepare(sql: string) {
        const st = {
          bind() { return st; },
          async first() {
            if (opts.throwOnRead) throw new Error("d1 down");
            return opts.status == null ? null : { status: opts.status };
          },
          async all() {
            if (opts.throwOnRead || opts.throwOnDetail) throw new Error("d1 down");
            if (sql.includes("FROM tools")) return { results: opts.tools ?? [] };
            if (sql.includes("FROM pending_checks WHERE status = 'extracted'")) return { results: opts.held ?? [] };
            return { results: [] };
          },
          async run() { throw new Error("held-alert paths must not write to D1"); },
        };
        return st;
      },
    },
  } as unknown as Env;
}

describe("maybeAlertHeldCheck", () => {
  it("sends one email with per-tool detail (text + html) when the check is still extracted", async () => {
    const email = mockEmail();
    await maybeAlertHeldCheck(sqlEnv({ status: "extracted", held: [HELD_ROW], email }), { id: 144, domain: "zerodeposit.com" });
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { from: { email: string }; to: string; subject: string; text: string; html: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.from.email).toBe(ALERT_FROM_EMAIL);
    expect(msg.subject).toBe("PolicyPeek: zerodeposit.com held for review");
    expect(msg.text).toContain("check #144");
    expect(msg.text).toContain("Policy checked: https://www.zerodeposit.com/privacy-notice.pdf");
    expect(msg.text).toContain("Checked: 10 Nov 2026, 07:41 UK time");
    expect(msg.text).toContain("Proposed verdict: Policy unclear");
    expect(msg.text).toContain("What you need to do:");
    expect(msg.html).toContain("&lt;b&gt;only&lt;/b&gt;");
    expect(msg.html).not.toContain("<b>only</b>");
    // policy URL is text, never a link
    expect(msg.html).not.toContain('href="https://www.zerodeposit.com');
  });

  it("falls back to the short notice when the detail lookup fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const email = mockEmail();
    await maybeAlertHeldCheck(sqlEnv({ status: "extracted", throwOnDetail: true, email }), { id: 144, domain: "zerodeposit.com" });
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { text: string };
    expect(msg.text).toBe(formatHeldCheckAlert({ id: 144, domain: "zerodeposit.com" }));
  });

  it("does not alert when the check was auto-published or is still pending", async () => {
    const email = mockEmail();
    await maybeAlertHeldCheck(sqlEnv({ status: "approved", email }), { id: 1, domain: "a.com" });
    await maybeAlertHeldCheck(sqlEnv({ status: "pending", email }), { id: 2, domain: "b.com" });
    expect(email.send).not.toHaveBeenCalled();
  });

  it("is a silent no-op when the email binding isn't set", async () => {
    await expect(maybeAlertHeldCheck(sqlEnv({ status: "extracted", held: [HELD_ROW] }), { id: 144, domain: "zerodeposit.com" })).resolves.toBeUndefined();
  });

  it("never throws when D1 or email send fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(maybeAlertHeldCheck(sqlEnv({ throwOnRead: true, email: mockEmail() }), { id: 1, domain: "a.com" })).resolves.toBeUndefined();
    const email = mockEmail({ reject: true });
    await expect(maybeAlertHeldCheck(sqlEnv({ status: "extracted", held: [HELD_ROW], email }), { id: 144, domain: "zerodeposit.com" })).resolves.toBeUndefined();
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe("alertHeldReviewQueue", () => {
  it("sends nothing when the queue is empty", async () => {
    const email = mockEmail();
    await alertHeldReviewQueue(sqlEnv({ held: [], email }));
    expect(email.send).not.toHaveBeenCalled();
  });

  it("sends nothing when every held item needs nothing from Elliot", async () => {
    const email = mockEmail();
    const curated = {
      ...HELD_ROW, id: 161, domain: "elevenlabs.io", is_recheck: 1,
      extracted_facts: JSON.stringify({ trains_on_user_data: true, data_retention: null, gdpr_mentioned: true, opt_out_available: true, relevant_clauses: [] }),
    };
    const tools = [{ domain: "elevenlabs.io", name: "ElevenLabs", compliance_status: "compliant_with_caveats", manual_override: 1, last_checked_at: "2026-10-15T16:02:55.792Z" }];
    await alertHeldReviewQueue(sqlEnv({ held: [curated], tools, email }));
    expect(email.send).not.toHaveBeenCalled();
  });

  it("sends one grouped digest when something needs Elliot", async () => {
    const email = mockEmail();
    await alertHeldReviewQueue(sqlEnv({ held: [HELD_ROW], email }));
    expect(email.send).toHaveBeenCalledTimes(1);
    const msg = email.send.mock.calls[0][0] as { to: string; text: string; subject: string; html: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.subject).toBe("PolicyPeek: 1 item needs you");
    expect(msg.text).toContain("== New tool waiting for its first badge (1) ==");
    expect(msg.text).not.toMatch(/still waiting for review/);
    expect(msg.html).toContain("<h3");
  });

  it("never throws when the query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(alertHeldReviewQueue(sqlEnv({ throwOnRead: true, email: mockEmail() }))).resolves.toBeUndefined();
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
              if (sql.includes("FROM pending_checks WHERE status = 'extracted'") && !sql.includes("FROM tools")) {
                return { results: [HELD_ROW] };
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
    expect(msg.text).toContain("check #144");
    expect(msg.text).toContain("PolicyPeek: 1 item needs you");
    expect(writes.some((s) => /UPDATE\s+pending_checks|DELETE\s+FROM\s+pending_checks|INSERT\s+INTO\s+pending_checks/i.test(s))).toBe(false);
  });
});
