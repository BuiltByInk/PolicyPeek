# Policy watcher (Tasks 2–4)

Not deployed. Do not run `wrangler deploy`, do not apply migrations to any remote D1, and do not bind this worker to `policypeek-db` or `policypeek-outreach`.

This worker has its own D1 (`policypeek-watcher` / `policypeek-watcher-dev`, IDs still placeholders), an R2 snapshot bucket, and a queue. It never writes live badges. A passing auto-publish gate writes a `proposed_publishes` row and a publishable `change_log` row only. A verdict-direction change is recorded with `publishable=0` and `elliot_approved=0` until Elliot signs it off. Failures and three consecutive fetch failures go to `elliot_queue`.

The default nightly path fetches, normalises, hashes and diffs. It makes no model call when the hash is unchanged. Verdict + independent second-opinion calls run only when a model client is injected and a change is detected. Auto-publish requires all four of: every relied-on quote still verbatim; the same verdict direction; an independent second opinion that never sees the first call's output; and the tool not being on the held, 10 Nov recheck, or medium-flag lists.

Weekly new-tool selection (`weeklyNewTools.ts`) is code only. Batch size is configurable, clamped 5–10 (default 8). It does not research or add tools by itself. Cards must cite the vendor's own page and pass the same gate.

Local tests: from `workers/`, `npm test` and `npm run typecheck`. Migration `0002_gate_and_queue.sql` is applied only in those tests.
