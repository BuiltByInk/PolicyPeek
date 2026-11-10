// Gate 2 loader (offline, run on the box): turns the tracker/research files
// into a SQL file for the outreach D1 database. The Worker never reads these
// files; D1 is the source of truth. Nothing here sets card_confirmed.
import { registrable, vetContact, type Role } from "./contacts.ts";

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

export interface HeldDraft { toolName: string; to: string; policyLabel: string; contactSource: string; context: string }

// Reads the paste-ready held-outreach pack: per tool, the "Policy reviewed"
// label, the contact source, and the "We reviewed ..." paragraph(s) of the body.
export function parseHeldPack(md: string): Map<string, HeldDraft> {
  const out = new Map<string, HeldDraft>();
  const sections = md.split(/^### \d+\. /m).slice(1);
  for (const sec of sections) {
    const toolName = sec.split("\n")[0].trim();
    const label = sec.match(/\*\*Policy reviewed:\*\* (.+)/)?.[1]?.trim() ?? "";
    const source = sec.match(/\*\*Contact source:\*\* (\S+)/)?.[1]?.trim() ?? "";
    const to = sec.match(/\*\*To:\*\* `([^`]+)`/)?.[1]?.trim() ?? "";
    const body = sec.match(/```\n([\s\S]*?)\n```/)?.[1] ?? "";
    const start = body.indexOf("We reviewed");
    const end = body.indexOf("Please could you confirm");
    const context = start >= 0 && end > start ? body.slice(start, end).trim() : "";
    out.set(toolName.toLowerCase(), { toolName, to, policyLabel: label, contactSource: source, context });
  }
  return out;
}

export interface RecheckEntry { name: string; slug: string; proposed: string; emailNeeded: string; quote: string; source: string }

// research/recheck-2026-11-10.md: the Summary table gives each tool's proposed
// verdict and whether an email is still needed; the per-tool notes give the
// vendor quote and its source (used as the ambiguous_live context paragraph).
export function parseRecheck(md: string): Map<string, RecheckEntry> {
  const out = new Map<string, RecheckEntry>();
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*\d+\s*\|\s*(.+?)\s*\(([^)]+)\)\s*\|\s*[^|]*\|\s*([^|]*)\|\s*([^|]*)\|\s*$/);
    if (!m) continue;
    out.set(m[2].trim().toLowerCase(), { name: m[1].trim(), slug: m[2].trim().toLowerCase(), proposed: m[3].trim(), emailNeeded: m[4].trim(), quote: "", source: "" });
  }
  for (const sec of md.split(/^### \d+\. /m).slice(1)) {
    const slug = sec.split("\n")[0].match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
    const e = slug ? out.get(slug) : undefined;
    if (!e) continue;
    e.quote = sec.match(/^> (.+)$/m)?.[1]?.trim() ?? "";
    e.source = sec.match(/^Source: (https:\/\/\S+?)(?: —|\s|$)/m)?.[1]?.trim() ?? "";
  }
  return out;
}

export function proposesHeld(e: RecheckEntry): boolean {
  return /^\*\*held\*\*/i.test(e.proposed);
}
export function researchSaysNoEmail(e: RecheckEntry): boolean {
  return /^no\b/i.test(e.emailNeeded);
}

export interface LiveTool { domain: string; name: string; source_urls: string }

// Known hand-sent emails (Elliot, via Jump 11:37 UK). Matched on the contact's
// registrable domain or the tool slug, any listed variant.
export const HAND_SENT: { domains: string[]; date: string; source: string }[] = [
  { domains: ["zerodeposit.com", "zerodeposit.co.uk"], date: "2026-11-10", source: "Elliot, by hand" },
];
// Suppress these domains too, so nothing automatic ever goes to them.
export function handSentFor(toolSlug: string, email: string, list = HAND_SENT) {
  const d = registrable(email.split("@").pop() ?? "") ?? "";
  return list.find((h) => h.domains.includes(toolSlug) || h.domains.includes(d)) ?? null;
}

export interface ContactOut {
  tool_slug: string; tool_name: string; tool_domain: string; kind: "held" | "ambiguous_live";
  contact_email: string; role: Role; contact_source_url: string; policy_url: string; policy_label: string;
  question_text: string; status: "eligible" | "sent_by_hand" | "paused"; paused_reason: string | null; hand_sent_at: string | null; hand_sent_source: string | null;
}
export interface Skipped { tool: string; contact: string; kind: string; reason: string }
export interface CardGateOut { tool_slug: string; flagged: 0 | 1; passes: 0 | 1; gate_reason: string; flag_source: string }

export interface LoadResult {
  contacts: ContactOut[]; skipped: Skipped[]; cardGate: CardGateOut[];
  counts: { totalHeld: number; alreadySentByHand: number; heldLoadedPaused: number; missingContact: number; droppedVetting: number; unclear: number; ambiguousRows: number; ambiguousLoadedPaused: number };
}

// "Sent by hand" only if the tracker says so explicitly. Anything other than
// drafted / sent is unclear => skipped and listed (11:16 UK rule).
function handStatus(row: Record<string, string>): "sent" | "not_sent" | "unclear" {
  const s = (row.status ?? "").toLowerCase();
  if (s === "sent" || s === "sent_by_hand" || s.startsWith("sent ") || s === "replied") return "sent";
  if (s === "drafted" && !row.reply) return "not_sent";
  return "unclear";
}

export function buildLoad(input: {
  tracker: Record<string, string>[];
  heldPack: Map<string, HeldDraft>;
  liveTools: LiveTool[];
  flagCsv: Record<string, string>[] | null; // null = flag file missing => everything fails closed
  recheck: Map<string, RecheckEntry> | null; // null = recheck file missing => everything fails closed
  vettedBy: string;
  handSent?: typeof HAND_SENT;
}): LoadResult {
  const contacts: ContactOut[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  const counts = { totalHeld: input.tracker.length, alreadySentByHand: 0, heldLoadedPaused: 0, missingContact: 0, droppedVetting: 0, unclear: 0, ambiguousRows: input.flagCsv?.length ?? 0, ambiguousLoadedPaused: 0 };
  const liveByName = new Map(input.liveTools.map((t) => [t.name.toLowerCase(), t]));

  const consider = (kind: "held" | "ambiguous_live", toolName: string, contact: string, sourceUrl: string, slugHint: string | null, policyUrl: string, label: string, context: string, hand: "sent" | "not_sent" | "unclear") => {
    if (!contact || /^(form only|none found)/i.test(contact)) {
      counts.missingContact += kind === "held" ? 1 : 0;
      skipped.push({ tool: toolName, contact, kind, reason: /^form only/i.test(contact) ? "form_only (hand route, never parsed)" : "no_role_contact" });
      return;
    }
    const toolDomain = slugHint ?? registrable(new URL(sourceUrl).hostname) ?? "";
    const v = vetContact({ contactEmail: contact, toolDomain, contactSourceUrl: sourceUrl });
    if (!v.ok) {
      counts.droppedVetting++;
      skipped.push({ tool: toolName, contact, kind, reason: v.reason });
      return;
    }
    if (hand === "unclear" && !handSentFor(toolDomain, contact, input.handSent ?? HAND_SENT)) {
      counts.unclear++;
      skipped.push({ tool: toolName, contact, kind, reason: "tracker_status_unclear" });
      return;
    }
    const key = `${toolDomain}|${contact.toLowerCase()}`;
    if (seen.has(key)) {
      skipped.push({ tool: toolName, contact, kind, reason: "duplicate_of_earlier_row" });
      return;
    }
    if (!context) {
      skipped.push({ tool: toolName, contact, kind, reason: "no_context_paragraph" });
      return;
    }
    seen.add(key);
    const hs = handSentFor(toolDomain, contact, input.handSent ?? HAND_SENT);
    let status: ContactOut["status"]; let paused_reason: string | null = null;
    if (hs || hand === "sent") status = "sent_by_hand";
    else if (kind === "ambiguous_live") { status = "paused"; paused_reason = "ambiguous wording needs Elliot's check"; }
    // 11:37 UK: every held contact stays out of the live queue until the list
    // of held tools Elliot emailed by hand arrives.
    else { status = "paused"; paused_reason = "awaiting hand-sent list"; }
    if (kind === "held") { if (status === "sent_by_hand") counts.alreadySentByHand++; else counts.heldLoadedPaused++; }
    else counts.ambiguousLoadedPaused++;
    contacts.push({ tool_slug: toolDomain, tool_name: toolName, tool_domain: toolDomain, kind, contact_email: contact, role: v.role, contact_source_url: sourceUrl, policy_url: policyUrl, policy_label: label, question_text: context, status, paused_reason, hand_sent_at: hs ? hs.date : hand === "sent" ? "unknown" : null, hand_sent_source: hs ? hs.source : hand === "sent" ? "tracker status" : null });
  };

  for (const r of input.tracker) {
    const draft = input.heldPack.get(r.tool.toLowerCase());
    const live = liveByName.get(r.tool.toLowerCase());
    consider("held", r.tool, r.contact, r.contact_source_url, live?.domain ?? null, r.contact_source_url, draft?.policyLabel ?? "", draft?.context ?? "", handStatus(r));
  }
  for (const r of input.flagCsv ?? []) {
    const live = liveByName.get(r.tool.toLowerCase());
    let policyUrl = "";
    try { policyUrl = (JSON.parse(live?.source_urls ?? "[]") as string[])[0] ?? ""; } catch { policyUrl = ""; }
    // Ambiguous rows load PAUSED: their per-tool research questions need
    // Elliot's wording check (the template asks exactly three questions).
    // Context comes from Research's re-check: the vendor's own quoted words and
    // their source page (which then becomes the policy URL in the email).
    const rc = live ? input.recheck?.get(live.domain) : undefined;
    const quote = rc?.quote.replace(/["“”]/g, "'") ?? "";
    const context = rc && quote && rc.source ? `We reviewed ${rc.source}. It says: "${quote}" We'd like to make sure we read this correctly.` : "";
    if (rc?.source) policyUrl = rc.source;
    consider("ambiguous_live", r.tool, r.contact, r.contact_source_url, live?.domain ?? null, policyUrl, "Page cited in our re-check", context, "not_sent");
  }

  // Card gate (11:39 UK). PASS: the tool is held (held tracker), or the
  // re-check proposes held (and doesn't say no email is needed), or it is a
  // live tool the audit did not flag. BLOCK: re-check says no email needed;
  // flagged with a definite non-held proposal; flagged with no proposal;
  // unknown. Either research file missing => everything blocked.
  const cardGate: CardGateOut[] = [];
  const failClosed = !input.flagCsv || !input.recheck;
  const flaggedNames = new Set((input.flagCsv ?? []).map((r) => r.tool.toLowerCase()));
  const heldSlugs = new Set(contacts.filter((c) => c.kind === "held").map((c) => c.tool_slug));
  const slugs = new Set<string>([...input.liveTools.map((t) => t.domain), ...contacts.map((c) => c.tool_slug)]);
  for (const slug of slugs) {
    const live = input.liveTools.find((t) => t.domain === slug);
    const flagged: 0 | 1 = live && input.flagCsv && !flaggedNames.has(live.name.toLowerCase()) ? 0 : 1;
    const rc = input.recheck?.get(slug);
    let passes: 0 | 1 = 0, reason: string;
    if (failClosed) reason = !input.flagCsv ? "blocked: ambiguous-cards CSV missing (fail closed)" : "blocked: recheck file missing (fail closed)";
    else if (rc && researchSaysNoEmail(rc)) reason = `blocked: Research says no email needed (${rc.emailNeeded.slice(0, 60)})`;
    else if (rc && proposesHeld(rc)) { passes = 1; reason = "pass: recheck-2026-11-10 proposes held"; }
    else if (heldSlugs.has(slug) && !rc) { passes = 1; reason = "pass: held tool (held-outreach tracker)"; }
    else if (rc) reason = `blocked: recheck proposes a definite change (${rc.proposed.replace(/\*/g, "").slice(0, 60)})`;
    else if (flagged === 0) { passes = 1; reason = "pass: live card not flagged by the audit"; }
    else if (live) reason = "blocked: flagged in ambiguous-cards audit, no re-check proposal yet";
    else reason = "blocked: unknown tool (fail closed)";
    cardGate.push({ tool_slug: slug, flagged, passes, gate_reason: reason, flag_source: "tracker.csv + recheck-2026-11-10.md + ambiguous-cards-2026-11-10.csv" });
  }
  return { contacts, skipped, cardGate, counts };
}

const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);

export function toSql(r: LoadResult, vettedBy: string, vettedAt: string): string {
  const lines = ["-- Generated by scripts/build-contacts-sql.ts. Review before applying. Never sets card_confirmed."];
  for (const c of r.contacts)
    lines.push(`INSERT OR IGNORE INTO outreach_contacts (tool_slug, tool_name, tool_domain, kind, contact_email, role, contact_source_url, policy_url, policy_label, question_text, vetted_by, vetted_at, status, paused_reason, hand_sent_at, hand_sent_source) VALUES (${[c.tool_slug, c.tool_name, c.tool_domain, c.kind, c.contact_email, c.role, c.contact_source_url, c.policy_url, c.policy_label, c.question_text, vettedBy, vettedAt, c.status, c.paused_reason, c.hand_sent_at, c.hand_sent_source].map(q).join(", ")});`);
  for (const h of HAND_SENT) for (const d of h.domains)
    lines.push(`INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('domain', ${q(d)}, 'manual');`);
  for (const g of r.cardGate)
    lines.push(`INSERT INTO card_gate (tool_slug, flagged, passes, gate_reason, flag_source) VALUES (${q(g.tool_slug)}, ${g.flagged}, ${g.passes}, ${q(g.gate_reason)}, ${q(g.flag_source)}) ON CONFLICT (tool_slug) DO UPDATE SET flagged = excluded.flagged, passes = excluded.passes, gate_reason = excluded.gate_reason, flag_source = excluded.flag_source;`);
  return lines.join("\n") + "\n";
}
