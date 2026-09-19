export interface Tool {
  name: string;
  domain: string;
  compliance_status:
    | "compliant"
    | "not_compliant"
    | "compliant_with_caveats"
    | "unrated"
    | "shared_domain_unverified"
    | "not_ai_tool";
  summary: string | null;
  data_retention: string | null;
  trains_on_user_data: boolean | null;
  gdpr_mentioned: boolean | null;
  source_urls: string[];
  // Whether this row is a live, published tool (used e.g. by the backend's
  // daily recheck cron) -- NOT whether a human reviewed it. Do not use
  // this for the "reviewed by a human" claim; see auto_published below.
  verified: boolean;
  // true when this tool was published by the automatic Tier-A pipeline
  // path (clean facts, deterministic verdict, no recheck status-flip)
  // rather than a human approving it via the admin endpoint. "Reviewed by
  // a human" on the tool detail page must read this field, inverted --
  // not `verified`, which both paths set identically.
  auto_published: boolean;
  // When PolicyPeek last read this tool's policy page and confirmed or accepted
  // the result (ISO 8601, UTC). Optional/null for data generated before the
  // column existed. NOT advanced by a recheck that found a change waiting for
  // review, so it never claims a check that didn't confirm the entry.
  last_checked_at?: string | null;
  // true when the only public policy for this tool lives on a domain shared
  // with unrelated products (e.g. a Google/Microsoft AI feature policy
  // hosted on the parent company's apex domain) -- badge shows a distinct
  // "Company-wide policy" state (badge label; the reason line says the policy
  // isn't verified for this product) instead of a normal compliant/amber/red one.
  shared_domain: boolean;
  // true when source_urls[0] is a Wayback Machine snapshot rather than the
  // live page (the live page blocks automated checks) -- already folded
  // into `summary`'s trailing note, this is here for completeness/future use.
  sourced_from_archive?: boolean;
}
