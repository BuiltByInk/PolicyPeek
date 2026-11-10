// Gate 1 + template-injection items (Security review 2026-11-10).
// The wording is LOCKED in code: plain text only, no HTML, no tracking, no
// links other than PolicyPeek's home page, its privacy notice and the exact
// stored https policy URL. The only per-tool inputs are the tool name, the
// policy URL and one plain-text context paragraph from vetted D1 rows.

export const PRIVACY_URL = "https://getpolicypeek.com/privacy";
export const HOME_URL = "https://getpolicypeek.com";
export const SUBJECT_MAX = 120;
export const CONTEXT_MAX = 1500;

export const QUESTIONS = [
  "1. Is customer or user content or data used to train or fine-tune AI models, yours or third parties'?",
  "2. If so, is that on by default?",
  "3. How can a customer opt out?",
] as const;

export const STOP_LINE = `If you'd rather not hear from us, reply "stop" and we won't email again.`;

export class TemplateError extends Error {}

// Strip CR/LF and every other control character, collapse spaces, cap length.
export function sanitiseHeaderText(s: string, max = SUBJECT_MAX): string {
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

function sanitiseParagraph(s: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) throw new TemplateError("empty_context");
  if (clean.length > CONTEXT_MAX) throw new TemplateError("context_too_long");
  if (/<[a-z!/]/i.test(clean)) throw new TemplateError("context_has_markup");
  return clean;
}

// The URL printed in the email must be https and byte-identical to the one
// stored in D1 (both for the contact row and the expected value passed in).
export function checkPolicyUrl(policyUrl: string, storedPolicyUrl: string): string {
  if (policyUrl !== storedPolicyUrl) throw new TemplateError("policy_url_mismatch");
  let u: URL;
  try {
    u = new URL(policyUrl);
  } catch {
    throw new TemplateError("policy_url_invalid");
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new TemplateError("policy_url_not_https");
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f]/.test(policyUrl)) throw new TemplateError("policy_url_invalid");
  return policyUrl;
}

export interface TemplateInput {
  toolName: string;
  policyUrl: string;
  storedPolicyUrl: string;
  contextParagraph: string;
  // ISO date of the initial send (follow-up only)
  initialSentAt?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
}

export function initialSubject(toolName: string): string {
  const name = sanitiseHeaderText(toolName, 60);
  if (!name) throw new TemplateError("empty_tool_name");
  return sanitiseHeaderText(`PolicyPeek question: does ${name} use customer data to train AI models?`);
}

function footer(policyUrl: string): string {
  return [
    `Policy we reviewed: ${policyUrl}`,
    "",
    "With your permission, we'll quote your answer on PolicyPeek.",
    "",
    `This is a one-off question about your published policy, not marketing. ${STOP_LINE}`,
    `How we handle personal data, including replies to this email: ${PRIVACY_URL}`,
    "",
    "Thank you,",
    "Elliot Inkley",
    "PolicyPeek",
    HOME_URL,
  ].join("\n");
}

export function renderInitial(input: TemplateInput): RenderedEmail {
  const policyUrl = checkPolicyUrl(input.policyUrl, input.storedPolicyUrl);
  const context = sanitiseParagraph(input.contextParagraph);
  const text = [
    "Hello,",
    "",
    `I run PolicyPeek (${HOME_URL}), a free, independent checker of whether services' privacy policies allow customer data to be used to train AI.`,
    "",
    context,
    "",
    "Please could you confirm:",
    ...QUESTIONS,
    "",
    footer(policyUrl),
  ].join("\n");
  const e = { subject: initialSubject(input.toolName), text };
  assertNoBanned(e);
  return e;
}

export function renderFollowup(input: TemplateInput): RenderedEmail {
  const policyUrl = checkPolicyUrl(input.policyUrl, input.storedPolicyUrl);
  const context = sanitiseParagraph(input.contextParagraph);
  const name = sanitiseHeaderText(input.toolName, 60);
  const when = input.initialSentAt ? ` of ${formatDate(input.initialSentAt)}` : "";
  const text = [
    "Hello,",
    "",
    `I'm following up once on my email${when} about ${name}'s privacy policy. This is the only follow-up we'll send.`,
    "",
    `PolicyPeek (${HOME_URL}) is a free, independent checker of whether services' privacy policies allow customer data to be used to train AI.`,
    "",
    context,
    "",
    "Please could you confirm:",
    ...QUESTIONS,
    "",
    footer(policyUrl),
  ].join("\n");
  const e = { subject: sanitiseHeaderText(`Re: ${initialSubject(input.toolName)}`), text };
  assertNoBanned(e);
  return e;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

// Banned wording (marketing drift): checked by tests and at render time.
export const BANNED = [/inkllm/i, /\bpaid\b/i, /\bpric(e|ing)\b/i, /\bsubscri/i, /\bdiscount/i, /\boffer\b/i, /\bshop\b/i, /\bsponsor/i, /\bautomatic/i];
// Neutral questions only (Elliot 11:39 UK): our own words must never state or
// imply that the company trains on data. Quoted vendor wording ("we may use")
// is the company's, not ours, so these patterns target second-person claims.
export const IMPLIES_TRAINING = [
  /\byou(?:'re| are)?\s+(?:currently\s+|already\s+|clearly\s+)?(?:train|training|trained)\b/i,
  /\byou\s+(?:use|are using|have used|used)\s+(?:our|your customers'?|customers'?|customer|user|users'?|people's|personal)\s+(?:data|content)/i,
  /\byou\s+use\s+(?:it|this data|that data)\s+(?:to|for)\s+train/i,
  /\bsince\s+you\s+(?:train|use)/i,
  /\byour\s+(?:ai\s+)?training\s+on\b/i,
  /\bwhy\s+(?:do|does|are)\s+you\s+train/i,
  /\b(?:trains|is training|trained)\s+on\s+(?:your|customer|user)\s+(?:data|content)/i,
];
export function assertNoBanned(e: RenderedEmail): void {
  for (const b of BANNED) if (b.test(e.subject) || b.test(e.text)) throw new TemplateError(`banned_wording ${b}`);
  for (const b of IMPLIES_TRAINING) if (b.test(e.subject) || b.test(e.text)) throw new TemplateError(`implies_training ${b}`);
}
