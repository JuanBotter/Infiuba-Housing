CREATE TABLE IF NOT EXISTS security_audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_email TEXT,
  target_email TEXT,
  ip_key_hash TEXT,
  subnet_key_hash TEXT,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'security_audit_events_event_type_not_blank'
  ) THEN
    ALTER TABLE security_audit_events
      ADD CONSTRAINT security_audit_events_event_type_not_blank
      CHECK (LENGTH(BTRIM(event_type)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'security_audit_events_outcome_not_blank'
  ) THEN
    ALTER TABLE security_audit_events
      ADD CONSTRAINT security_audit_events_outcome_not_blank
      CHECK (LENGTH(BTRIM(outcome)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_security_audit_events_created_at
  ON security_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_events_event_type_created
  ON security_audit_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_events_outcome_created
  ON security_audit_events(outcome, created_at DESC);
