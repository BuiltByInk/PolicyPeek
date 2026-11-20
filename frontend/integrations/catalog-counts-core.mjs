// Pure catalog-count helpers. No filesystem access, so Astro can prerender
// pages that import this module. The Node wrapper (catalog-counts.mjs) reads
// tools.json for the Vite plugin and tests.
export function tokensFrom(tools) {
  const countByStatus = (s) => tools.filter((t) => t.compliance_status === s).length;
  return {
    TOOL_COUNT: String(tools.length),
    RATED_COUNT: String(tools.filter((t) => t.compliance_status !== "not_ai_tool").length),
    COUNT_compliant: String(countByStatus("compliant")),
    COUNT_compliant_with_caveats: String(countByStatus("compliant_with_caveats")),
    COUNT_not_compliant: String(countByStatus("not_compliant")),
    COUNT_unrated: String(countByStatus("unrated")),
    COUNT_shared_domain_unverified: String(countByStatus("shared_domain_unverified")),
    COUNT_not_ai_tool: String(countByStatus("not_ai_tool")),
  };
}

export const applyCountsWith = (tokens, s) =>
  s.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (all, key) => tokens[key] ?? all);

// Marketing wording (20 Nov 2026), matching llms.txt: "68 AI tools rated, plus
// 1 checked site that isn't an AI tool (69 in total)". Every number comes from
// tokensFrom(); the "plus …" part is left out when there are no such sites.
export function totalPhrase(tokens) {
  const rated = Number(tokens.RATED_COUNT), notAi = Number(tokens.COUNT_not_ai_tool), total = Number(tokens.TOOL_COUNT);
  const head = `${rated} AI tool${rated === 1 ? "" : "s"} rated`;
  if (!notAi) return head;
  return `${head}, plus ${notAi} checked site${notAi === 1 ? " that isn't an AI tool" : "s that aren't AI tools"} (${total} in total)`;
}
