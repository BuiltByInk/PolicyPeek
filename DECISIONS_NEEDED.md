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

## rules.ts has a gap the original spec never covered — I filled it in myself back at milestone 6, flagging it now instead of changing it further

`memory/CLAUDE.md` doesn't exist (see Docs section below — I created a root-level `CLAUDE.md` tonight to start closing that gap), so I reviewed `backend/src/rules.ts` against `schema.sql` and the original verdict spec you gave me instead. Found one real gap, not a bug exactly, but a decision that was made silently and should be visible to you:

Your original three-bucket definition was:
> not_compliant = training on user data by default with no opt-out; compliant = opt-in or off-by-default; unrated = genuinely unclear

That leaves one case undefined: **trains on user data by default, but an opt-out exists.** It's not "opt-in," it's not "off-by-default," and it's not "no opt-out" either — it's simply not covered by the literal wording of any of the three buckets.

Current code (`rules.ts`):
```ts
if (facts.trains_on_user_data === null) return "unrated";
if (facts.trains_on_user_data === false) return "compliant";
return facts.opt_out_available === true ? "compliant" : "not_compliant";
```
The last line means I decided, at milestone 6, that "trains by default + opt-out available" counts as **compliant**. That's a reasonable reading, but it's an interpretation I made silently in the moment, not something you explicitly signed off on — and per tonight's instructions, changing verdict logic is your call, not mine, so I'm surfacing it rather than touching it further. If you'd rather that case be `unrated` (opt-out existing doesn't necessarily mean it's easy to find or use) or its own thing, that's a one-line change in `computeVerdict()`.

---

## Placeholder production domain in astro.config.mjs

SEO work (sitemap.xml, canonical URLs, OpenGraph URLs) needs an absolute domain to generate against. I used `https://policypeek.example` as a placeholder in `frontend/astro.config.mjs` (`site:`) and `frontend/public/robots.txt` (`Sitemap:` line) — both need the real production domain swapped in before this ever goes live. Not attempting to guess it since that's your call, and it's adjacent to the deploy decisions you told me not to touch.

---

## FYI, not urgent: light competitive scan

Three tools doing roughly what PolicyPeek does, for context when you get to pricing (not asking you to decide anything now):

- **[ToS;DR](https://tosdr.org/en)** — the closest architectural match: a pre-built, curated database you look up a service in and get a letter grade (A–E) plus per-clause reasoning. Free, donation-funded, volunteer/peer-reviewed instead of an admin-approval pipeline. This is the "prior art" for PolicyPeek's whole model.
- **[Termzy AI](https://www.termzyai.com/)** — Chrome extension, analyzes whatever policy page you're currently on in real time (not a pre-built database), scores across 4 dimensions. Free, fully client-side (no server, no stored data) — different trust model than PolicyPeek's server+D1 approach.
- **[TrustScan](https://trustscan.dev/)** — web tool, paste a URL or policy text, get a plain-English summary. Free, no account, explicitly "no premium tiers," processing stays in-browser.

Pattern worth noting: everything I found in this exact niche is free (no paywall on the core lookup/analysis). The paid enterprise-compliance tools that came up in search (Centraleyes, Credo AI, Termly) are a different market — they're for companies proving *their own* regulatory compliance (EU AI Act, GDPR-doc-generation), not for end users checking whether *someone else's* tool trains on their data. Not sure if that changes your pricing thinking, just flagging it since it's the first real market signal we have.

