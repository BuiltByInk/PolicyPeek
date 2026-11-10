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
  status TEXT NOT NULL DEFAULT 'eligible' CHECK (status IN ('eligible', 'already_contacted', 'paused', 'resolved')),
  hand_sent_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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

-- Card gate (Elliot 11:32 UK): a tool flagged in ambiguous-cards-2026-11-10.csv
-- is never queued or sent until Elliot approves its re-checked verdict. A tool
-- with NO row here is treated as flagged (fail closed). The loader writes only
-- flagged=0/1 and never card_confirmed; only POST /admin/card-confirm sets it.
CREATE TABLE IF NOT EXISTS card_gate (
  tool_slug TEXT PRIMARY KEY,
  flagged INTEGER NOT NULL DEFAULT 1 CHECK (flagged IN (0, 1)),
  card_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (card_confirmed IN (0, 1)),
  confirmed_by TEXT,
  confirmed_at TEXT,
  flag_source TEXT NOT NULL,
  CHECK (card_confirmed = 0 OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL))
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

-- Gate 3: D1 paused flag (default paused) and daily cap. Code clamps the cap
-- to HARD_DAILY_MAX (5, Elliot/LIA); the default here is Security's 3.
CREATE TABLE IF NOT EXISTS outreach_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO outreach_settings (key, value) VALUES ('paused', '1'), ('daily_cap', '3');

-- Gate 6: purge log (counts only).
CREATE TABLE IF NOT EXISTS purge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL,
  replies_deleted INTEGER NOT NULL,
  sends_deleted INTEGER NOT NULL,
  contacts_deleted INTEGER NOT NULL
);
