# 2026-10-28 full catalog audit data update: PREPARED, NOT RUN

Needs **Elliot's own approval** before Jump runs it. Source: `deliverables/research/full-catalog-audit-2026-10-28.md`, plus Jump's manual browser readings on 28 Oct (ChatGPT, Midjourney, Otter; those pages return 403 to the pipeline). Live re-reads by PolicyPeek Dev on 28 Oct are saved in `research/qa-sources/2026-10-28/audit/`. `apply.sql` is generated from this branch's `frontend/data/tools.json` by `tools/gen_apply.py`, so D1 and the site match byte for byte.

**Run order on D1:** `2026-10-24-copilot-otter` (only if never run: it isn't recorded as applied) → `2026-10-28-recheck` → this package. Each guards its starting state and stops (atomically) if it's wrong.

## Held (removed from `tools` with their changelog rows; the rollback re-inserts both with the original ids)
| Domain | Was | Why |
|---|---|---|
| copy.ai, jasper.ai, replit.com, runway.com, stability.ai | unrated | The policy is silent on training, so these are held, not unrated (audit). |
| cursor.com | caveats | The free-tier Privacy Mode default is missing or contradictory. /data-use: "If you choose to turn off "Privacy Mode": we may use and store codebase data ... to improve our AI features and train our models." /privacy: "We do not use Inputs or Suggestions to train our models ... unless" (audit). |
| windsurf.com | caveats | The sources redirect off-domain (docs.devin.ai, cognition.com). The content points to not_compliant (audit). |
| midjourney.com | unrated | The policy is unclear. docs.midjourney.com returns 403 and the catalog files disagree (Jump, 28 Oct). |
| otter.ai | caveats (live) | The setting's default isn't stated, it's unclear whether it covers de-identified audio training, and the plans it covers aren't stated. Sources (Jump's manual reading, 28 Oct): help.otter.ai/…/25352082563863: "Manage your feedback and training permissions in Account Settings > Meetings. You have the option to allow Otter and its third-party service provider(s) permission to access your conversations for training and product improvement, including through human review."; otter.ai/privacy-policy: "training our proprietary AI technology on de-identified audio recordings and on transcriptions (which may contain Personal Information)"; help.otter.ai/…/13352505516695: "By default, Enterprise workspaces are opted out of AI model training." **This removes the caveats badge that is live now.** |

## Updated (manual_override = 1, auto_published = 0)
| Domain | Change |
|---|---|
| github.com | Set to compliant_with_caveats with the GitHub changelog sources, the same as the live site. This is a no-op if 2026-10-24-copilot-otter already ran. |
| openai.com | Stays caveats. The source is now help.openai.com article 5722486 (privacy policy kept for retention). Quotes come from Jump's manual reading. |
| kimi.com, mistral.ai, zoom.com, jetbrains.com | Quotes replaced with word-for-word live text. JetBrains source moved to its redirect target, /legal/docs/terms/product_data_collection/. |
| grammarly.com | Source grammarly.com/privacy-policy dropped (it redirects to superhuman.com). Support article quote. |
| heygen.com | /policy → /privacy. |
| bolt.new | Source stays stackblitz.com/privacy-policy: bolt.new's own footer links it, and the policy covers "the Bolt application ( www.Bolt.new )". The quote is now verbatim. |

Totals: 58 → **49**. Caveats 17, compliant 14, not_compliant 12, unrated 1, shared 4, not_ai_tool 1. These are asserted inside the batch.

Local proof (never remote): `bash data-updates/2026-10-28-audit/tools/local_test.sh` and `VARIANT=d1-old bash …`. Both pass. A broken assert leaves the DB unchanged. Apply gives 49 rows that match tools.json in status, summary and sources. The rollback restores every tools row and the held changelog exactly. Re-applying after a rollback works.

## Run order (Jump, from `backend/`, with Elliot's Cloudflare login and approval)
1. `npx wrangler d1 time-travel info policypeek-db`. Record the bookmark.
2. `npx wrangler d1 execute policypeek-db --remote --json --file=../data-updates/2026-10-28-audit/apply.sql > audit-apply-output.json`
3. `node ../data-updates/2026-10-28-audit/tools/gen_rollback.mjs audit-apply-output.json > rollback-2026-10-28-audit.sql`. Keep this file. If needed, undo with `--file=` on it.
4. If `queued_rechecks` lists ids, reject them via the admin endpoint.
5. `node scripts/refresh-site.mjs`. The output should match this branch's tools.json.
