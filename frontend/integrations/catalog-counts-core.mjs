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
