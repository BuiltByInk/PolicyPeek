export interface Tool {
  name: string;
  domain: string;
  compliance_status: "compliant" | "not_compliant" | "unrated" | "shared_domain_unverified";
  summary: string | null;
  data_retention: string | null;
  trains_on_user_data: boolean | null;
  gdpr_mentioned: boolean | null;
  source_urls: string[];
  verified: boolean;
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
