// Ported from frontend/src/components/Badge.astro's `copy` map -- keep in
// sync by hand (no shared package between the site and the extension yet).
// Two extension-only states are added at the bottom: the site has no
// equivalent for "not in catalog" (it only lists catalogued tools) or a
// transient "loading" state.
export const BADGE_COPY = {
  compliant: { label: "Compliant", shape: "solid", color: "green" },
  not_compliant: { label: "Not compliant", shape: "solid", color: "red" },
  compliant_with_caveats: {
    label: "Compliant with caveats",
    // Own shape (double border), not reused from ring/solid -- same "shape
    // carries the distinction, not color alone" rule as shared_domain
    // below, ported from Badge.astro's solid-teal-double-border treatment.
    shape: "double",
    color: "caveat",
  },
  unrated: { label: "Unrated", shape: "solid", color: "amber" },
  shared_domain_unverified: {
    label: "Company-wide policy",
    shape: "ring",
    color: "amber",
  },
  // Own neutral color, not reused from any compliance state -- this isn't a
  // verdict on the green/amber/red/caveat spectrum, it's "doesn't look like
  // an AI/ML product." Ported from Badge.astro's solid-gray treatment.
  not_ai_tool: { label: "Not an AI tool", shape: "solid", color: "gray" },
  not_in_catalog: { label: "Not in catalog yet", shape: "solid", color: "gray" },
  loading: { label: "Checking…", shape: "ring", color: "gray" },
};

export function iconPathsFor(state) {
  return {
    16: `icons/${state}-16.png`,
    32: `icons/${state}-32.png`,
    48: `icons/${state}-48.png`,
  };
}
