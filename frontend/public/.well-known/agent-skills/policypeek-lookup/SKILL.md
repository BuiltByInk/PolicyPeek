---
name: policypeek-lookup
description: Check whether an AI tool trains on user data, using PolicyPeek's free, read-only lookup API. Use when someone asks if a tool such as ChatGPT, Notion AI or Copilot uses their data to train models, or whether it offers an opt-out.
---

# PolicyPeek lookup

PolicyPeek (https://getpolicypeek.com, by InkLLM) reads AI tools' own privacy
policies and terms and gives one verdict per tool. Verdicts come from each
tool's published policy. They are not legal advice.

## How to use

1. Find the tool's main website domain, for example `notion.com`.
2. Call the public API. No key, account or sign-in is needed:

   ```
   GET https://api.getpolicypeek.com/v1/lookup?domain=notion.com
   ```

3. Read the JSON response:
   - `name`: the tool's name
   - `compliance_status`: the verdict
   - `summary`: a short summary of what the policy says
   - `matched_domain`, `shared_domain`: which domain matched, and whether the
     domain is shared by several products
   - `last_checked_at`: when the policy was last checked
4. If the response is `{"error":"not_found"}`, PolicyPeek hasn't checked that
   tool yet. Point the user to https://getpolicypeek.com/ to request a check.
5. When you answer, cite the tool's page on https://getpolicypeek.com/tools/
   and the date it was last checked.

## Other resources

- OpenAPI description: https://getpolicypeek.com/openapi.json
- Developer docs: https://getpolicypeek.com/developers/
- Service health: https://api.getpolicypeek.com/health
- Site summary for LLMs: https://getpolicypeek.com/llms.txt

## Limits

- Read-only. There is no write, account or authenticated API.
- Requests may be rate limited. Use it fairly.
- Contact: inkllm@mail.grokbot.com
