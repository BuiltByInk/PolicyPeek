export interface Tool {
  name: string;
  domain: string;
  compliance_status: "compliant" | "not_compliant" | "compliant_with_caveats" | "unrated" | "shared_domain_unverified";
  summary: string | null;
  data_retention: string | null;
  trains_on_user_data: boolean | null;
  gdpr_mentioned: boolean | null;
  source_urls: string[];
  // Whether this row is a live, published tool (used e.g. by the backend's
  // monthly recheck cron) -- NOT whether a human reviewed it. Do not use
  // this for the "reviewed by a human" claim; see auto_published below.
  verified: boolean;
  // true when this tool was published by the automatic Tier-A pipeline
  // path (clean facts, deterministic verdict, no recheck status-flip)
  // rather than a human approving it via the admin endpoint. "Reviewed by
  // a human" on the tool detail page must read this field, inverted --
  // not `verified`, which both paths set identically.
  auto_published: boolean;
  // true when the only public policy for this tool lives on a domain shared
  // with unrelated products (e.g. a Google/Microsoft AI feature policy
  // hosted on the parent company's apex domain) -- badge shows a distinct
  // "not product-verified" state instead of a normal compliant/amber/red one.
  shared_domain: boolean;
  // true when source_urls[0] is a Wayback Machine snapshot rather than the
  // live page (the live page blocks automated checks) -- already folded
  // into `summary`'s trailing note, this is here for completeness/future use.
  sourced_from_archive?: boolean;
}
