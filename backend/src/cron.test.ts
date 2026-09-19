import { describe, it, expect, vi, afterEach } from "vitest";
import type { Env } from "./index";
import { checkStuckPending, formatStuckAlert } from "./cron";

type Row = { id: number; domain: string; created_at: string; extraction_error: string | null };

function makeEnv(opts: { allStuck: Row[]; newlyStuck: Row[]; token?: string; chat?: string }): Env {
  return {
    ALERT_BOT_TOKEN: opts.token,
    ALERT_CHAT_ID: opts.chat,
    DB: {
      prepare(sql: string) {
        const st = {
          bind() {
            return st;
          },
          async all() {
            return { results: sql.includes("created_at >=") ? opts.newlyStuck : opts.allStuck };
          },
        };
        return st;
      },
    },
  } as unknown as Env;
}

const row = (id: number, error: string | null = null): Row => ({
  id,
  domain: `tool${id}.com`,
  created_at: "2026-09-19T08:00:00.000Z",
  extraction_error: error,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkStuckPending alerting", () => {
  it("does nothing when nothing is stuck", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await checkStuckPending(makeEnv({ allStuck: [], newlyStuck: [], token: "t", chat: "1" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("logs but does not alert for rows that were already stuck in an earlier run", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkStuckPending(makeEnv({ allStuck: [row(1)], newlyStuck: [], token: "t", chat: "1" }));
    expect(warn).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends one plain-text Telegram message for newly stuck rows, including the failure reason", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stuck = [row(7, "ANTHROPIC_API_KEY not configured")];
    await checkStuckPending(makeEnv({ allStuck: stuck, newlyStuck: stuck, token: "SECRET-TOKEN", chat: "999" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botSECRET-TOKEN/sendMessage");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("999");
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).toContain("tool7.com");
    expect(body.text).toContain("ANTHROPIC_API_KEY not configured");
  });

  it("is a silent no-op when the alert secrets aren't set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stuck = [row(1)];
    await expect(checkStuckPending(makeEnv({ allStuck: stuck, newlyStuck: stuck }))).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never throws or leaks the bot token when Telegram is unreachable or rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stuck = [row(1)];

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connect failed https://api.telegram.org/botSECRET-TOKEN/sendMessage"); }));
    await expect(checkStuckPending(makeEnv({ allStuck: stuck, newlyStuck: stuck, token: "SECRET-TOKEN", chat: "1" }))).resolves.toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(checkStuckPending(makeEnv({ allStuck: stuck, newlyStuck: stuck, token: "SECRET-TOKEN", chat: "1" }))).resolves.toBeUndefined();

    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET-TOKEN");
    }
  });
});

describe("formatStuckAlert", () => {
  it("lists at most 10 rows and says how many more there are", () => {
    const rows = Array.from({ length: 14 }, (_, i) => row(i + 1));
    const text = formatStuckAlert(rows);
    expect(text).toContain("14 check(s)");
    expect(text).toContain("#10 ");
    expect(text).not.toContain("#11 ");
    expect(text).toContain("and 4 more");
  });

  it("truncates a long failure reason", () => {
    const text = formatStuckAlert([row(1, "x".repeat(1000))]);
    expect(text.length).toBeLessThan(400);
  });
});

describe("checkStuckPending -- alert query and text", () => {
  it("excludes pages that can never produce text (client-rendered sites) from alerts", async () => {
    const queries: string[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          queries.push(sql);
          const st = { bind() { return st; }, async all() { return { results: [] }; } };
          return st;
        },
      },
    } as unknown as Env;
    await checkStuckPending(env);
    // With nothing stuck only the first query runs; force the second by
    // returning a stuck row from the first.
    const env2 = {
      DB: {
        prepare(sql: string) {
          queries.push(sql);
          const st = {
            bind() { return st; },
            async all() { return { results: sql.includes("created_at >=") ? [] : [{ id: 1, domain: "a.com", created_at: "x", extraction_error: null }] }; },
          };
          return st;
        },
      },
    } as unknown as Env;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkStuckPending(env2);
    const alertQuery = queries.find((q) => q.includes("created_at >="))!;
    expect(alertQuery).toContain("NOT LIKE 'empty_extracted_text%'");
  });

  it("cleans invisible characters out of the failure reason in an alert", () => {
    const text = formatStuckAlert([row(1, "bad" + String.fromCodePoint(0x202e) + "reason" + String.fromCodePoint(0x200b) + "here")]);
    expect(text).toContain("bad reason here");
    expect(text).not.toMatch(/[\u202e\u200b]/);
  });
});
