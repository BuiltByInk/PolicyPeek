// GET /v1/lookup and POST /v1/check are meant to be called from arbitrary
// browser JS -- the extension's popup, and now the website's own submit
// form (SubmitTool.astro), neither of which shares an origin with the
// Worker. Both endpoints are already the public, rate-limited surface
// (server-side daily cap, no secrets involved), so an open
// Access-Control-Allow-Origin is the right call here -- this isn't
// cookie/session-authenticated, there's nothing a wildcard origin exposes
// that a direct curl couldn't already reach. Admin routes are deliberately
// NOT covered: they're same-origin/token tooling, not meant for arbitrary
// page JS.
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-api-key",
};

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
