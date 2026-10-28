#!/usr/bin/env bash
# LOCAL ONLY (--local, miniflare state in a temp dir; never --remote). Proves: a failing assert changes nothing;
# the real apply reaches the expected state; the generated rollback restores every tools row and Mailchimp's
# changelog exactly; re-apply after rollback works.
set -euo pipefail
export PATH=/home/box/.local/node22/bin:$PATH
D=$(cd "$(dirname "$0")/.." && pwd); B="$D/../../backend"; S=$(mktemp -d)
cd "$B"; W="npx wrangler d1 execute policypeek-db --local --persist-to $S/state"
dump(){ $W --command="SELECT * FROM tools ORDER BY id" --json 2>/dev/null > "$1"; $W --command="SELECT * FROM compliance_changelog WHERE tool_id = (SELECT id FROM tools WHERE domain='mailchimp.com') ORDER BY id" --json 2>/dev/null > "$1.log"; }
(cd "$D/../.." && python3 "$D/tools/gen_seed.py") > $S/seed.sql
$W --file=schema.sql >/dev/null 2>&1; $W --file=$S/seed.sql >/dev/null 2>&1; dump $S/d0.json
sed "s/compliance_status = 'compliant') = 14/compliance_status = 'compliant') = 15/" "$D/apply.sql" > $S/fail.sql
$W --file=$S/fail.sql >/dev/null 2>&1 && { echo "FAIL: broken assert did not error"; exit 1; } || true; dump $S/d1.json
$W --file="$D/apply.sql" --json 2>/dev/null > $S/out.json; dump $S/da.json
node "$D/tools/gen_rollback.mjs" $S/out.json > $S/rb.sql; $W --file=$S/rb.sql >/dev/null 2>&1; dump $S/d2.json
$W --file="$D/apply.sql" >/dev/null 2>&1 && echo "re-apply after rollback: ok" || echo "re-apply after rollback: FAILED"
python3 - "$S" <<'PY'
import json,sys;S=sys.argv[1];L=lambda f:json.load(open(f"{S}/{f}"))[0]['results']
a=L('d0.json');print('rows before:',len(a),'| mailchimp changelog rows:',len(L('d0.json.log')))
print('failed run unchanged:',a==L('d1.json'))
after={r['domain']:r for r in L('da.json')}
print('after rows:',len(after),'| perplexity:',after['perplexity.ai']['compliance_status'],after['perplexity.ai']['opt_out_available'],'| mailchimp present:','mailchimp.com' in after,'| notion:',after['notion.com']['compliance_status'],after['notion.com']['summary'][:40])
print('rollback restores tools rows:',a==L('d2.json'))
print('rollback restores mailchimp changelog:',L('d0.json.log')==L('d2.json.log'))
PY
grep -o "ok: [^\"]*\|queued_rechecks" $S/out.json | sort -u
