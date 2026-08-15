import { describe, it, expect } from "vitest";
import { cleanHtmlToText } from "./htmlClean";

// Regression coverage for a real bug: raw HTML from JS-framework sites was
// truncated before cleaning, so the truncation window was consumed by
// <head>/<script>/<style> chrome and never reached actual policy prose.
// One concrete case: Notion's page had a window.__tcfapi consent-manager
// script that got mistaken by extraction for GDPR-relevant editorial text.

const JS_RENDERED_PAGE_FIXTURE = `
<!DOCTYPE html>
<html data-dpl-id="dpl_5xfYDbfSF5CJypESTKB8K4dtnxRu" lang="en-US">
<head>
  <meta charset="utf-8"/>
  <title>Privacy Policy</title>
  <link rel="stylesheet" href="/marketing-static/_next/static/chunks/main.css"/>
  <style>.hero { display: flex; padding: 2rem; }</style>
  <script>window.__NEXT_DATA__ = {"props":{"pageProps":{}}};</script>
</head>
<body>
  <nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
  <script>
    window.__tcfapi = function (command, version, callback, parameter) {
      // TCF (Transparency & Consent Framework) implementation for GDPR compliance
    };
  </script>
  <main>
    <h1>Privacy Policy</h1>
    <p>We do not train our machine learning models on content you submit to the Service.</p>
    <p>You may request deletion of your personal data at any time by contacting privacy@example.com.</p>
  </main>
  <svg viewBox="0 0 24 24"><path d="M12 2L2 7"></path></svg>
  <footer>&copy; 2026 Example Inc.</footer>
</body>
</html>
`;

describe("cleanHtmlToText", () => {
  it("drops script content, including consent-manager boilerplate", () => {
    const text = cleanHtmlToText(JS_RENDERED_PAGE_FIXTURE);
    expect(text).not.toContain("__tcfapi");
    expect(text).not.toContain("__NEXT_DATA__");
    expect(text).not.toContain("TCF (Transparency");
  });

  it("drops head/style/svg content", () => {
    const text = cleanHtmlToText(JS_RENDERED_PAGE_FIXTURE);
    expect(text).not.toContain("stylesheet");
    expect(text).not.toContain("display: flex");
    expect(text).not.toContain("viewBox");
  });

  it("keeps the actual policy prose", () => {
    const text = cleanHtmlToText(JS_RENDERED_PAGE_FIXTURE);
    expect(text).toContain("We do not train our machine learning models on content you submit to the Service.");
    expect(text).toContain("request deletion of your personal data");
  });

  it("strips remaining tags without mashing adjacent words together", () => {
    const text = cleanHtmlToText("<p>Hello</p><p>World</p>");
    expect(text).toBe("Hello World");
  });
});
