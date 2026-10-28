#!/usr/bin/env python3
"""Local-test seed: one tools row per entry in origin/main's frontend/data/tools.json (59 tools, the
pre-update state). perplexity.ai is seeded with manual_override = 1, as on live after 2026-10-24-checker."""
import json, subprocess
tj = json.loads(subprocess.check_output(["git", "show", "origin/main:frontend/data/tools.json"]))
q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
b = lambda v: "NULL" if v is None else str(int(v))
for i, t in enumerate(tj, 1):
    print(f"INSERT INTO tools(id,name,domain,compliance_status,trains_on_user_data,summary,source_urls,verified,shared_domain,auto_published,last_checked_at,manual_override) VALUES("
          f"{i},{q(t['name'])},{q(t['domain'])},{q(t['compliance_status'])},{b(t.get('trains_on_user_data'))},{q(t.get('summary'))},"
          f"{q(json.dumps(t['source_urls']))},1,{b(t.get('shared_domain') or 0)},{b(t.get('auto_published') or 0)},{q(t.get('last_checked_at'))},{1 if t['domain']=='perplexity.ai' else 0});")
print("UPDATE tools SET compliance_status = compliance_status WHERE domain = 'mailchimp.com';")
print("INSERT INTO compliance_changelog(tool_id,old_status,new_status,note) SELECT id,'unrated','not_compliant','seed: extra history row' FROM tools WHERE domain='mailchimp.com';")
print("INSERT INTO pending_checks(domain,source_url,status) VALUES('mailchimp.com','https://mailchimp.com/legal/terms/','extracted');")
