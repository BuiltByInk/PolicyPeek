import type { Env } from "./index";
import type { ExtractedFacts } from "./extraction";
import { evaluateAutoPublish } from "./autoPublish";
import type { ComplianceStatus } from "./rules";
import { cleanText } from "./textUtil";

// Detail for held-for-review alerts (instant alert + daily digest), added
// 2026-11-18 at Elliot's request: "tool X is held for review" alone is no use.
//
// Read-only. Everything comes from existing columns: pending_checks,
// tools, and (when the optional OUTREACH_DB binding is present) the
// policypeek-outreach tables outreach_contacts / outreach_sends /
// outreach_replies. No schema change, no writes.
//
// SECURITY (18 Nov): OUTREACH_DB may be referenced ONLY in this file, only
// via fixed SELECT string literals (bound parameters only), and never from a
// fetch/HTTP route path. Enforced by outreachDbScan.test.ts. Any change that
// touches OUTREACH_DB goes to Security review.
//
// Safety: the policy URL and the quoted clause come from pages anyone can
// submit, so they are cleaned (control/bidi chars stripped), length-capped,
// and HTML-escaped. Policy URLs are shown as text, never as links, so a
// hostile submission cannot put a clickable link in Elliot's inbox. The only
// links are to getpolicypeek.com pages built from a validated domain.

export const SITE = "https://getpolicypeek.com";
export const FOLLOWUP_AFTER_DAYS = 14; // same as the outreach Worker
export const SNIPPET_MAX = 300;
const URL_MAX = 300;
const NOT_RECORDED = "not recorded";

export const VERDICT_LABELS: Record<string, string> = {
  not_compliant: "Trains on your data, no opt-out",
  compliant_with_caveats: "Trains by default, you can opt out",
  unrated: "Policy unclear",
  shared_domain_unverified: "Company-wide policy",
  compliant: "Doesn't train on your data",
  not_ai_tool: "Not an AI tool",
};

export function verdictLabel(status: string | null | undefined): string {
  if (!status) return "No published badge";
  return VERDICT_LABELS[status] ?? status;
}

// ---------------------------------------------------------------- inputs

export interface HeldRow {
  id: number;
  domain: string;
  name?: string | null;
  is_recheck: number;
  source_url: string | null;
  archived_source_url?: string | null;
  sourced_from_archive: number;
  shared_domain: number;
  extracted_facts: string | null;
  extraction_error: string | null;
  created_at: string;
  updated_at: string;
  /** Policy text as fetched; only compared for equality, never shown. */
  raw_fetch?: string | null;
}

export interface ToolRow {
  domain: string;
  name: string;
  compliance_status: string;
  manual_override: number;
  last_checked_at: string | null;
}

export interface OutreachContact {
  id: number;
  tool_domain: string;
  tool_name?: string | null;
  policy_url?: string | null;
  contact_email: string;
  status: string;
  paused_reason: string | null;
  hand_sent_at: string | null;
  resolved_at: string | null;
}
export interface OutreachSend { contact_id: number; kind: string; status: string; sent_at: string | null }
export interface OutreachReply { matched_contact_id: number | null; from_domain: string; received_at: string; classification: string }

export interface OutreachData {
  contacts: OutreachContact[];
  sends: OutreachSend[];
  replies: OutreachReply[];
}

// ---------------------------------------------------------------- model

export type Group = "reply" | "badge_change" | "new_tool" | "policy_changed" | "none";

export const GROUP_TITLES: Record<Exclude<Group, "none">, string> = {
  reply: "Clarification reply received",
  badge_change: "Approve or reject a badge change",
  new_tool: "New tool waiting for its first badge",
  policy_changed: "Policy source or text changed",
};
export const GROUP_ORDER: Array<Exclude<Group, "none">> = ["reply", "badge_change", "new_tool", "policy_changed"];

export interface Clarification {
  contact_email: string;
  status: string;
  paused_reason: string | null;
  sent_at: string | null;
  followup_due: string | null;
  followup_sent_at: string | null;
  reply: { classification: string; received_at: string; from_domain: string } | null;
}

export interface HeldItem {
  check_id: number;
  domain: string;
  tool_name: string;
  page_url: string | null; // null when the tool has no published page yet
  policy_url: string | null;
  policy_host: string | null;
  archived_url: string | null;
  archived_host: string | null;
  checked_at: string;
  why_held: string;
  policy_says: string;
  snippet: string | null;
  current_verdict: string | null;
  proposed_verdict: string | null;
  clarification: Clarification | null;
  action: string;
  group: Group;
  /** Why this row needs nothing, when group === "none". */
  noise?: "older_duplicate" | "already_confirmed" | "unchanged_repeat" | "verdict_unchanged" | "awaiting_reply";
  duplicates: number; // older held checks of the same tool folded into this one
}

// ---------------------------------------------------------------- helpers

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function toolPageUrl(domain: string): string | null {
  const d = domain.toLowerCase();
  return DOMAIN_RE.test(d) ? `${SITE}/tools/${d}/` : null;
}

export function safeUrlText(u: string | null | undefined): string | null {
  const c = cleanText(u, URL_MAX, { ellipsis: true });
  if (!c) return null;
  try {
    const p = new URL(c);
    if (p.protocol !== "https:" && p.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return c;
}

/** Parsed hostname (punycode / ASCII form, as WHATWG URL gives it), or null. */
export function hostOf(u: string | null | undefined): string | null {
  const c = cleanText(u, 4000);
  if (!c) return null;
  try {
    const p = new URL(c);
    if (p.protocol !== "https:" && p.protocol !== "http:") return null;
    return p.hostname || null;
  } catch {
    return null;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const UK_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const UK_DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });

/** "18 Nov 2026, 04:01 UK time"; date-only values render as a date. */
export function ukTime(iso: string | null | undefined): string {
  if (!iso) return NOT_RECORDED;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return NOT_RECORDED;
  return dateOnly ? UK_DAY.format(d) : `${UK_FMT.format(d)} UK time`;
}

export function addDays(iso: string, days: number): string | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return dateOnly ? d.toISOString().slice(0, 10) : d.toISOString();
}

function parseFacts(json: string | null): ExtractedFacts | null {
  if (!json) return null;
  try {
    // Stored facts were sanitised at extraction; re-check the shape here
    // without importing extraction.ts (keeps this module free of the model client).
    const o = JSON.parse(json) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
    return {
      trains_on_user_data: bool(o.trains_on_user_data),
      opt_out_available: bool(o.opt_out_available),
      gdpr_mentioned: bool(o.gdpr_mentioned),
      data_retention: cleanText(o.data_retention, 300),
      relevant_clauses: (Array.isArray(o.relevant_clauses) ? o.relevant_clauses : [])
        .map((c) => cleanText(c, 500))
        .filter((c): c is string => c !== null)
        .slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** Plain-English hold reason from the stored note or the recomputed decision. */
export function plainReason(storedNote: string | null, decisionReason: string | null): string {
  const note = storedNote?.startsWith("queued_for_review") ? storedNote.replace(/^queued_for_review:\s*/, "") : null;
  if (note) {
    if (/batch submission/.test(note)) return "First-time domain from a batch submission, so it always gets a person's look.";
    return `${cleanText(note.replace(/\s*--\s*never auto-published\s*$/, ""), 240, { ellipsis: true }) ?? "Flagged for review"}. Flagged checks are never published automatically.`;
  }
  if (storedNote?.startsWith("auto_publish_raced")) return "Another update changed this entry at the same moment, so it was queued instead of publishing.";
  if (storedNote?.startsWith("auto_publish_failed")) return "Publishing failed during the check, so it was queued for a person.";
  const r = decisionReason ?? "";
  if (r.includes("manual_override")) return "This entry was checked by hand, so automatic rechecks never overwrite it.";
  if (r.includes("Wayback")) return "The live page blocks automated checks, so the text came from a Wayback Machine snapshot.";
  if (r.includes("brand-new domain")) return "First check of this domain gave a favourable result. A person confirms it before a green or teal badge goes live.";
  if (r.includes("trains_on_user_data is null")) return "The policy doesn't clearly say whether user data is used to train AI models.";
  if (r.includes("opt_out_available is null")) return "The policy says user data is used for training but doesn't say whether you can opt out.";
  if (r.includes("recheck verdict changed")) return "The recheck gives a different result from the published badge.";
  return cleanText(r, 240, { ellipsis: true }) ?? NOT_RECORDED;
}

export function policySays(facts: ExtractedFacts | null): string {
  if (!facts) return "Facts not recorded for this check.";
  const parts: string[] = [];
  if (facts.trains_on_user_data === true) parts.push("says user data is used to train AI models");
  else if (facts.trains_on_user_data === false) parts.push("says user data is not used to train AI models");
  else parts.push("is silent or unclear on whether user data trains AI models");
  if (facts.trains_on_user_data === true) {
    if (facts.opt_out_available === true) parts.push("says you can opt out");
    else if (facts.opt_out_available === false) parts.push("says there is no opt-out");
    else parts.push("is silent on an opt-out");
  }
  return `The policy ${parts.join(", and ")}.`;
}

// ---------------------------------------------------------------- build

export function clarificationFor(domain: string, outreach: OutreachData | null): Clarification | null {
  if (!outreach) return null;
  const c = outreach.contacts.find((x) => x.tool_domain.toLowerCase() === domain.toLowerCase());
  if (!c) return null;
  const sends = outreach.sends.filter((s) => s.contact_id === c.id && s.status === "sent" && s.sent_at);
  const initial = sends.find((s) => s.kind === "initial")?.sent_at ?? c.hand_sent_at ?? null;
  const followup = sends.find((s) => s.kind === "followup")?.sent_at ?? null;
  const replies = outreach.replies
    .filter((r) => r.matched_contact_id === c.id && (r.classification === "reply" || r.classification === "objection"))
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const r = replies[0];
  return {
    contact_email: cleanText(c.contact_email, 200) ?? NOT_RECORDED,
    status: c.status,
    paused_reason: cleanText(c.paused_reason, 200),
    sent_at: initial,
    // No follow-up goes out once a reply or objection is in.
    followup_due: initial && !followup && !replies.length ? addDays(initial, FOLLOWUP_AFTER_DAYS) : null,
    followup_sent_at: followup,
    reply: r ? { classification: r.classification, received_at: r.received_at, from_domain: cleanText(r.from_domain, 200) ?? "" } : null,
  };
}

/**
 * Turns every held row into a HeldItem, groups by what Elliot has to do, and
 * marks noise: older duplicate checks of the same tool, checks the published
 * entry was already re-confirmed after, repeats with identical policy text and
 * the same verdict, and items waiting on a clarification reply.
 */
export function buildHeldItems(rows: HeldRow[], tools: ToolRow[], outreach: OutreachData | null): HeldItem[] {
  const toolBy = new Map(tools.map((t) => [t.domain.toLowerCase(), t]));
  const byDomain = new Map<string, HeldRow[]>();
  for (const r of rows) {
    const k = r.domain.toLowerCase();
    byDomain.set(k, [...(byDomain.get(k) ?? []), r]);
  }
  const items: HeldItem[] = [];
  for (const [domain, list] of byDomain) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    const tool = toolBy.get(domain) ?? null;
    list.forEach((row, i) => {
      const latest = i === list.length - 1;
      const prev = i > 0 ? list[i - 1] : null;
      items.push(buildOne(row, tool, outreach, { latest, prev, olderCount: latest ? list.length - 1 : 0 }));
    });
  }
  // A clarification reply for a tool with no check in the queue (held-tracker
  // tools that were never submitted) still needs Elliot, so it is listed too.
  for (const c of outreach?.contacts ?? []) {
    const d = c.tool_domain.toLowerCase();
    if (byDomain.has(d) || c.status === "resolved") continue;
    const clar = clarificationFor(d, outreach);
    if (!clar?.reply) continue;
    const tool = toolBy.get(d) ?? null;
    items.push({
      check_id: 0,
      domain: cleanText(c.tool_domain, 200) ?? "(unknown domain)",
      tool_name: cleanText(c.tool_name ?? tool?.name ?? null, 120) ?? cleanText(c.tool_domain, 200) ?? "(unknown tool)",
      page_url: tool ? toolPageUrl(d) : null,
      policy_url: safeUrlText(c.policy_url),
      policy_host: hostOf(c.policy_url),
      archived_url: null,
      archived_host: null,
      checked_at: "",
      why_held: "Not in the check queue. This tool is on the held list while we wait for the company to clarify its policy.",
      policy_says: "Not recorded in the check queue.",
      snippet: null,
      current_verdict: tool?.compliance_status ?? null,
      proposed_verdict: null,
      clarification: clar,
      action: replyAction(clar.reply),
      group: "reply",
      duplicates: 0,
    });
  }
  return items;
}

function replyAction(r: NonNullable<Clarification["reply"]>): string {
  return r.classification === "objection"
    ? `Read the objection from ${r.from_domain} in your inbox (received ${ukTime(r.received_at)}). They asked us to stop contacting them; decide what the listing should say.`
    : `Read the reply from ${r.from_domain} in your inbox (received ${ukTime(r.received_at)}) and decide the badge.`;
}

function buildOne(
  row: HeldRow,
  tool: ToolRow | null,
  outreach: OutreachData | null,
  ctx: { latest: boolean; prev: HeldRow | null; olderCount: number }
): HeldItem {
  const facts = parseFacts(row.extracted_facts);
  const current = (tool?.compliance_status ?? null) as ComplianceStatus | null;
  const decision = facts
    ? evaluateAutoPublish(facts, {
        sharedDomain: row.shared_domain === 1,
        isRecheck: tool !== null,
        existingStatus: current ?? undefined,
        sourcedFromArchive: row.sourced_from_archive === 1,
        manualOverride: tool?.manual_override === 1,
      })
    : null;
  const proposed = decision?.verdict ?? null;
  const hostFlag = !!row.extraction_error?.startsWith("queued_for_review") && /host|domain/.test(row.extraction_error ?? "");
  const textChanged = !!ctx.prev && row.raw_fetch != null && ctx.prev.raw_fetch != null && row.raw_fetch !== ctx.prev.raw_fetch;
  const textSame = !!ctx.prev && row.raw_fetch != null && row.raw_fetch === ctx.prev.raw_fetch;
  const clar = clarificationFor(row.domain, outreach);
  const name = cleanText(tool?.name ?? row.name ?? null, 120) ?? cleanText(row.domain, 200) ?? "(unknown tool)";
  const newReply = clar?.reply && clar.status !== "resolved" ? clar.reply : null;
  const waitingReply = !!clar && !newReply && (clar.status === "sent_by_hand" || (clar.status !== "resolved" && !!clar.sent_at));
  const confirmedAfter = !!tool?.last_checked_at && tool.last_checked_at > row.created_at;

  let group: Group;
  let noise: HeldItem["noise"];
  let action: string;
  const verdictChanges = proposed !== null && current !== null && proposed !== current;
  if (!ctx.latest) {
    group = "none"; noise = "older_duplicate";
    action = "Nothing needed. A newer check of this tool is in the queue.";
  } else if (confirmedAfter && !newReply) {
    group = "none"; noise = "already_confirmed";
    action = `Nothing needed. The published entry was confirmed on ${ukTime(tool!.last_checked_at)}, after this check ran.`;
  } else if (newReply) {
    group = "reply";
    action = replyAction(newReply);
  } else if (waitingReply) {
    group = "none"; noise = "awaiting_reply";
    action = clar!.followup_due
      ? `Nothing needed yet. Waiting for a reply to the clarification email; follow-up due ${ukTime(clar!.followup_due)}.`
      : "Nothing needed yet. Waiting for a reply to the clarification email.";
  } else if (verdictChanges) {
    group = "badge_change";
    action = tool?.manual_override === 1
      ? `Your hand-checked badge is "${verdictLabel(current)}" but this recheck reads "${verdictLabel(proposed)}". Usually reject it (keep your badge) unless the policy really changed; approve only if it did.`
      : `Approve or reject the change from "${verdictLabel(current)}" to "${verdictLabel(proposed)}" in the review queue.`;
  } else if (!tool) {
    group = "new_tool";
    action = proposed
      ? `Approve or reject the first badge ("${verdictLabel(proposed)}") in the review queue.`
      : "Review this check in the review queue; no badge could be worked out.";
  } else if (hostFlag || textChanged) {
    group = "policy_changed";
    action = hostFlag
      ? `Confirm the new source page is the right policy. The badge would stay "${verdictLabel(current)}".`
      : `Optional: the policy text changed since the last held check, but the badge would stay "${verdictLabel(current)}". Approve to refresh the check date, or reject.`;
  } else {
    group = "none"; noise = textSame ? "unchanged_repeat" : "verdict_unchanged";
    action = `Nothing needed. The badge would stay "${verdictLabel(current)}".`;
  }

  return {
    check_id: row.id,
    domain: cleanText(row.domain, 200) ?? "(unknown domain)",
    tool_name: name,
    page_url: tool ? toolPageUrl(row.domain) : null,
    policy_url: safeUrlText(row.source_url),
    policy_host: hostOf(row.source_url),
    archived_url: row.sourced_from_archive === 1 ? safeUrlText(row.archived_source_url) : null,
    archived_host: row.sourced_from_archive === 1 ? hostOf(row.archived_source_url) : null,
    checked_at: row.updated_at || row.created_at,
    why_held: plainReason(row.extraction_error, decision?.reason ?? null),
    policy_says: policySays(facts),
    snippet: cleanText(facts?.relevant_clauses?.[0] ?? null, SNIPPET_MAX, { ellipsis: true }),
    current_verdict: current,
    proposed_verdict: proposed,
    clarification: clar,
    action,
    group,
    noise,
    duplicates: ctx.olderCount,
  };
}

// ---------------------------------------------------------------- render

/** true = outreach data read; false = binding missing or read failed; "digest" = deliberately not read (request-triggered alert). */
export type OutreachMode = boolean | "digest";

function clarLines(c: Clarification | null, outreachAvailable: OutreachMode): string[] {
  if (outreachAvailable === "digest") return ["Clarification email: shown in the daily digest"];
  if (!outreachAvailable) return ["Clarification email: not available (outreach data not connected)"];
  if (!c) return ["Clarification email: none on record"];
  const status = c.paused_reason ? `${c.status} (${c.paused_reason})` : c.status;
  const reply = c.reply ? `${c.reply.classification} from ${c.reply.from_domain}, ${ukTime(c.reply.received_at)}` : "none recorded";
  return [
    `Clarification email: ${c.contact_email}, status ${status}`,
    `  Sent: ${c.sent_at ? ukTime(c.sent_at) : "not sent"}`,
    `  Follow-up: ${c.followup_sent_at ? `sent ${ukTime(c.followup_sent_at)}` : c.followup_due ? `due ${ukTime(c.followup_due)}` : c.reply ? "not needed (reply received)" : "not scheduled"}`,
    `  Reply: ${reply}`,
  ];
}

function title(it: HeldItem): string {
  return it.tool_name === it.domain ? it.tool_name : `${it.tool_name} (${it.domain})`;
}

export function renderItemText(it: HeldItem, outreachAvailable: OutreachMode): string {
  const lines = [
    `${title(it)} - ${it.check_id ? `check #${it.check_id}` : "no check in queue"}${it.duplicates ? ` (+${it.duplicates} older check${it.duplicates === 1 ? "" : "s"} of the same tool)` : ""}`,
    `PolicyPeek page: ${it.page_url ?? "none yet (not published)"}`,
    `Policy checked: ${it.policy_url ?? NOT_RECORDED}`,
    `Policy host: ${it.policy_host ?? NOT_RECORDED}`,
    ...(it.archived_url ? [`Read from snapshot: ${it.archived_url}`, `Snapshot host: ${it.archived_host ?? NOT_RECORDED}`] : []),
    `Checked: ${ukTime(it.checked_at || null)}`,
    `Why held: ${it.why_held}`,
    `What the policy says: ${it.policy_says}`,
    ...(it.snippet ? [`Quote: "${it.snippet}"`] : []),
    `Current verdict: ${verdictLabel(it.current_verdict)}`,
    `Proposed verdict: ${it.proposed_verdict ? verdictLabel(it.proposed_verdict) : NOT_RECORDED}`,
    ...clarLines(it.clarification, outreachAvailable),
    `What you need to do: ${it.action}`,
  ];
  return lines.join("\n");
}

export function renderItemHtml(it: HeldItem, outreachAvailable: OutreachMode): string {
  const e = escapeHtml;
  const row = (k: string, v: string) => `<tr><td style="padding:2px 12px 2px 0;color:#555;vertical-align:top;white-space:nowrap">${e(k)}</td><td style="padding:2px 0">${v}</td></tr>`;
  const page = it.page_url ? `<a href="${e(it.page_url)}">${e(it.page_url)}</a>` : "none yet (not published)";
  const c = clarLines(it.clarification, outreachAvailable).map((l) => e(l.trim())).join("<br>");
  return [
    `<div style="border:1px solid #ddd;border-radius:6px;padding:12px;margin:0 0 12px">`,
    `<div style="font-weight:600;font-size:15px">${e(it.tool_name)} <span style="color:#777;font-weight:400">${it.tool_name === it.domain ? "" : `(${e(it.domain)}) `}&middot; ${it.check_id ? `check #${it.check_id}` : "no check in queue"}${it.duplicates ? ` &middot; +${it.duplicates} older` : ""}</span></div>`,
    `<p style="margin:8px 0;padding:8px;background:#f6f6f6;border-radius:4px"><strong>What you need to do:</strong> ${e(it.action)}</p>`,
    `<table style="border-collapse:collapse;font-size:13px">`,
    row("PolicyPeek page", page),
    // Policy URL is text, never a link (it comes from a submitted page).
    row("Policy checked", e(it.policy_url ?? NOT_RECORDED)),
    row("Policy host", `<strong>${e(it.policy_host ?? NOT_RECORDED)}</strong>`),
    ...(it.archived_url ? [row("Read from snapshot", e(it.archived_url)), row("Snapshot host", `<strong>${e(it.archived_host ?? NOT_RECORDED)}</strong>`)] : []),
    row("Checked", e(ukTime(it.checked_at || null))),
    row("Why held", e(it.why_held)),
    row("Policy says", e(it.policy_says)),
    ...(it.snippet ? [row("Quote", `<blockquote style="margin:0;padding-left:8px;border-left:3px solid #ccc">${e(it.snippet)}</blockquote>`)] : []),
    row("Current verdict", e(verdictLabel(it.current_verdict))),
    row("Proposed verdict", e(it.proposed_verdict ? verdictLabel(it.proposed_verdict) : NOT_RECORDED)),
    row("Clarification", c),
    `</table></div>`,
  ].join("\n");
}

function htmlDoc(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222;max-width:720px;margin:0 auto;padding:16px">${body}</body></html>`;
}

export interface RenderedEmail { subject: string; text: string; html: string }

/** Instant alert for one newly held check. */
export function renderHeldAlert(it: HeldItem, outreachAvailable: OutreachMode): RenderedEmail {
  const subject = `PolicyPeek: ${it.tool_name} held for review`.slice(0, 200);
  const text = [subject, "", renderItemText(it, outreachAvailable), "", footerText()].join("\n");
  const html = htmlDoc(subject, `<h2 style="font-size:18px">${escapeHtml(subject)}</h2>${renderItemHtml(it, outreachAvailable)}${footerHtml()}`);
  return { subject, text, html };
}

function footerText(): string {
  return "Review queue (admin sign-in needed): https://api.getpolicypeek.com/v1/admin/pending\nThis is an automatic notice. No badge has been changed.";
}
function footerHtml(): string {
  return `<p style="color:#777;font-size:12px">Review queue (admin sign-in needed): <a href="https://api.getpolicypeek.com/v1/admin/pending">api.getpolicypeek.com/v1/admin/pending</a><br>This is an automatic notice. No badge has been changed.</p>`;
}

export const DIGEST_ITEM_LIMIT = 15;

export interface DigestSummary {
  total: number;
  needs_you: number;
  by_group: Record<Group, number>;
  by_noise: Record<string, number>;
}

export function summarise(items: HeldItem[]): DigestSummary {
  const by_group = { reply: 0, badge_change: 0, new_tool: 0, policy_changed: 0, none: 0 } as Record<Group, number>;
  const by_noise: Record<string, number> = {};
  for (const it of items) {
    by_group[it.group] += 1;
    if (it.noise) by_noise[it.noise] = (by_noise[it.noise] ?? 0) + 1;
  }
  return { total: items.length, needs_you: items.length - by_group.none, by_group, by_noise };
}

/**
 * Daily digest grouped by action. Returns null when nothing needs Elliot, so
 * the sender skips the email entirely. Items needing nothing collapse to one
 * count line.
 */
export function renderDigest(items: HeldItem[], outreachAvailable: OutreachMode): RenderedEmail | null {
  const action = items.filter((i) => i.group !== "none");
  if (action.length === 0) return null;
  const s = summarise(items);
  const subject = `PolicyPeek: ${action.length} item${action.length === 1 ? "" : "s"} need${action.length === 1 ? "s" : ""} you`;
  const text: string[] = [subject, ""];
  const html: string[] = [`<h2 style="font-size:18px">${escapeHtml(subject)}</h2>`];
  let shown = 0;
  for (const g of GROUP_ORDER) {
    const list = action.filter((i) => i.group === g).sort((a, b) => b.checked_at.localeCompare(a.checked_at) || b.check_id - a.check_id);
    if (!list.length) continue;
    text.push(`== ${GROUP_TITLES[g]} (${list.length}) ==`, "");
    html.push(`<h3 style="font-size:16px;margin:20px 0 8px">${escapeHtml(GROUP_TITLES[g])} (${list.length})</h3>`);
    for (const it of list) {
      if (shown >= DIGEST_ITEM_LIMIT) break;
      text.push(renderItemText(it, outreachAvailable), "");
      html.push(renderItemHtml(it, outreachAvailable));
      shown += 1;
    }
  }
  if (action.length > shown) {
    text.push(`...and ${action.length - shown} more in the review queue.`, "");
    html.push(`<p>...and ${action.length - shown} more in the review queue.</p>`);
  }
  const quiet = s.by_group.none;
  if (quiet > 0) {
    const line = `Also in the queue, needing nothing from you: ${quiet} (older duplicate checks, entries already confirmed, unchanged repeats, or waiting on a reply).`;
    text.push(line, "");
    html.push(`<p style="color:#555">${escapeHtml(line)}</p>`);
  }
  text.push(footerText());
  html.push(footerHtml());
  return { subject, text: text.join("\n"), html: htmlDoc(subject, html.join("\n")) };
}

// ---------------------------------------------------------------- load (read-only)

const HELD_SQL = `SELECT id, domain, name, is_recheck, source_url, archived_source_url, sourced_from_archive, shared_domain,
  extracted_facts, extraction_error, created_at, updated_at, raw_fetch
  FROM pending_checks WHERE status = 'extracted'`;

export async function loadOutreach(env: Env): Promise<OutreachData | null> {
  if (!env.OUTREACH_DB) return null;
  try {
    const [c, s, r] = await Promise.all([
      env.OUTREACH_DB.prepare(
        "SELECT id, tool_domain, tool_name, policy_url, contact_email, status, paused_reason, hand_sent_at, resolved_at FROM outreach_contacts"
      ).all<OutreachContact>(),
      env.OUTREACH_DB.prepare("SELECT contact_id, kind, status, sent_at FROM outreach_sends WHERE status = 'sent'").all<OutreachSend>(),
      env.OUTREACH_DB.prepare(
        "SELECT matched_contact_id, from_domain, received_at, classification FROM outreach_replies WHERE classification IN ('reply','objection')"
      ).all<OutreachReply>(),
    ]);
    return { contacts: c.results, sends: s.results, replies: r.results };
  } catch {
    console.warn("[alert] outreach status read failed; alert sent without it");
    return null;
  }
}

/**
 * Loads held items, optionally for one domain only. Read-only.
 * withOutreach=false skips OUTREACH_DB entirely: used when the alert was
 * triggered by a public HTTP request (Security, 18 Nov: no fetch/route path
 * may touch OUTREACH_DB). Only the scheduled recheck and the digest read it.
 */
export async function loadHeldItems(
  env: Env,
  domain?: string,
  { withOutreach = true }: { withOutreach?: boolean } = {}
): Promise<{ items: HeldItem[]; outreachAvailable: OutreachMode }> {
  const held = domain
    ? await env.DB.prepare(`${HELD_SQL} AND domain = ?`).bind(domain).all<HeldRow>()
    : await env.DB.prepare(HELD_SQL).all<HeldRow>();
  const tools = await env.DB.prepare(
    `SELECT domain, name, compliance_status, manual_override, last_checked_at FROM tools
     WHERE domain IN (SELECT domain FROM pending_checks WHERE status = 'extracted')`
  ).all<ToolRow>();
  if (!withOutreach) return { items: buildHeldItems(held.results, tools.results, null), outreachAvailable: "digest" };
  const outreach = await loadOutreach(env);
  return { items: buildHeldItems(held.results, tools.results, outreach), outreachAvailable: outreach !== null };
}
