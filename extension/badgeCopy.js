// Ported from frontend/src/components/Badge.astro's `copy` map -- keep in
// sync by hand (no shared package between the site and the extension yet).
// Two extension-only states are added at the bottom: the site has no
// equivalent for "not in catalog" (it only lists catalogued tools) or a
// transient "loading" state.
export const BADGE_COPY = {
  compliant: { label: "Compliant", shape: "solid", color: "green" },
  not_compliant: { label: "Not compliant", shape: "solid", color: "red" },
  unrated: { label: "Unrated", shape: "solid", color: "amber" },
  shared_domain_unverified: {
    label: "Company-wide policy — not product-verified",
    shape: "ring",
    color: "amber",
  },
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
