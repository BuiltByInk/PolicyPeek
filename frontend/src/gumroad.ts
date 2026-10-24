// Gumroad product URLs for the separate InkLLM products (not part of PolicyPeek's ratings).
export const GUMROAD = {
  starter: "https://inkspire776.gumroad.com/l/rppfze",
  training: "https://inkspire776.gumroad.com/l/jhuide",
  bundle: "https://inkspire776.gumroad.com/l/xybbay",
  incident: "https://inkspire776.gumroad.com/l/vfapf",
  checklist: "https://inkspire776.gumroad.com/l/rhfram",
} as const;

// Adds UTM tags so Gumroad analytics show which part of the site sent the buyer.
// Preserves any existing query params (e.g. ?code=...).
export function gumroadLink(product: keyof typeof GUMROAD, campaign: string): string {
  const u = new URL(GUMROAD[product]);
  u.searchParams.set("utm_source", "policypeek");
  u.searchParams.set("utm_medium", "site");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}
