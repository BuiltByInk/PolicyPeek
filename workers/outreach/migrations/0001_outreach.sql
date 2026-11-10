-- PolicyPeek outreach database (its OWN D1 database: policypeek-outreach /
-- policypeek-outreach-dev). Never applied to policypeek-db. Not applied to any
-- remote database yet (local tests only).

-- Gate 2: recipients come ONLY from this table. Rows are loaded by
-- scripts/build-contacts-sql.mjs after the role + domain checks in
-- src/contacts.ts; nothing at runtime (HTTP, inbound mail) can insert here.
CREATE TABLE IF NOT EXISTS outreach_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_domain TEXT NOT NULL,
  -- why we're writing: a held listing, or a live listing whose wording is ambiguous
  kind TEXT NOT NULL CHECK (kind IN ('held', 'ambiguous_live')),
  contact_email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('privacy', 'dpo', 'legal', 'compliance', 'dataprotection', 'gdpr', 'press')),
  contact_source_url TEXT NOT NULL CHECK (contact_source_url LIKE 'https://%'),
  policy_url TEXT NOT NULL CHECK (policy_url LIKE 'https://%'),
  policy_label TEXT NOT NULL,
  -- per-tool context/question paragraph (plain text, the template's one data slot)
  question_text TEXT NOT NULL,
  vetted_by TEXT NOT NULL,
  vetted_at TEXT NOT NULL,
  -- Set only when the address is on another domain (parent company, older
  -- domain, or UK representative) and that exact address is on the tool's own
  -- policy page (Elliot 11:57 UK). The sender also re-checks it against the
  -- code list DOMAIN_MATCH_EXCEPTIONS, so this column alone never allows a send.
  domain_match_exception TEXT,
  -- sent_by_hand: Elliot emailed them himself; that email isn't in our system,
  -- so neither an initial nor a follow-up is ever sent automatically.
  -- MF10: 1 if this TOOL is on the held-outreach tracker (any row, including
  -- "form only" rows that never become contacts). Such a tool may have been
  -- contacted by hand, so it is blocked until the hand-sent list is received,
  -- whatever its kind (held or ambiguous_live).
  on_held_tracker INTEGER NOT NULL DEFAULT 0 CHECK (on_held_tracker IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('eligible', 'sent_by_hand', 'paused', 'resolved')),
  paused_reason TEXT,
  hand_sent_at TEXT,
  hand_sent_source TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status <> 'sent_by_hand' OR (hand_sent_at IS NOT NULL AND hand_sent_source IS NOT NULL)),
  UNIQUE (tool_slug, contact_email)
);

-- Gate 3: a row is inserted BEFORE each send; the send happens only if the
-- insert succeeded. UNIQUE(tool_slug, contact_email, kind) makes a second
-- initial or second follow-up impossible.
CREATE TABLE IF NOT EXISTS outreach_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES outreach_contacts (id),
  tool_slug TEXT NOT NULL,
  contact_email TEXT NOT NULL COLLATE NOCASE,
  recipient_domain TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'followup')),
  -- claimed = inserted, outcome unknown: counts as sent and is never retried
  status TEXT NOT NULL CHECK (status IN ('claimed', 'sent', 'failed')),
  message_id TEXT,
  error_code TEXT,
  claimed_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE (tool_slug, contact_email, kind)
);
CREATE INDEX IF NOT EXISTS idx_sends_domain ON outreach_sends (recipient_domain, claimed_at);
CREATE INDEX IF NOT EXISTS idx_sends_msgid ON outreach_sends (message_id);

-- Test-mode sends (only to the binding's fixed test destination). Never count as real sends.
CREATE TABLE IF NOT EXISTS outreach_test_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  message_id TEXT,
  error_code TEXT,
  sent_at TEXT NOT NULL
);

-- Gate 4: inbound mail to privacy@ (written ONLY by the reply Worker).
-- Metadata only (Elliot 11:28 UK, Security 11:29 UK): no body, no subject, no
-- attachments, no sender local part. Reply content lives only in Elliot's
-- Proton mailbox. Nothing reads this table to trigger a send, publish or verdict.
CREATE TABLE IF NOT EXISTS outreach_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT,
  matched_contact_id INTEGER REFERENCES outreach_contacts (id),
  match_method TEXT CHECK (match_method IN ('in_reply_to', 'references', 'sender_domain') OR match_method IS NULL),
  from_domain TEXT NOT NULL,
  message_id TEXT,
  received_at TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('reply', 'objection', 'auto_reply', 'bounce')),
  auth_spf TEXT,
  auth_dkim TEXT,
  auth_dmarc TEXT,
  raw_size INTEGER NOT NULL,
  forwarded INTEGER NOT NULL DEFAULT 0 CHECK (forwarded IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_replies_contact ON outreach_replies (matched_contact_id);

-- Card gate (Elliot 11:32 UK, rule replaced 11:39 UK). A contact is queued
-- or sent only if its tool has a row here with passes=1 or card_confirmed=1.
-- No row => blocked (fail closed). passes/gate_reason are written only by the
-- offline loader from tracker.csv + research/recheck-2026-11-10.md +
-- research/ambiguous-cards-2026-11-10.csv; if either research file is missing
-- every tool is blocked. card_confirmed is set ONLY by POST /admin/card-confirm.
CREATE TABLE IF NOT EXISTS card_gate (
  tool_slug TEXT PRIMARY KEY,
  flagged INTEGER NOT NULL DEFAULT 1 CHECK (flagged IN (0, 1)),
  passes INTEGER NOT NULL DEFAULT 0 CHECK (passes IN (0, 1)),
  gate_reason TEXT NOT NULL,
  card_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (card_confirmed IN (0, 1)),
  confirmed_by TEXT,
  confirmed_at TEXT,
  flag_source TEXT NOT NULL,
  -- MF7/MF9 verdict mirror (Security re-review 10 Nov). The Worker has no
  -- policypeek-db binding, so the loader / verdict refresh copies each tool's
  -- stored compliance_status from a read-only export. NULL = not in the public
  -- catalog (held/unpublished).
  --   basis: why passes=1 (steward_held | held_tracker | unclear_live) or blocked.
  --   verdict_at_load: status when the gate row was reviewed/generated.
  --   live_verdict / verdict_as_of: latest mirrored status and export time.
  -- Without a fresh mirror (VERDICT_MAX_AGE_HOURS) a passes=1 row is closed.
  basis TEXT NOT NULL DEFAULT 'blocked' CHECK (basis IN ('steward_held', 'held_tracker', 'unclear_live', 'blocked')),
  verdict_at_load TEXT,
  live_verdict TEXT,
  verdict_as_of TEXT,
  CHECK (card_confirmed = 0 OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK (passes = 0 OR basis <> 'blocked')
);

-- Gate 5: suppression keyed by address AND domain; checked before every send.
CREATE TABLE IF NOT EXISTS suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('address', 'domain')),
  value TEXT NOT NULL COLLATE NOCASE,
  reason TEXT NOT NULL CHECK (reason IN ('objection', 'bounce', 'complaint', 'manual', 'retention_purged')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (kind, value)
);

-- Gate 3: D1 paused flag (default paused) and daily cap. Default 5 (Elliot
-- 11:20 UK); code clamps any value to HARD_DAILY_MAX (5, Elliot/LIA).
CREATE TABLE IF NOT EXISTS outreach_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- held_hand_list_received: '0' until Jump/Elliot's list of held tools already
-- emailed by hand is loaded (11:37 UK); while '0' no 'held' contact is queued.
INSERT OR IGNORE INTO outreach_settings (key, value) VALUES ('paused', '1'), ('daily_cap', '5'), ('held_hand_list_received', '0');

-- Gate 6: purge log (counts only).
CREATE TABLE IF NOT EXISTS purge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL,
  replies_deleted INTEGER NOT NULL,
  sends_deleted INTEGER NOT NULL,
  contacts_deleted INTEGER NOT NULL
);
