-- Migration: newsletter_sources feature
-- Run this manually in the Supabase SQL editor after 20260315000000_create_feed_items.sql
--
-- Changes:
--   1. feeds table       — add source_type column
--   2. feed_items table  — add newsletter-specific columns
--   3. New table         — newsletter_sources

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. feeds: add source_type
--    Valid values: 'rss' | 'newsletter'
--    All existing rows default to 'rss'.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE feeds
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'rss';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. feed_items: add newsletter-specific columns
--    Columns already added by the reading-pane migration are skipped via IF NOT EXISTS.
--    thumbnail_url, body_html, body_extracted_at, reading_time_minutes already exist.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE feed_items
  ADD COLUMN IF NOT EXISTS source_type          TEXT,
  ADD COLUMN IF NOT EXISTS email_message_id     TEXT,
  ADD COLUMN IF NOT EXISTS email_from           TEXT,
  ADD COLUMN IF NOT EXISTS email_received_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_online_url      TEXT;

-- Default existing rows to 'rss'
UPDATE feed_items SET source_type = 'rss' WHERE source_type IS NULL;

-- Index for fast newsletter item queries by message-id (duplicate check)
CREATE INDEX IF NOT EXISTS feed_items_email_message_id_idx
  ON feed_items (email_message_id)
  WHERE email_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. newsletter_sources
--    feed_id is INTEGER (not UUID) — feeds.id is serial/integer.
--    is_active defaults FALSE for auto-created sources (user must activate).
--    is_active defaults TRUE for manually created sources (set in app logic).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_sources (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_id          INTEGER     REFERENCES feeds(id) ON DELETE CASCADE,
  sender_email     TEXT        NOT NULL,
  sender_name      TEXT,
  display_name     TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  item_display_limit INT       NOT NULL DEFAULT 10,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_received_at TIMESTAMPTZ,
  item_count       INT         NOT NULL DEFAULT 0,

  -- One source per sender per user
  UNIQUE (user_id, sender_email)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_sources_user_id
  ON newsletter_sources (user_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_sources_sender
  ON newsletter_sources (sender_email);

ALTER TABLE newsletter_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own newsletter sources" ON newsletter_sources;
CREATE POLICY "Users manage own newsletter sources"
  ON newsletter_sources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
