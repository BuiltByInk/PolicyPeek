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

export type VetResult = { ok: true; role: Role; recipientDomain: string; domainMatchException?: DomainMatchException } | { ok: false; reason: string };

// Parent-company / representative addresses (Elliot 11:57 UK). Allowed ONLY
// where this exact address appears on the tool's own privacy policy, terms or
// privacy-rights page, fetched and checked by Dev. The exception is keyed on
// tool domain + exact address + exact source URL and lives in code, so a D1
// edit alone can never widen it. The address must still be a role address.
export interface DomainMatchException { toolDomain: string; contactEmail: string; contactSourceUrl: string; reason: string; vettedBy: "dev"; vettedAt: string }
export const DOMAIN_MATCH_EXCEPTIONS: readonly DomainMatchException[] = [
  { toolDomain: "mailchimp.com", contactEmail: "privacy@intuit.com", contactSourceUrl: "https://mailchimp.com/about/privacy-rights/", reason: "parent company: Mailchimp is owned by Intuit; Mailchimp's own privacy-rights page says 'You may also send requests to us at privacy@intuit.com'", vettedBy: "dev", vettedAt: "2026-11-10T11:57:00Z" },
  { toolDomain: "windsurf.com", contactEmail: "privacy@cognition.ai", contactSourceUrl: "https://cognition.com/legal/privacy-policy", reason: "parent company: Windsurf is owned by Cognition; windsurf.com/privacy-policy redirects to this policy, which says 'please contact us at privacy@cognition.ai'", vettedBy: "dev", vettedAt: "2026-11-10T11:57:00Z" },
  { toolDomain: "poe.com", contactEmail: "privacy@quora.com", contactSourceUrl: "https://poe.com/pages/privacy", reason: "parent company: Poe is run by Quora; Poe's own privacy policy says 'Please contact our Data Protection Officer at privacy@quora.com'", vettedBy: "dev", vettedAt: "2026-11-10T11:57:00Z" },
  { toolDomain: "replit.com", contactEmail: "privacy@repl.it", contactSourceUrl: "https://replit.com/privacy-policy", reason: "company's older domain: Replit's own privacy policy says 'by emailing us at privacy@repl.it'", vettedBy: "dev", vettedAt: "2026-11-10T11:57:00Z" },
  { toolDomain: "remove.bg", contactEmail: "privacy@edpo.com", contactSourceUrl: "https://www.remove.bg/privacy", reason: "UK representative: remove.bg's own privacy policy names EDPO UK Ltd as its UK representative, 'EDPO UK can be contacted at privacy@edpo.com'", vettedBy: "dev", vettedAt: "2026-11-10T11:57:00Z" },
];
export function findDomainMatchException(toolDomain: string, contactEmail: string, contactSourceUrl: string, list: readonly DomainMatchException[] = DOMAIN_MATCH_EXCEPTIONS): DomainMatchException | null {
  const td = registrable(toolDomain) ?? toolDomain.toLowerCase();
  return list.find((x) => (registrable(x.toolDomain) ?? x.toolDomain) === td && x.contactEmail === contactEmail.trim().toLowerCase() && x.contactSourceUrl === contactSourceUrl.trim()) ?? null;
}

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
export function vetContact(input: { contactEmail: string; toolDomain: string; contactSourceUrl: string }, exceptions: readonly DomainMatchException[] = DOMAIN_MATCH_EXCEPTIONS): VetResult {
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
  if (!allowed.includes(recipientDomain)) {
    const x = findDomainMatchException(input.toolDomain, email, input.contactSourceUrl, exceptions);
    if (x) return { ok: true, role, recipientDomain, domainMatchException: x };
    return { ok: false, reason: `domain_mismatch (${recipientDomain} vs ${[...new Set(allowed)].join("/")})` };
  }
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
  domain_match_exception: string | null;
  on_held_tracker?: number;
  status: "eligible" | "sent_by_hand" | "paused" | "resolved";
  paused_reason: string | null;
  hand_sent_at: string | null;
  hand_sent_source: string | null;
  resolved_at: string | null;
}

// MF8 (Security re-review 10 Nov): the card gate is keyed PER TOOL, never per
// registrable domain. On a multi-product company domain (same curated list as
// backend/src/sharedDomains.ts) or any domain carrying more than one listed
// tool, the key is "<domain>#<tool-name-slug>", e.g. "google.com#gemini",
// "vercel.com#v0". A bare shared domain is never a valid gate key.
export const KNOWN_SHARED_DOMAINS: readonly string[] = ["google.com", "microsoft.com", "amazon.com", "apple.com", "meta.com", "adobe.com", "salesforce.com", "oracle.com", "ibm.com", "vercel.com"];
export function isSharedDomain(domain: string, extra: Iterable<string> = []): boolean {
  const d = domain.toLowerCase().replace(/\.$/, "");
  const all = [...KNOWN_SHARED_DOMAINS, ...extra];
  return all.some((x) => d === x || d.endsWith(`.${x}`));
}
export function nameSlug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "tool";
}
export function toolKey(domain: string, name: string, multiToolDomains: Iterable<string> = []): string {
  const d = domain.toLowerCase();
  return isSharedDomain(d, multiToolDomains) ? `${d}#${nameSlug(name)}` : d;
}
export const TOOL_KEY_RE = /^[a-z0-9.-]{3,80}(#[a-z0-9-]{1,60})?$/;
