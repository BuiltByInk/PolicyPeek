export interface Tool {
  name: string;
  domain: string;
  compliance_status: "compliant" | "not_compliant" | "unrated";
  summary: string | null;
  data_retention: string | null;
  trains_on_user_data: boolean | null;
  gdpr_mentioned: boolean | null;
  source_urls: string[];
  verified: boolean;
}
