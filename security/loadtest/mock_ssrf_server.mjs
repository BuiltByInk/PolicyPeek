import http from "node:http";

// Local-only mock server for the SSRF concurrency probe. Every hostname that
// reaches this server (via *.localhost, which resolves to loopback) is
// already going to be blocked by ssrf.ts's own resolved-address check --
// the point isn't to simulate a "safe" external site (impossible from
// loopback, and correctly so), it's to confirm the redirect-to-blocked path
// rejects reliably and independently under real concurrent load, with no
// cross-contamination between concurrent requests.
const PORT = 8765;

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/redirect-blocked")) {
    // Redirects to the classic cloud-metadata address -- exactly the kind of
    // hop assertSafeUrl must catch on every redirect, not just the first hop.
    res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
    return;
  }
  if (req.url.startsWith("/redirect-loopback")) {
    res.writeHead(302, { Location: "http://127.0.0.1/" });
    res.end();
    return;
  }
  if (req.url.startsWith("/direct-blocked-ip")) {
    // Not a redirect at all -- request the literal blocked IP straight away,
    // as a control case (should be blocked at assertSafeUrl's literal check,
    // before any DNS resolution or redirect logic even runs).
    res.writeHead(200);
    res.end("<html><body>unreachable in practice, blocked before connect</body></html>");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<html><body>We do not train on your data. No opt-out needed.</body></html>");
});

server.listen(PORT, "::", () => {
  console.log(`mock SSRF server listening on [::]:${PORT} (dual-stack)`);
});
