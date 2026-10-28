#!/usr/bin/env bash
# LOCAL ONLY (--local, miniflare state in a temp dir; never --remote). Seeds origin/main's 59 tools, runs
# 2026-10-28-recheck, then proves for this package: a failing assert changes nothing; apply reaches 49 tools
# 17/14/12/1/4/1; the generated rollback restores every tools row and the held tools' changelog exactly;
# re-apply after rollback works. VARIANT=d1-old seeds github.com unrated + otter.ai not_compliant (as if
# 2026-10-24-copilot-otter never ran on D1), then runs that package first: the required run order.
set -euo pipefail
export PATH=/home/box/.local/node22/bin:$PATH
D=$(cd "$(dirname "$0")/.." && pwd); R="$D/../2026-10-28-recheck"; B="$D/../../backend"; S=$(mktemp -d)
cd "$B"; W="npx wrangler d1 execute policypeek-db --local --persist-to $S/state"
HELD="'copy.ai','jasper.ai','replit.com','runway.com','stability.ai','cursor.com','windsurf.com','midjourney.com','otter.ai'"
dump(){ $W --command="SELECT * FROM tools ORDER BY id" --json 2>/dev/null > "$1"; $W --command="SELECT c.* FROM compliance_changelog c JOIN tools t ON t.id=c.tool_id WHERE t.domain IN ($HELD) ORDER BY c.id" --json 2>/dev/null > "$1.log"; }
(cd "$D/../.." && python3 "$R/tools/gen_seed.py") > $S/seed.sql
for d in copy.ai cursor.com otter.ai; do echo "INSERT INTO compliance_changelog(tool_id,old_status,new_status,note) SELECT id,'unrated',compliance_status,'seed: extra history row' FROM tools WHERE domain='$d';" >> $S/seed.sql; done
if [ "${VARIANT:-}" = d1-old ]; then echo "UPDATE tools SET compliance_status='unrated' WHERE domain='github.com'; UPDATE tools SET compliance_status='not_compliant' WHERE domain='otter.ai';" >> $S/seed.sql; fi
$W --file=schema.sql >/dev/null 2>&1; $W --file=$S/seed.sql >/dev/null 2>&1
if [ "${VARIANT:-}" = d1-old ]; then $W --file="$D/../2026-10-24-copilot-otter/apply.sql" >/dev/null 2>&1 && echo "d1-old: ran 2026-10-24-copilot-otter first"; fi
$W --file="$R/apply.sql" --json > $S/r.json 2>&1 || { echo "FAIL: 2026-10-28-recheck did not apply"; grep -o "GUARD FAILED[^\"]*\|ASSERT FAILED[^\"]*" $S/r.json | sort -u; exit 1; }
dump $S/d0.json
sed "s/compliance_status = 'compliant') = 14/compliance_status = 'compliant') = 15/" "$D/apply.sql" > $S/fail.sql
$W --file=$S/fail.sql >/dev/null 2>&1 && { echo "FAIL: broken assert did not error"; exit 1; } || true; dump $S/d1.json
$W --file="$D/apply.sql" --json 2>/dev/null > $S/out.json || { echo "FAIL: apply errored"; grep -o 'GUARD FAILED[^"]*\|ASSERT FAILED[^"]*' $S/out.json; exit 1; }
dump $S/da.json
node "$D/tools/gen_rollback.mjs" $S/out.json > $S/rb.sql; $W --file=$S/rb.sql >/dev/null 2>&1; dump $S/d2.json
$W --file="$D/apply.sql" >/dev/null 2>&1 && echo "re-apply after rollback: ok" || echo "re-apply after rollback: FAILED"
python3 - "$S" "$D/../../frontend/data/tools.json" <<'PY'
import json,sys,collections;S=sys.argv[1];L=lambda f:json.load(open(f"{S}/{f}"))[0]['results']
a=L('d0.json');print('rows before:',len(a),'| held changelog rows:',len(L('d0.json.log')))
print('failed run unchanged:',a==L('d1.json'))
after={r['domain']:r for r in L('da.json')}
print('after rows:',len(after),dict(collections.Counter(r['compliance_status'] for r in after.values())))
tj={t['domain']:t for t in json.load(open(sys.argv[2]))}
print('D1 domains == tools.json domains:',set(after)==set(tj))
bad=[d for d in tj if after[d]['compliance_status']!=tj[d]['compliance_status'] or after[d]['summary']!=tj[d]['summary'] or json.loads(after[d]['source_urls'])!=tj[d]['source_urls']]
print('rows differing from tools.json (status/summary/sources):',bad)
print('rollback restores tools rows:',a==L('d2.json'))
print('rollback restores held changelog:',L('d0.json.log')==L('d2.json.log'))
PY
grep -o "ok: totals[^\"]*\|ok: 9 held" $S/out.json | sort -u
