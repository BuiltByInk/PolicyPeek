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

export interface LiveTool { domain: string; name: string; source_urls: string }

export interface ContactOut {
  tool_slug: string; tool_name: string; tool_domain: string; kind: "held" | "ambiguous_live";
  contact_email: string; role: Role; contact_source_url: string; policy_url: string; policy_label: string;
  question_text: string; status: "eligible" | "already_contacted" | "paused"; hand_sent_at: string | null;
}
export interface Skipped { tool: string; contact: string; kind: string; reason: string }
export interface CardGateOut { tool_slug: string; flagged: 0 | 1; flag_source: string }

export interface LoadResult {
  contacts: ContactOut[]; skipped: Skipped[]; cardGate: CardGateOut[];
  counts: { totalHeld: number; alreadySentByHand: number; eligibleHeld: number; missingContact: number; droppedVetting: number; unclear: number; ambiguousRows: number; ambiguousLoadedPaused: number };
}

// "Sent by hand" only if the tracker says so explicitly. Anything other than
// drafted / sent is unclear => skipped and listed (11:16 UK rule).
function handStatus(row: Record<string, string>): "sent" | "not_sent" | "unclear" {
  const s = (row.status ?? "").toLowerCase();
  if (s === "sent" || s.startsWith("sent ") || s === "replied") return "sent";
  if (s === "drafted" && !row.reply) return "not_sent";
  return "unclear";
}

export function buildLoad(input: {
  tracker: Record<string, string>[];
  heldPack: Map<string, HeldDraft>;
  liveTools: LiveTool[];
  flagCsv: Record<string, string>[] | null; // null = flag file missing => everything fails closed
  vettedBy: string;
}): LoadResult {
  const contacts: ContactOut[] = [];
  const skipped: Skipped[] = [];
  const seen = new Set<string>();
  const counts = { totalHeld: input.tracker.length, alreadySentByHand: 0, eligibleHeld: 0, missingContact: 0, droppedVetting: 0, unclear: 0, ambiguousRows: input.flagCsv?.length ?? 0, ambiguousLoadedPaused: 0 };
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
    if (hand === "unclear") {
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
    const status = hand === "sent" ? "already_contacted" : kind === "ambiguous_live" ? "paused" : "eligible";
    if (kind === "held") { if (status === "already_contacted") counts.alreadySentByHand++; else counts.eligibleHeld++; }
    else counts.ambiguousLoadedPaused++;
    contacts.push({ tool_slug: toolDomain, tool_name: toolName, tool_domain: toolDomain, kind, contact_email: contact, role: v.role, contact_source_url: sourceUrl, policy_url: policyUrl, policy_label: label, question_text: context, status, hand_sent_at: null });
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
    const context = live && policyUrl.startsWith("https://") ? `We reviewed the policy page our ${live.name} listing relies on, and we'd like to make sure we've read it correctly before we re-check our summary.` : "";
    consider("ambiguous_live", r.tool, r.contact, r.contact_source_url, live?.domain ?? null, policyUrl, "Policy page cited on our listing", context, "not_sent");
  }

  // Card gate: only live tools the audit covered can be flagged=0. A missing
  // flag file, an unmatched name or a non-live (held) tool gets no flagged=0
  // row, so the send path treats it as flagged (fail closed).
  const cardGate: CardGateOut[] = [];
  if (input.flagCsv) {
    const flaggedNames = new Set(input.flagCsv.map((r) => r.tool.toLowerCase()));
    for (const t of input.liveTools) cardGate.push({ tool_slug: t.domain, flagged: flaggedNames.has(t.name.toLowerCase()) ? 1 : 0, flag_source: "ambiguous-cards-2026-11-10.csv" });
  }
  for (const c of contacts) if (!cardGate.some((g) => g.tool_slug === c.tool_slug)) cardGate.push({ tool_slug: c.tool_slug, flagged: 1, flag_source: input.flagCsv ? "not_in_audit (fail closed)" : "flag_file_missing (fail closed)" });
  return { contacts, skipped, cardGate, counts };
}

const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);

export function toSql(r: LoadResult, vettedBy: string, vettedAt: string): string {
  const lines = ["-- Generated by scripts/build-contacts-sql.ts. Review before applying. Never sets card_confirmed."];
  for (const c of r.contacts)
    lines.push(`INSERT OR IGNORE INTO outreach_contacts (tool_slug, tool_name, tool_domain, kind, contact_email, role, contact_source_url, policy_url, policy_label, question_text, vetted_by, vetted_at, status, hand_sent_at) VALUES (${[c.tool_slug, c.tool_name, c.tool_domain, c.kind, c.contact_email, c.role, c.contact_source_url, c.policy_url, c.policy_label, c.question_text, vettedBy, vettedAt, c.status, c.hand_sent_at].map(q).join(", ")});`);
  for (const g of r.cardGate)
    lines.push(`INSERT INTO card_gate (tool_slug, flagged, flag_source) VALUES (${q(g.tool_slug)}, ${g.flagged}, ${q(g.flag_source)}) ON CONFLICT (tool_slug) DO UPDATE SET flagged = MAX(card_gate.flagged, excluded.flagged), flag_source = excluded.flag_source;`);
  return lines.join("\n") + "\n";
}
