# PolicyPeek extension — store submission pack (DRAFT, 2026-09-19)

Prepared so submission is quick once Elliot decides to go. Nothing has been
submitted. Everything in [square brackets] needs Elliot.

## Where it stands

- **Not live as far as I can tell.** The repo has no record of any store
  submission ("no submission attempted" in the changelog). On 2026-09-19 I
  searched the web and queried Mozilla's public add-on search: no PolicyPeek
  listing on Firefox Add-ons, and none surfaced for Chrome. I can't see the
  Chrome Developer Dashboard, so if you submitted something there, check it.
  Elliot's Firefox testing so far reads as unpacked/temporary loading.
- **Name check:** Firefox Add-ons already has an add-on called *Peek-a-Policy*.
  Different name, similar idea and sound. Worth a glance before you commit to the
  name. [Elliot: keep "PolicyPeek"?]
- Manifest is MV3, version 0.1.0, permissions `activeTab` and `storage`, host
  permission `https://api.getpolicypeek.com/*` only, no background script, no
  content scripts. That's a small, easy-to-justify footprint.

## Must fix before submitting

1. **Real store icon.** `manifest.json` uses the four `loading-*.png` images as
   the extension's icon. Those are the transient grey ring shown while checking,
   not a brand mark. Chrome needs a 128×128 store icon; use a proper PolicyPeek
   mark. [Elliot: design or pick one; the toolbar badge icons per verdict are
   separate and already exist.]
2. **Privacy policy live at a public URL.** Chrome's dashboard requires the link;
   Firefox wants it too. Draft: `research/privacy_policy_draft_2026-09-19.md`.
   Publish only after tonight's deploy (two of its sentences depend on it).
3. **Deploy first, then package.** The extension code changes made on 2026-09-19
   (query strings stripped from submissions, verdict shown after a submit,
   `not_ai_tool` icons) should be in the package, and the backend/frontend that
   they rely on should be live.
4. **Update the data-disclosure wording** (below). The earlier drafted sentence
   "*No other data is collected*" is not accurate for the "Check this site" path.

## Listing copy

**Name:** PolicyPeek

**Short description** (Chrome limit 132 characters; this is 93):
> See at a glance whether an AI tool trains on your data, straight from its own privacy policy.

**Detailed description** (honest about limits; edit the voice):
> PolicyPeek shows a simple badge for whether an AI or software tool trains on
> your data, based on what its own privacy policy says.
>
> Click the toolbar icon on a site and you'll see one of:
> • **Compliant**: doesn't train on your data by default, or only if you opt in
> • **Compliant with caveats**: trains by default, but the policy gives you a real opt-out
> • **Not compliant**: trains by default, with no opt-out
> • **Unrated**: the policy doesn't say clearly. We don't guess.
> • **Company-wide policy**: the only policy found covers a whole company, not this product
> • **Not an AI tool**: nothing suggests this is an AI product
>
> Every badge links to the policy wording behind it. Facts are pulled from the
> policy by software; a fixed rule turns them into the badge, and anything
> uncertain is checked by a person before it's published. It is not legal advice
> and not a compliance certification.
>
> If a site isn't in the catalog yet, press "Check this site" (one free new check
> a day). No account. No ads. No tracking.
>
> **What it sends:** when you click the icon, the domain of the site you're on
> goes to PolicyPeek's server to fetch the badge. If you press "Check this site",
> that page's address (without its query string) is sent too, so the policy can
> be read. Nothing else, and nothing is sold or used for advertising.
> Privacy policy: [URL]

**Category:** Productivity (Chrome) / Privacy & Security (Firefox). [Elliot to pick.]

## Permission justifications (Chrome dashboard fields)

- **`activeTab`**: to read the address of the tab you have open when you click
  the icon, so the extension can show that site's badge. Nothing is read
  before the click and no other tab is accessible.
- **`storage`**: to keep recent lookup results on your device for five minutes so
  re-opening the popup is instant.
- **Host permission `https://api.getpolicypeek.com/*`**: to request badges and
  submit new checks from the popup. This is PolicyPeek's own API.
- **No remote code:** none loaded; all code ships in the package.

**Single purpose statement:** "Show a data-training privacy badge for the site
you're on, and let you request a check for sites that aren't in the catalog."

## Data disclosure (both stores)

**Suggested wording, replacing the earlier draft:**
> When you click the icon, PolicyPeek sends the domain of the site you're on to
> its server and returns a badge. If you press "Check this site", it also sends
> that page's address with any query string removed. We keep no account or
> identifier for you. Your IP address is used only to allow one free check per
> day and is then deleted. We don't sell data or use it for advertising or
> tracking.

(The IP-deletion sentence is true only once the daily purge is deployed.)

- **Firefox:** `data_collection_permissions.required` is already
  `["browsingActivity"]` in the manifest, which matches. Paste the wording above
  into the submission form's description field.
- **Chrome "Privacy practices" tab:** my best reading is to tick **Web history**
  (the site you're on) and leave everything else unticked. That's my
  interpretation of Chrome's category names, so check the dashboard's own
  wording. Then certify the three limited-use statements (not sold to third
  parties outside approved uses, not used for unrelated purposes, not used for
  creditworthiness or lending). All three are true. Add the privacy policy URL.

## Assets to prepare

| Asset | Chrome | Firefox | Status |
|---|---|---|---|
| Store icon 128×128 | required | (uses manifest icons) | **needs a real icon** |
| Screenshots 1280×800 (1 to 5) | required (min 1) | recommended | to capture: a compliant badge, a not-compliant badge, "not in catalog + Check this site", the site list |
| Small promo tile 440×280 | optional but recommended | n/a | not made |
| Privacy policy URL | required | recommended | draft only |
| Support contact / site | required | required | [email], getpolicypeek.com |

For screenshots use **real catalog data** (the popup on a real tool's site), not
mocked verdicts.

## Packaging

```bash
cd ~/policypeek/extension
zip -r ../policypeek-extension-0.1.0.zip . -x "SCOPE.md" "*.DS_Store"
```
`SCOPE.md` is an internal doc and shouldn't ship. Sanity-check the zip has
`manifest.json` at its root.

## Store-specific notes

- **Chrome:** one-time developer registration fee ($5 in the earlier checklist)
  and 2-step verification on the Google account. Expect the manifest's
  `browser_specific_settings` key to show as "unrecognized" in Chrome; that's a
  Firefox-only key and is normally just a warning. I haven't tested this here.
  Review usually takes days; the permission set is small, which helps.
- **Firefox:** free; add-ons are signed by Mozilla through AMO. The code is
  plain JavaScript with no build step, so no separate source upload should be
  needed [verify in the form]. `gecko.id` is `policypeek@builtbyink.com`; keep it
  stable for updates. Firefox may not grant the API host permission at install,
  but the API allows cross-origin requests from anywhere (`Access-Control-Allow-Origin: *`
  on `/v1/lookup` and `/v1/check`), so lookups and checks still work.
- **Both:** the popup shows whatever the API returns for a domain, escaped
  (`textContent` only), so no injection path from catalog text.

## Submission checklist

- [ ] Tonight's deploy done and verified (see `DEPLOY_RUNBOOK_2026-09-19.md`)
- [ ] Privacy policy page live and linked
- [ ] Real store icon in `manifest.json`
- [ ] Data-disclosure wording updated in both stores
- [ ] Screenshots captured from the real extension
- [ ] Zip built and loaded once from the zip in a clean browser profile
- [ ] Firefox submission (free) → wait for signing
- [ ] Chrome registration + submission
- [ ] Add the store links to the site footer and `about` after approval
