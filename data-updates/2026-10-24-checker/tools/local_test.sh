#!/usr/bin/env bash
# LOCAL ONLY (--local, miniflare state in a temp dir). Proves: a failing assert changes nothing; the real apply
# reaches the expected state; the generated rollback restores every row exactly (incl. deleting the Zapier insert).
set -euo pipefail
export PATH=/home/box/.local/node22/bin:$PATH
D=$(cd "$(dirname "$0")/.." && pwd); B="$D/../../backend"; S=$(mktemp -d)
cd "$B"; W="npx wrangler d1 execute policypeek-db --local --persist-to $S/state"
dump(){ $W --command="SELECT * FROM tools ORDER BY id" --json 2>/dev/null > "$1"; }
python3 "$D/tools/gen_seed.py" > $S/seed.sql
$W --file=schema.sql >/dev/null 2>&1; $W --file=$S/seed.sql >/dev/null 2>&1; dump $S/d0.json
sed "s/compliance_status = 'compliant') = 11/compliance_status = 'compliant') = 12/" "$D/apply.sql" > $S/fail.sql
$W --file=$S/fail.sql >/dev/null 2>&1 && { echo "FAIL: broken assert did not error"; exit 1; } || true; dump $S/d1.json
$W --file="$D/apply.sql" --json 2>/dev/null > $S/out.json; dump $S/da.json
node "$D/tools/gen_rollback.mjs" $S/out.json > $S/rb.sql; $W --file=$S/rb.sql >/dev/null 2>&1; dump $S/d2.json
$W --file="$D/apply.sql" >/dev/null 2>&1 && echo "re-apply after rollback: ok" || echo "re-apply after rollback: FAILED"
python3 - "$S" <<'PY'
import json,sys;S=sys.argv[1];L=lambda f:json.load(open(f"{S}/{f}"))[0]['results']
a=L('d0.json');print('rows before:',len(a));print('failed run unchanged:',a==L('d1.json'))
after={r['domain']:r for r in L('da.json')};print('after rows:',len(after),'| zapier:',after['zapier.com']['compliance_status'],after['zapier.com']['manual_override'],'| perplexity:',after['perplexity.ai']['compliance_status'],after['perplexity.ai']['manual_override'])
print('rollback restores:',a==L('d2.json'))
PY
grep -o "ok: [^\"]*\|queued_rechecks" $S/out.json | sort -u
