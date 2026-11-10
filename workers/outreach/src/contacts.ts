// Gate 2 (Security review 2026-11-10): who may be emailed. Recipients come only
// from D1 outreach_contacts; this module decides what may be loaded there and
// re-checks every row immediately before a send.
import { getDomain } from "tldts";

export const ROLES = ["privacy", "dpo", "legal", "compliance", "dataprotection", "gdpr", "press"] as const;
export type Role = (typeof ROLES)[number];

// A role mailbox's local part may only be built from these words. Anything
// else (a first name, surname, initials, "support", "hi", "security",
// "feedback") fails, so a published personal address is always rejected.
const ROLE_TOKENS: Record<string, Role> = {
  privacy: "privacy",
  dpo: "dpo",
  legal: "legal",
  compliance: "compliance",
  dataprotection: "dataprotection",
  gdpr: "gdpr",
  press: "press",
};
const MODIFIER_TOKENS = ["data", "protection", "info", "team", "office", "officer", "requests", "request", "dept", "uk", "eu", "global"];
const VOCAB = [...Object.keys(ROLE_TOKENS), ...MODIFIER_TOKENS].sort((a, b) => b.length - a.length);

const WEBMAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "pm.me", "aol.com", "gmx.com", "mail.com", "yandex.com"]);

export type VetResult = { ok: true; role: Role; recipientDomain: string } | { ok: false; reason: string };

function tokenise(local: string): string[] | null {
  const out: string[] = [];
  for (const p of local.toLowerCase().split(/[._+-]+/).filter(Boolean)) {
    let rest = p;
    while (rest.length) {
      const w = VOCAB.find((v) => rest.startsWith(v));
      if (!w) return null;
      out.push(w);
      rest = rest.slice(w.length);
    }
  }
  return out;
}

export function roleOf(localPart: string): Role | null {
  if (!/^[A-Za-z0-9._+-]{2,64}$/.test(localPart)) return null;
  const tokens = tokenise(localPart);
  if (!tokens) return null;
  if (tokens.includes("data") && tokens.includes("protection")) return "dataprotection";
  for (const t of tokens) if (ROLE_TOKENS[t]) return ROLE_TOKENS[t];
  return null;
}

export function registrable(hostOrDomain: string): string | null {
  return getDomain(hostOrDomain.toLowerCase(), { allowPrivateDomains: true }) ?? null;
}

export function httpsHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function domainOfAddress(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? registrable(email.slice(at + 1)) : null;
}

// Role address only, not webmail, and the recipient's registrable domain
// equals the tool's or the contact source page's.
export function vetContact(input: { contactEmail: string; toolDomain: string; contactSourceUrl: string }): VetResult {
  const email = input.contactEmail.trim();
  if (/^form only/i.test(email)) return { ok: false, reason: "form_only" };
  const m = email.match(/^([^@\s]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/);
  if (!m) return { ok: false, reason: "invalid_address" };
  const [, local, domainRaw] = m;
  const recipientDomain = registrable(domainRaw);
  if (!recipientDomain) return { ok: false, reason: "invalid_domain" };
  if (WEBMAIL.has(recipientDomain)) return { ok: false, reason: "webmail" };
  const role = roleOf(local);
  if (!role) return { ok: false, reason: "not_a_role_address" };
  const sourceHost = httpsHost(input.contactSourceUrl);
  if (!sourceHost) return { ok: false, reason: "contact_source_not_https" };
  const allowed = [registrable(input.toolDomain), registrable(sourceHost)].filter((d): d is string => !!d);
  if (!allowed.includes(recipientDomain)) return { ok: false, reason: `domain_mismatch (${recipientDomain} vs ${[...new Set(allowed)].join("/")})` };
  return { ok: true, role, recipientDomain };
}

export interface ContactRow {
  id: number;
  tool_slug: string;
  tool_name: string;
  tool_domain: string;
  kind: "held" | "ambiguous_live";
  contact_email: string;
  role: Role;
  contact_source_url: string;
  policy_url: string;
  policy_label: string;
  question_text: string;
  vetted_by: string;
  vetted_at: string;
  status: "eligible" | "sent_by_hand" | "paused" | "resolved";
  paused_reason: string | null;
  hand_sent_at: string | null;
  hand_sent_source: string | null;
  resolved_at: string | null;
}
