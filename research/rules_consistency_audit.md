# rules.ts consistency audit (2026-09-06, Phase 2.5e Part 2)

Exhaustive, script-based (not eyeballed) audit of every `tools.json` entry
against what `backend/src/rules.ts::computeVerdict()` would compute today
from that same tool's own stored facts. Script:
`/tmp/claude-1000/.../scratchpad/rules_audit.mjs` (scratch, not committed —
happy to move it into the repo if it's worth keeping as a recurring
check). Audit and reporting only — nothing published, fixed, or changed.

## Structural finding, found while writing the script

`computeVerdict` needs `opt_out_available` to choose between
`compliant_with_caveats` and `not_compliant` whenever `trains_on_user_data`
is true. **Neither `tools.json` nor D1's `tools` table persists
`opt_out_available` past the original publish decision** — it only exists
transiently in a pending check's `extracted_facts` JSON blob, which is
gone once approved/published. Practical effect: for every tool with
`trains_on_user_data: true`, this audit (or any future one) can confirm
the stored verdict is *a valid bucket* but can't independently re-derive
*which* of the two valid buckets is actually correct without re-extracting
or re-reading the source. Worth deciding separately whether `tools`
should gain an `opt_out_available` column — not doing that here, just
flagging it since it limits what any consistency check can prove.

## Method

For each of `tools.json`'s 32 entries: if `shared_domain` is true, expect
`shared_domain_unverified` (always, regardless of facts). Otherwise, if
`trains_on_user_data` is `null` expect `unrated`; if `false` expect
`compliant`; if `true`, the only valid stored buckets are
`compliant_with_caveats` or `not_compliant` — anything else (i.e.,
`compliant`) is flagged as an unambiguous mismatch regardless of
`opt_out_available`.

Then cross-checked every domain against real D1's `tools` table
(read-only query, no writes) to separate "tools.json is stale but D1 has
already been recomputed correctly" from "the wrong verdict is baked into
D1 too."

## Result: 14 of 32 tools flagged. None are masked by a shared_domain override — every one below is on the actual public badge today via tools.json.

### Group A — unambiguous mismatch, currently live and wrong (5 tools): tools.json is stale, D1 already has the correct verdict

| Tool | tools.json (live, wrong) | D1 (correct, unpublished to the site) | Root cause |
|---|---|---|---|
| ChatGPT (openai.com) | `compliant` | `compliant_with_caveats` | Phase 2's bulk pipeline re-extracted and correctly recomputed this domain in D1 under current rules.ts, but tools.json (what the Astro build actually reads) was never regenerated from D1 afterward — the known tools.json/D1 sync gap, now with a name on it. |
| ElevenLabs | `compliant` | `compliant_with_caveats` | Same as above. |
| Grammarly | `compliant` | `compliant_with_caveats` | Same as above. |
| Perplexity AI | `compliant` | `compliant_with_caveats` | Same as above. |
| Midjourney | `not_compliant` | `compliant_with_caveats` | Same sync gap, but the disagreement is *between the two valid buckets*, not just old-vs-new taxonomy — this looks like a genuine fact disagreement (opt_out_available differed between whatever produced the tools.json entry and D1's recheck), the same shape of problem as the Sourcegraph Cody case, not just a stale rebuild. Worth a closer look on its own. |

**These 5 are the highest-priority, lowest-effort fix**: no re-extraction needed, D1 already has the right answer sitting there — this is purely a "regenerate tools.json from D1" problem (Midjourney aside, which needs a fact re-check first).

### Group B — unambiguous mismatch, wrong in D1 too (5 tools): not just stale, the verdict itself predates the 2026-08-18 ruling and was never recomputed

| Tool | Stored (tools.json = D1, they agree) | auto_published? | Rules-current would require |
|---|---|---|---|
| Bolt.new | `compliant` | yes (1) | `compliant_with_caveats` or `not_compliant` |
| HeyGen | `compliant` | yes (1) | `compliant_with_caveats` or `not_compliant` |
| Ideogram | `compliant` | yes (1) | `compliant_with_caveats` or `not_compliant` |
| JetBrains AI Assistant | `compliant` | yes (1) | `compliant_with_caveats` or `not_compliant` |
| Luma AI (Dream Machine) | `compliant` | yes (1) | `compliant_with_caveats` or `not_compliant` |

**Root cause, fairly confident**: all five are `auto_published: 1` in D1,
and `rules.ts`'s own comment states the pre-2026-08-18 logic folded
"trains by default, but has an opt-out" into plain `compliant` (the exact
gap the 2026-08-18 ruling closed). These five look like they were
auto-published by the pipeline *before* that ruling took effect, using
facts that were correct for the rules in place at the time, and were
simply never re-run against the post-ruling `computeVerdict`. Unlike
Group A, fixing these needs an actual recheck (or at minimum knowing each
one's `opt_out_available`, which — per the structural finding above —
isn't stored anywhere to recover directly), not just a resync.

**Sourcegraph Cody belongs conceptually with this group** (`compliant`
stored with `trains_on_user_data: true`) but it's D1-absent, tools.json-only,
and already has its own writeup — see `research/sourcegraph_cody_followup.md`.
Counted once in the total, not twice.

### Group C — unverifiable, not flagged as wrong (4 tools): valid bucket, but can't confirm which one without the missing opt_out_available fact

| Tool | Stored status | auto_published? | Note |
|---|---|---|---|
| DeepL | `not_compliant` | no (0) | Human-approved (not auto-published) — a person already made this compliant_with_caveats-vs-not_compliant call at approval time, which the structural gap doesn't affect the same way it does an unreviewed auto-publish. Lower priority. |
| Otter.ai | `not_compliant` | no (0) | Same as above. |
| Windsurf | `not_compliant` | no (0) | Same as above — also the subject of its own earlier Wayback-fallback resolution (see DECISIONS_NEEDED.md), unrelated to this bucket question. |
| Midjourney | see Group A | — | Already counted above — flagged for the tools.json/D1 disagreement, not for this reason. |

## Sync-gap summary (tools.json vs. real D1)

- **31 of 32 tools.json domains exist in D1**; the one exception is
  `sourcegraph.com` (tools.json-only, confirmed in Part 1).
- **0 domains exist in D1 but not tools.json** — D1 isn't ahead of
  tools.json on coverage, only on correctness for the 5 Group A domains.
- Of the 31 domains in both stores, **5 disagree** (all Group A above);
  the other 26 agree on both `compliance_status` and `trains_on_user_data`.

## Priority read, evidence only — not deciding anything

1. **Group A (5 tools, especially ChatGPT)**: live, wrong, on the public
   site right now, and the fix is sitting in D1 already unused — this is
   the cheapest and most public-facing thing to close.
2. **Group B (5 tools)**: also live and wrong, but actually needs a
   decision or a recheck, not just a resync — same shape of problem as
   the already-open Sourcegraph Cody question, just not blocked on a
   specific fact disagreement, more a "never revisited after the rules
   changed" gap.
3. **Group C (4 tools)**: not proven wrong, lower priority, 3 of 4 already
   passed through human review once.
4. **Structural gap** (`opt_out_available` not persisted): worth a
   decision on its own, independent of any specific tool, since it caps
   how confidently *any* of this can ever be re-verified from stored data
   alone going forward.
