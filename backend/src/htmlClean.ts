// Reduces raw fetched HTML to plain body text before it's stored or sent to
// the extraction model. The original pipeline truncated raw HTML directly,
// which meant JS-framework sites (Next.js, etc.) lost their actual policy
// prose entirely -- the truncation window was consumed by <head> metadata,
// <script>/<style> chrome, and inline consent-manager code (e.g. a
// window.__tcfapi call was once mistaken for GDPR-relevant prose by the
// extraction model). Order matters: strip whole blocks (with their content)
// before stripping remaining bare tags, so script/style contents don't leak
// into the text as unmarked prose.

const BLOCK_TAGS_TO_DROP = ["head", "script", "style", "svg", "noscript"];

export function cleanHtmlToText(html: string): string {
  let text = html;

  for (const tag of BLOCK_TAGS_TO_DROP) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }

  // HTML comments can carry conditional/legacy script content too.
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // Remaining bare tags (nav chrome, divs, etc.) -- replace with a space so
  // adjacent inline elements don't get mashed into one word.
  text = text.replace(/<[^>]+>/g, " ");

  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return text.replace(/\s+/g, " ").trim();
}
