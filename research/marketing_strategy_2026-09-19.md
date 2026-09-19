# PolicyPeek marketing strategy (DRAFT, 2026-09-19)

Research and drafting only. Nothing here has been posted, published or sent to anyone. Claims about third parties carry a source URL; anything I could not confirm is marked **unverified**. Nothing here is legal advice.

> **Update 2026-09-19:** superseded in part by `research/marketing/strategy_v2_2026-09-19.md` (one-page strategy, SEO review of the live site, Search Console checklist, 30-day plan, drafts). v2 also flags two live verdicts (Granola, GitHub Copilot) to re-check before any promotion.

## 0. Where you actually are

- Zero users. The extension is not confirmed in any store. A search for getpolicypeek.com returned nothing from the site, so it looks unindexed (unverified: a search tool is not a real index check; re-tried 2026-09-19 with the same result). Live site checked 2026-09-19: the 2026-09-18 SEO work appears to be deployed (sitemap of 35 URLs without hancocyber, new og-image), but `/privacy/` is a 404 and `www` returns an error; details in v2 section 2b.
- Name risk: search for "PolicyPeek" surfaces a GitHub project called PolicyPeak, a Chrome-extension policy analyser (https://github.com/ranjan2601/PolicyPeak), and PolicyPak, a Netwrix product (https://g2.com/products/policypak/reviews). Similar spelling, different products. Worth knowing before you spend on a brand.
- Everything below assumes the decided ICP: the individual, casual checker.

## 1. Landscape

Two kinds of neighbour. Policy readers (summarise any site's policy) and AI-training trackers (a table or article about AI tools). PolicyPeek sits between them: a catalog with a badge shown where you are browsing.

| Who | What and who for | How it gets users / price | Where PolicyPeek differs |
|---|---|---|---|
| **ToS;DR** | Volunteer-curated A to E grades for services' terms; extensions for Chrome, Edge, Safari, Firefox, Opera. Individuals. [Wikipedia](https://en.wikipedia.org/wiki/Terms_of_Service;_Didn%27t_Read) | Not-for-profit, FOSS, donations and grants ([about](https://tosdr.org/en/about)). Free. Firefox listing: 11,317 users, 4.6 stars ([AMO](https://addons.mozilla.org/en-US/firefox/addon/terms-of-service-didnt-read/)). Founded 2012. | **Different:** focused on one question (does it train on my data), AI tools only, per-verdict source link. **Weaker:** 14 years of trust, human curation, far bigger reach. Whether ToS;DR currently covers AI tools well: unverified (my fetch of its service page failed). |
| **Termzy AI** | Chrome extension that auto-detects a site's policy/T&Cs and gives a four-indicator score (protection, compliance, transparency, balance). Individuals. [site](https://www.termzyai.com/) | Site lists no pricing; a competitor's article calls it free and unlimited ([TrustScan blog](https://trustscan.dev/blog/best-privacy-policy-summarizers-2026), biased source). Founded by University of Amsterdam students ([AI Journal](https://aijourn.com/launched-termzy-ai-a-browser-extension-that-analyses-terms-of-service-for-you-with-ai/)). Site claims coverage by AP, Wired and others: **unverified**. Appears in AI directories ([TAAFT](https://theresanaiforthat.com/ai/termzy-ai/)). | **Different:** a fixed rules function decides the verdict; Unrated exists; sources linked. **Weaker:** Termzy works on any site instantly, and already has a listing and press. |
| **TrustScan (trustscan.dev)** | Free browser-based privacy tools, including an "AI Training Opt-Out Hub" for 30+ platforms; leans business and individual. [site](https://trustscan.dev/) | Content marketing (many "best of 2026" posts). Free, "no paywalls". Note: several unrelated products share the name TrustScan, so check this is the one already in your notes. | **Overlap:** its opt-out hub answers the same worry. **Different:** it tells you how to opt out; PolicyPeek shows the verdict at the moment you land on a tool. **Weaker:** its SEO output is already heavy. |
| **Privci** | The consumer extension is a personal data manager (breach monitoring, rights requests, policy queries); Firefox listing shows 3 users, last updated Jan 2025 ([AMO](https://addons.mozilla.org/en-US/firefox/addon/privci-privacy-add-on/)). The privci.io homepage now sells a workforce-behaviour security platform at £4 to £6 per user per month ([privci.io](https://privci.io/)). Whether it is the same company: **unverified**. | Little visible traction. | Not a close competitor today. Worth noting that "Chrome extension that explains policies" does not describe it accurately. |
| **Voibe AI Tool Privacy Tracker** | Table of AI tools scored on training, retention, on-device, track record; monthly review. Run by a dictation-app vendor; the page pushes its product. [page](https://www.getvoibe.com/resources/ai-privacy-tracker/) | SEO and content. Free. Tool count: my fetch said 57, a search snippet said 34. | **Closest content rival.** **Weaker:** it has more tools than your 33. **Different:** in-browser, and not a marketing funnel for another product. |
| **Incogni gen-AI ranking** | Annual ranking of 13 AI platforms on 11 criteria. [Incogni](https://blog.incogni.com/gen-ai-llm-privacy-ranking-2026/) | PR-driven; syndicated widely. | Headline-grabbing but it covers only big platforms; no per-tool page you can check while browsing. |
| **Sonomos, AI Policy Desk** | Articles/templates on which AI tools train on data ([Sonomos](https://sonomos.ai/blog/which-ai-tools-train-on-your-data-2026/), [AI Policy Desk](https://www.aipolicydesk.com/blog/ai-vendor-dpa-tracker-2026)). Sonomos sells a masking tool; AI Policy Desk targets small organisations. | SEO. | Content competitors for search terms; not extensions. |
| **Long tail of summarisers** | Polirizer (limited free summaries, paid options), ToS Scanner (credit packs from EUR 1.99), Poliscope (free), an open-source GPT-based analyser. [Polirizer](https://chromewebstore.google.com/detail/polirizer-privacy-policy/ipjdadlcgbeagplnhigaclkgloadphkg), [ToS Scanner](https://chromewebstore.google.com/detail/tos-scanner/kcmipgpdgnphnjjeppflojmoecllppmb), [GitHub](https://github.com/zahidaz/ai-privacy-policy-analyzer) | Store search. | Crowded space: expect "another policy summariser" as a first impression. Your difference has to be visible in the first screenshot. |
| **Mozilla \*Privacy Not Included** | Human-researched consumer product warnings, including romantic AI chatbots. [Mozilla](https://www.mozillafoundation.org/en/privacynotincluded/) | Press and a large audience. | Not a competitor; a possible source of audience and a benchmark for tone. |

**Honest read.** The idea ("does this tool train on my data?") is already covered by articles, trackers and summarisers. PolicyPeek's real differences are (a) the badge at the point of use, (b) a visible source for every verdict, (c) a fixed rule instead of an LLM opinion, (d) Unrated rather than a guess. None of these is proven to matter to users yet. Also caution: some tools split by tier (see `research/tool_list.md`: DeepL, GitHub Copilot, Gamma). A single badge can mislead if the consumer and business tiers differ.

## 2. Audience and channels

I could not read subreddit rules directly (Reddit blocks my fetch tool). Reddit rows are from secondary sources and **must be checked in each sidebar by Elliot before posting.**

| Channel | Fit | Effort (one person) | Spam risk | What is allowed |
|---|---|---|---|---|
| **Chrome and Firefox store search** | High | Medium once; low after | None | Store policy bans keyword stuffing, misleading claims and incentivised reviews ([Chrome policies](https://developer.chrome.com/docs/webstore/program-policies/policies)). Blocked until the extension is listed. |
| **Search (per-tool pages)** | High, slow | Medium | None | See section 4. |
| **Show HN** | Medium; HN likes transparency and rules-based design | Low to write, high to stay online for the day | Low if honest | Must be something people can try, ideally without signup; do not ask friends to upvote ([Show HN rules](https://news.ycombinator.com/showhn.html), [guidelines](https://news.ycombinator.com/newsguidelines.html)). The website lookup works without the extension, so it qualifies. |
| **r/SideProject** | Medium | Low | Low | Secondary sources say self-promotion is the point of the sub if you show the real product and disclose you built it ([GrowReddit](https://www.growreddit.com/blog/reddit-self-promotion-rules-sideproject)). Unverified against the sidebar. |
| **r/privacy, r/PrivacyGuides, r/LocalLLaMA, r/ChatGPT** | High audience fit | Medium | **High** | Many privacy subs restrict or ban self-promotion; a common norm is 90% participation, 10% promotion ([Redship](https://redship.io/blog/reddit-self-promotion-rules)). r/LocalLLaMA reportedly tolerates it under about 10% ([LaunchWake](https://www.launchwake.com/channels/r-localllama)). All unverified. Lurk and answer questions first. |
| **Privacy Guides forum** | High fit | Low | Medium | Its guidelines have no self-promotion section; it says it does not use affiliate links and forbids AI-generated posts ([guidelines](https://discuss.privacyguides.net/guidelines)). Ask staff before posting. |
| **Product Hunt** | Low to medium; an extension needs an install, which hurts conversion | Medium to high | Medium | Asking for upvotes is not allowed; asking people to visit and comment is ([PH guide](https://www.producthunt.com/launch/how-product-hunt-works)). Suggest later, after the extension is listed. |
| **Newsletters, YouTube, Bluesky/Mastodon** | Plausible | High (pitching means contacting people) | Low if genuine | I did not research their rules or any specific creators: **unverified.** Pitching means contacting people, so it is your call. |

Suggested order: store listing and per-tool pages first (they work while you sleep), then one Show HN or r/SideProject post, then genuine participation in privacy communities.

## 3. Positioning and messaging

| # | One line | Can back up today | Cannot claim |
|---|---|---|---|
| A | "See whether an AI tool trains on your data, before you sign up." | The badge, the six states, a source link on every verdict, 33 tools plus one new check a day. | Coverage of "AI tools" in general; that the answer is current; that it is complete. |
| B | "Every badge links to the policy it came from." | Source links on every verdict; the methodology page. | That it is always up to date; that every badge was human-reviewed (clean results auto-publish, uncertain ones are held). |
| C | "When a policy is unclear, we say Unrated. We don't guess." | An Unrated state exists; a fixed rules function, not the LLM, decides the verdict. | An accuracy rate (none measured); that the LLM extraction is never wrong. |

Recommendation for discussion: A as the headline, B and C as the proof beneath it. B and C are the parts a privacy-minded reader can check for themselves.

Say plainly, in the copy:
- "The badge reflects what the tool's own policy says, on the date we checked. It is not legal advice or a legal compliance finding."
- "Most badges publish automatically; anything uncertain is held for a person to review first." Never write "human reviewed".
- "We rate policies, not products. Business and consumer plans can differ."
- The word "Compliant" on a badge can read as a legal verdict. That conflicts with your own constraint. Flagged as an open question, not something I changed.

## 4. 30-day plan (assume 3 to 5 hours a week)

**Week 1: foundations**
- Write a short privacy notice for the site and the extension. Stating what the lookup API sees matters: a lookup reveals which tool a person is visiting. The rate limiter already stores client IP plus a day bucket (`CLAUDE.md`, `anonymous_check_log`), so say so.
- Spot-check a sample of auto-published badges against their sources before anything public. A wrong badge about a named company is the biggest risk.
- Add a visible "report an error" contact and a "last checked" date on every tool page.
- Submit the sitemap to search engines. Check the tool-page titles.
- Pick measurement (below).

**Week 2: store submission and quiet testing**
- Submit to the Chrome Web Store (and Firefox if wanted). Chrome's stricter data-disclosure policies took effect 2026-08-01 ([Chrome blog](https://developer.chrome.com/blog/cws-policy-updates-2026)); Firefox requires a data-collection declaration in the manifest for new extensions ([Mozilla](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/)).
- Review times: unverified.
- Ask a few people you already know to try it and tell you what confuses them. Your outreach, not mine.

**Week 3: first public post (only if you are comfortable being visible)**
- One Show HN or r/SideProject post, disclosing you built it and saying honestly that it is new with 33 tools. Stay online for replies. Spend the rest of the week on genuine replies in privacy communities, without links unless asked.

**Week 4: review and decide**
- Publish one useful piece from your own data (for example, "what 33 privacy policies say about training on your data, and how many were unclear"). Fix what people reported. Apply the go/no-go below.

**SEO ideas (each tool has its own page)**
- Target the query form "does X train on your data" and "X privacy policy opt out". Big names (ChatGPT etc.) are dominated by vendor help pages and established guides ([example results](https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance), [TrustScan](https://trustscan.dev/blog/opt-out-llm-training-data-2026)), so long-tail tools (for example Suno, Kling or Granola, if they are among the ~33 published) are the more realistic wins. Search volume: unverified, not measured.
- Each page: plain-language answer in the first paragraph, the verdict, the quoted-or-linked source clause, the checked date, and the tier caveat. Link to the methodology page.
- Do not mass-generate near-identical pages beyond what you can keep accurate.

**Measuring without breaking the brand**
| Option | Privacy fit |
|---|---|
| Store dashboards (installs, uninstalls) | Fine; provided by the store. |
| GoatCounter (free, open source), Plausible (from $9/month), Cloudflare Web Analytics (free) | Cookieless, no personal data, generally no consent banner needed ([comparison](https://vibegrowthstack.io/compare/goatcounter-vs-plausible-analytics)). Confirm each against your own hosting setup. |
| Aggregate counters by tool slug on the API | Fine, if no per-user identifier and no browsing history is stored. |
| Google Analytics, ad pixels, session replay, per-user extension telemetry | **Conflicts with the brand**, and Chrome's limited-use policy restricts collecting browsing activity ([policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)). Avoid. |

**Go / no-go (my suggestions, not benchmarks; adjust freely)**
- Go (keep investing): unprompted messages or corrections from strangers; people click through to sources; someone returns for a second lookup; a tool page starts getting search impressions.
- Hold and fix: users report confusing badges or a wrong verdict. Fix before more promotion.
- Rethink positioning, not volume: after two honest posts, single-digit installs and little site traffic.
- Stop and ask: any complaint from a named company, or any verdict found to be wrong.

## 5. Risks and things not to do

**Do not**
- Post from multiple accounts, ask for upvotes, buy or incentivise reviews (Show HN, Product Hunt and Chrome all prohibit it).
- Use "GDPR certified", "100% verified", "safe", "unsafe", "guaranteed", "covers all AI tools", or any claim of legal compliance.
- Claim every badge was human reviewed.
- Use countdown timers, fake scarcity, or nag pop-ups.
- Use AI-generated forum posts (Privacy Guides forbids them; most communities dislike them).
- Name individual employees, or make claims about a company's intent.

**Publishing verdicts about named companies**
- Defamation turns mainly on false statements of fact; opinion based on disclosed facts is usually safer, and truth or honest belief are defences in the UK ([Igniyte](https://www.igniyte.co.uk/blog/online-defamation-how-to-protect-reputation-in-2026/), [Minc Law](https://www.minclaw.com/when-online-reviews-defamation/)). Which jurisdiction applies to you is unverified. Consider a short paid legal read of your wording and terms before launch.
- Safer wording:
  - "According to [Tool]'s privacy policy, retrieved on [date], the policy says X. [link]" rather than "[Tool] steals your data".
  - "Not compliant" is the riskiest badge text. Explain it as "the policy says it trains on your data by default and does not describe an opt-out", each time.
  - "Unrated" when uncertain. Never round up or down.
- Show the retrieval date and a correction route. Commit to a response time you can keep.
- Extraction can be wrong or stale. One auto-published wrong badge is your largest reputational exposure. Sample-audit regularly.
- Use company names as plain text. Logo use: get advice. Never imply endorsement.

## 6. Open questions for Elliot

1. **Pricing and premium:** does premium get announced now, or not until it exists? I suggest not selling anything unbuilt.
2. **Brand voice:** you asked for plain and warm elsewhere; confirm that applies to public copy, including the About page.
3. **Visibility:** are you willing to post under your own name, be online for a Show HN day, or reply to a company that disagrees with a badge?
4. **Store timing:** submit before or after the first public post? Chrome only, or Firefox as well?
5. **Badge names:** keep "Compliant / Not compliant", given your rule that verdicts are about what a policy says, not legal compliance? Methodology change, so yours to decide.
6. **Tier handling:** how should a tool with different consumer and business terms be shown on one badge?
7. **Name:** is the PolicyPeek / PolicyPak / PolicyPeak similarity acceptable?
8. **Measurement:** which of the analytics options, if any, fits your comfort?
