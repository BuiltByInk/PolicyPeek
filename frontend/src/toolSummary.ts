// Per-tool summary paragraph for /tools/<domain>/ (SEO health check,
// 2026-11-04: tool pages were thin and near-identical). Built ONLY from the
// tool's own catalog row -- verdict, the stored policy quote, the training
// fact, retention, GDPR mention, sources and last-checked date -- so it never
// states anything the catalog doesn't. Wording follows the badge labels in
// verdicts.ts and never says "compliant".
import type { Tool } from "./types";
import { VERDICTS, sentence } from "./verdicts";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };

export function toolSummary(tool: Tool): string | null {
  if (tool.compliance_status === "not_ai_tool") return null;
  const v = VERDICTS.find((x) => x.status === tool.compliance_status);
  const parts: string[] = [];
  parts.push(`PolicyPeek gives ${tool.name} the badge "${v?.label ?? tool.compliance_status}".`);

  const optOut: Record<string, string> = {
    compliant: `Its published policy says it doesn't use your data to train AI models by default, so there is nothing to opt out of.`,
    compliant_with_caveats: `Its published policy allows training on your data by default, but describes a way to opt out.`,
    not_compliant: `Its published policy allows training on your data, and we found no way to opt out.`,
    unrated: `Its published policy doesn't clearly say whether your data is used for training, or whether you can opt out.`,
    shared_domain_unverified: `The only policy we found covers the whole company, so we can't say whether ${tool.name} itself trains on your data or offers an opt-out.`,
  };
  if (optOut[tool.compliance_status]) parts.push(optOut[tool.compliance_status]);

  const quote = tool.summary && tool.summary.trim() ? sentence(tool.summary).replace(/\s+/g, " ") : null;
  if (quote) parts.push(`What we recorded from the policy: ${/[.!?"”)]$/.test(quote) ? quote : quote + "."}`);

  const ret = tool.data_retention && tool.data_retention.trim() ? tool.data_retention.trim().replace(/\s+/g, " ") : null;
  if (ret) {
    const short = ret.length > 200 ? ret.slice(0, 200).replace(/\s+\S*$/, "") + "…" : ret;
    parts.push(`On retention it says: ${/[.!?…]$/.test(short) ? short : short + "."}`);
  } else {
    parts.push("It doesn't state how long your data is kept.");
  }
  if (tool.gdpr_mentioned === true) parts.push("The policy mentions GDPR.");
  else if (tool.gdpr_mentioned === false) parts.push("The policy doesn't mention GDPR.");

  const hosts = [...new Set(tool.source_urls.map(host).filter((h): h is string => Boolean(h)))];
  const d = tool.last_checked_at ? new Date(tool.last_checked_at) : null;
  const date = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
  if (hosts.length || date) {
    const src = hosts.length ? ` from ${hosts.length === 1 ? hosts[0] : `${hosts.slice(0, -1).join(", ")} and ${hosts[hosts.length - 1]}`}` : "";
    parts.push(`${date ? `Last checked ${date}` : "Checked"} against ${tool.source_urls.length} policy page${tool.source_urls.length === 1 ? "" : "s"}${src}.`);
  }
  return parts.join(" ");
}
