#!/usr/bin/env python3
"""Local-test seed: one tools row per entry in frontend/data/tools.json (43 at 7c53e10)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
tj = json.load(open(os.path.join(HERE, "../../../frontend/data/tools.json")))
q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
b = lambda v: "NULL" if v is None else str(int(v))
for i, t in enumerate(tj, 1):
    print(f"INSERT INTO tools(id,name,domain,compliance_status,trains_on_user_data,summary,source_urls,verified,shared_domain,auto_published) VALUES("
          f"{i},{q(t['name'])},{q(t['domain'])},{q(t['compliance_status'])},{b(t.get('trains_on_user_data'))},{q(t.get('summary'))},"
          f"{q(json.dumps(t['source_urls']))},1,{b(t.get('shared_domain') or 0)},{b(t.get('auto_published') or 0)});")
print("INSERT INTO pending_checks(domain,source_url,status) VALUES('suno.com','https://suno.com/privacy','extracted');")
