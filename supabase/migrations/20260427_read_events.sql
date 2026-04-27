-- ─────────────────────────────────────────────────────────────────────────────
-- read_events: tracks article open/close/browser events per user
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.read_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_id       integer,
  item_guid     text,
  event_type    text NOT NULL CHECK (event_type IN ('opened', 'closed', 'browser')),
  duration_sec  integer,          -- populated on 'closed' events
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS read_events_user_id_created_at
  ON public.read_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS read_events_user_feed
  ON public.read_events (user_id, feed_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.read_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_events_select" ON public.read_events;
CREATE POLICY "read_events_select"
  ON public.read_events FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "read_events_insert" ON public.read_events;
CREATE POLICY "read_events_insert"
  ON public.read_events FOR INSERT
  WITH CHECK (user_id = auth.uid());
