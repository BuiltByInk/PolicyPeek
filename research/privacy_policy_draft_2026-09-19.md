# PolicyPeek privacy policy — DRAFT for Elliot's review (2026-09-19)

**Not published, not reviewed by a lawyer.** Written from what the code in this
repo actually does on 2026-09-19. Things in [square brackets] need Elliot. Two
statements depend on deploys that haven't happened yet (marked ⚠). Once approved
it becomes `frontend/src/pages/privacy.astro` and gets linked from the footer,
the extension store listings, and `about`.

---

## PolicyPeek privacy policy

*Last updated: [date]*

PolicyPeek tells you what a tool's own privacy policy says about training on
your data. It would be odd if we were careless with yours, so this page says
exactly what we handle, in plain words.

### The short version

- No accounts, no ads, no analytics, no cookies, no tracking scripts.
- The extension only looks at a site when you click its toolbar icon.
- When you do, it sends **that site's domain name** to our server to get a badge.
  If you press "Check this site", it also sends **that page's address without its
  query string**, so we can read the privacy policy.
- We keep your IP address only long enough to enforce one free check a day, then
  delete it. ⚠ (see "IP addresses")
- We never sell data, and we don't use it to profile you.

### What the browser extension does

- It reads the address of the tab you have open **only when you click the
  PolicyPeek icon**. Permission used: `activeTab`. It cannot see your other tabs
  or your history.
- It sends the **domain** (for example `example.com`) to
  `api.getpolicypeek.com` to look up a badge. That is the only thing sent for a
  lookup.
- If the site isn't in our catalog and you press **Check this site**, it sends
  the domain and the page's address **with the query string, fragment and any
  login details removed** (so `https://example.com/privacy?session=abc#top` is
  sent as `https://example.com/privacy`). We then fetch that public page and read
  its text. ⚠ (the stripping is built but not yet deployed to the extension)
- It stores recent lookup results **on your device only** (permission: `storage`)
  for five minutes, so re-opening the popup is quick. We can't see that.
- It has no account, no identifier, no analytics, and makes no requests other
  than the two above.

### What the website does

- It's a static site. It sets no cookies, runs no analytics, and loads no third
  party scripts, fonts or images.
- The "check a new tool" form sends the website and policy link you typed to our
  server. Nothing else.

### What our server keeps

| What | Why | How long |
|---|---|---|
| The badge catalog (tool domain, verdict, quoted policy lines, source link) | It's the product | Kept |
| For each new-tool check: the domain, the policy page address, the page text we fetched, the facts we extracted | To produce and review the verdict | Kept while it's useful for review; [Elliot: set a period, or say "kept"] |
| Your IP address (IPv6: its /64 network) plus the UTC date, for free checks only | To allow one free new-tool check per day | Deleted daily ⚠ (see below) |
| Paid API keys (hashed) | Only if you have a key | While the key exists |

The new-tool check records are **not linked to your IP address or to you**.
Nothing you type into the form is stored except the domain and policy link, and
those are about the tool, not you. [Elliot: names typed by anonymous callers are
ignored, so no free-text from the public is stored.]

### IP addresses

To keep one free check a day per person, the server remembers your IP address
(or, for IPv6, the network part of it) and today's date. ⚠ A daily job deletes
everything older than the current UTC day, so nothing is kept longer than about a
day. **This job is built but not deployed as of this draft; do not publish this
sentence until it is. Until then rows are kept indefinitely, and the first run
after deploy clears the backlog.**

### Who else handles data

- **Cloudflare** hosts the site, API and database. Any host sees IP addresses as
  part of serving requests, and Cloudflare handles that under its own terms.
  We've turned off per-request log storage in our Worker so those details aren't
  retained in our logs. ⚠ (a config change that also isn't deployed yet)
  [Elliot: link Cloudflare's privacy policy; check current retention of
  Cloudflare's own edge logs and state it.]
- **Anthropic** receives the **text of the public privacy policy page** we fetch,
  to extract facts from it. It is public policy text, not your data. It does not
  include your IP or anything about you. [Elliot: confirm the API terms you're on
  and whether to name the terms here.]
- Nobody else. We don't use advertising or data brokers.

### Your choices and rights

You can use the site and extension without giving us anything but the above.
To ask what we hold, or to have something removed, email [contact email]. If you
are in the UK or EU you have the usual rights of access, correction, deletion and
objection, and can complain to your data protection authority
[UK: the ICO, if that's Elliot's jurisdiction]. Because we don't keep an account
or an identifier for you, we may not be able to find records that relate to you;
IP records are deleted within about a day in any case. ⚠

### What our verdicts are

Badges describe what a company's own published policy says about training on
your data, as read by software and, where it's unclear, checked by a person
first. They are **not legal advice and not a compliance certification**. If a
policy is unclear we say **Unrated** rather than guess. See the [methodology
page](/about/).

### Changes and contact

If this changes in a way that affects you, we'll update the date above and say
what changed. Contact: [email]. Operated by [name / business — the extension ID
uses `builtbyink.com`; confirm the legal name and address a privacy notice needs].

---

## Notes for Elliot (not part of the page)

1. **Two sentences are only true after deploy.** The daily IP purge and the
   extension's query-string stripping are built and committed but not live.
   Publish this only after tonight's deploy, and after you've reloaded or
   resubmitted the extension.
2. **Your earlier drafted disclosure sentences need updating.** From
   `DECISIONS_NEEDED.md`: "*No other data is collected*" and "*not stored beyond
   what's needed to serve the result*". Neither is quite accurate. The lookup
   sends only the domain, but "Check this site" also sends the page address, and
   we store the fetched policy text and (for a day) an IP. Suggested replacement
   in `extension/STORE_LISTING` (`research/extension_store_listing_2026-09-19.md`).
3. **Legal points I can't settle:** the controller's legal name and address,
   whether a domain name counts as personal data in this context (arguably
   "browsing activity" — the Firefox manifest already declares it), the lawful
   basis wording if you are UK/EU based, and retention periods. A short review by
   someone qualified would be worth it for a product whose whole pitch is privacy.
4. **Cloudflare specifics are unverified.** I haven't confirmed Cloudflare's own
   retention for edge or Pages logs; the draft says so and asks you to check.
5. **No claims beyond the code.** Every "we don't" above was checked by searching
   the frontend and extension for analytics, third-party hosts, cookies and
   storage; none found on 2026-09-19.
