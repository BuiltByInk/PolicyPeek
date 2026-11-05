#!/usr/bin/env bash
# LOCAL ONLY (--local, temp dir; never --remote). Seeds origin/main's 61 tools, runs 2026-10-28-recheck then
# 2026-10-28-audit (the required order), then proves for this package: a broken assert changes nothing; apply gives
# runway.com == tools.json and totals 21/15/14/6/4/1; D1 == tools.json for all 61; rollback restores tools + changelog
# exactly; re-apply after rollback works; running it before the audit/recheck packages is refused by the guard.
set -euo pipefail
export PATH=/home/box/.local/node22/bin:$PATH
D=$(cd "$(dirname "$0")/.." && pwd); DU="$D/.."; B="$D/../../backend"; S=$(mktemp -d)
cd "$B"; W="npx wrangler d1 execute policypeek-db --local --persist-to $S/state"
dump(){ $W --command="SELECT * FROM tools ORDER BY id" --json 2>/dev/null > "$1"; $W --command="SELECT * FROM compliance_changelog ORDER BY id" --json 2>/dev/null > "$1.log"; }
(cd "$D/../.." && python3 "$DU/2026-10-28-recheck/tools/gen_seed.py") > $S/seed.sql
$W --file=schema.sql >/dev/null 2>&1; $W --file=$S/seed.sql >/dev/null 2>&1
$W --file="$D/apply.sql" >/dev/null 2>&1 && { echo "FAIL: ran before recheck/audit"; exit 1; } || echo "out-of-order run refused: ok"
$W --file="$DU/2026-10-28-recheck/apply.sql" >/dev/null 2>&1; $W --file="$DU/2026-10-28-audit/apply.sql" >/dev/null 2>&1
dump $S/d0.json
sed "s/compliance_status='not_compliant')=14/compliance_status='not_compliant')=15/" "$D/apply.sql" > $S/fail.sql
$W --file=$S/fail.sql >/dev/null 2>&1 && { echo "FAIL: broken assert did not error"; exit 1; } || true; dump $S/d1.json
$W --file="$D/apply.sql" --json 2>/dev/null > $S/out.json || { echo "FAIL: apply errored"; grep -o 'GUARD FAILED[^"]*\|ASSERT FAILED[^"]*' $S/out.json; exit 1; }
dump $S/da.json
node "$D/tools/gen_rollback.mjs" $S/out.json > $S/rb.sql; $W --file=$S/rb.sql >/dev/null 2>&1; dump $S/d2.json
$W --file="$D/apply.sql" >/dev/null 2>&1 && echo "re-apply after rollback: ok" || echo "re-apply after rollback: FAILED"
python3 - "$S" "$D/../../frontend/data/tools.json" <<'PY'
import json,sys,collections;S=sys.argv[1];L=lambda f:json.load(open(f"{S}/{f}"))[0]['results']
a=L('d0.json');print('rows before:',len(a));print('failed run unchanged:',a==L('d1.json') and L('d0.json.log')==L('d1.json.log'))
after={r['domain']:r for r in L('da.json')};print('after:',len(after),dict(collections.Counter(r['compliance_status'] for r in after.values())))
tj={t['domain']:t for t in json.load(open(sys.argv[2]))}
print('rows differing from tools.json:',[d for d in tj if after[d]['compliance_status']!=tj[d]['compliance_status'] or after[d]['summary']!=tj[d]['summary'] or json.loads(after[d]['source_urls'])!=tj[d]['source_urls']])
print('runway last_checked_at matches:',after['runway.com']['last_checked_at']==tj['runway.com']['last_checked_at'])
print('changelog rows added by apply:',len(L('da.json.log'))-len(L('d0.json.log')))
print('rollback restores tools:',a==L('d2.json'),'| changelog:',L('d0.json.log')==L('d2.json.log'))
PY
grep -o "ok: [^\"]*" $S/out.json | sort -u
