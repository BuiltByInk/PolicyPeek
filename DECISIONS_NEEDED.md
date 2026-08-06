# Decisions Needed

Written autonomously overnight (2026-08-05/06) while you were offline. Nothing below was acted on — each item either needs your judgment or touches something explicitly off-limits (deploy, admin token, pricing, verdict logic, deleting data). Review top to bottom; items are roughly in the order they came up.

## Blocked: couldn't find the "21 preloaded AI tools" list

The research task asked me to verify privacy-policy/ToS/DPA/security URLs for "the ~21 preloaded AI tools the extension ships with." I searched the whole repo (including git history) and found:
- No browser extension code anywhere in this repo.
- No list of ~21 tools, anywhere — not in the repo, not in any config, not in `.claude/agents/`.
- No `memory/CLAUDE.md` (referenced in the backend-polish task) — no `CLAUDE.md` existed at all until I created one tonight (see Docs section below).

This project was rebuilt from scratch this session (you said as much when we started: "the previous local build was lost — never pushed to git"). It's possible the tool list and/or extension code only ever existed on the old machine and genuinely didn't make it into any session artifact I have access to, or it's possible it lives somewhere I didn't think to check (a doc in your Downloads folder again? a different repo?).

I did not invent a list of tools or guess plausible-sounding privacy policy URLs to fill this gap — that would be exactly the "rounding ambiguity into confidence" thing the research agent's own instructions tell it not to do. **What I need from you:** either point me at the actual list, or confirm it needs to be created from scratch (in which case that's a product decision — which 21 tools — not a research task).

---

## FYI, not urgent: light competitive scan

Three tools doing roughly what PolicyPeek does, for context when you get to pricing (not asking you to decide anything now):

- **[ToS;DR](https://tosdr.org/en)** — the closest architectural match: a pre-built, curated database you look up a service in and get a letter grade (A–E) plus per-clause reasoning. Free, donation-funded, volunteer/peer-reviewed instead of an admin-approval pipeline. This is the "prior art" for PolicyPeek's whole model.
- **[Termzy AI](https://www.termzyai.com/)** — Chrome extension, analyzes whatever policy page you're currently on in real time (not a pre-built database), scores across 4 dimensions. Free, fully client-side (no server, no stored data) — different trust model than PolicyPeek's server+D1 approach.
- **[TrustScan](https://trustscan.dev/)** — web tool, paste a URL or policy text, get a plain-English summary. Free, no account, explicitly "no premium tiers," processing stays in-browser.

Pattern worth noting: everything I found in this exact niche is free (no paywall on the core lookup/analysis). The paid enterprise-compliance tools that came up in search (Centraleyes, Credo AI, Termly) are a different market — they're for companies proving *their own* regulatory compliance (EU AI Act, GDPR-doc-generation), not for end users checking whether *someone else's* tool trains on their data. Not sure if that changes your pricing thinking, just flagging it since it's the first real market signal we have.

