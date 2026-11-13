import { describe, it, expect, vi, afterEach } from "vitest";
import { ALERT_FROM_EMAIL, ALERT_TO, sendAlert, subjectFrom } from "./alert";
import type { Env } from "./index";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("subjectFrom", () => {
  it("uses the first line and strips header-breaking characters", () => {
    expect(subjectFrom("PolicyPeek: new check held for review.\n#144 zerodeposit.com")).toBe(
      "PolicyPeek: new check held for review."
    );
    expect(subjectFrom("Hello\r\nBcc: evildoer@example.com")).toBe("Hello");
    expect(subjectFrom("\n\n")).toBe("PolicyPeek alert");
  });
});

describe("sendAlert", () => {
  it("is a no-op when the binding is missing", async () => {
    expect(await sendAlert({} as Env, "hello")).toBe(false);
  });

  it("sends plain text to the pinned destination and returns true", async () => {
    const send = vi.fn(async (msg: unknown) => ({ messageId: "<m@test>", msg }));
    const ok = await sendAlert({ ALERT_EMAIL: { send } } as unknown as Env, "PolicyPeek: hello\n#1 example.com");
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0] as { from: { email: string; name: string }; to: string; subject: string; text: string };
    expect(msg.to).toBe(ALERT_TO);
    expect(msg.from.email).toBe(ALERT_FROM_EMAIL);
    expect(msg.subject).toBe("PolicyPeek: hello");
    expect(msg.text).toBe("PolicyPeek: hello\n#1 example.com");
  });

  it("returns false and does not throw when send fails, and does not log the body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error("smtp boom: elliotink@pm.me body=SECRET-BODY");
    });
    expect(await sendAlert({ ALERT_EMAIL: { send } } as unknown as Env, "SECRET-BODY")).toBe(false);
    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET-BODY");
    }
  });
});

describe("alert destination", () => {
  it("targets the pinned Proton address from the existing outreach sender", () => {
    expect(ALERT_TO).toBe("elliotink@pm.me");
    expect(ALERT_FROM_EMAIL).toBe("privacy@mail.getpolicypeek.com");
  });
});
