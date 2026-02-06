CREATE TABLE IF NOT EXISTS auth_rate_limit_buckets (
  scope TEXT NOT NULL,
  bucket_key_hash TEXT NOT NULL,
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  bucket_start TIMESTAMPTZ NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, bucket_key_hash, window_seconds, bucket_start)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_rate_limit_buckets_scope_not_blank'
  ) THEN
    ALTER TABLE auth_rate_limit_buckets
      ADD CONSTRAINT auth_rate_limit_buckets_scope_not_blank
      CHECK (LENGTH(BTRIM(scope)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_rate_limit_buckets_key_not_blank'
  ) THEN
    ALTER TABLE auth_rate_limit_buckets
      ADD CONSTRAINT auth_rate_limit_buckets_key_not_blank
      CHECK (LENGTH(BTRIM(bucket_key_hash)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_buckets_updated_at
  ON auth_rate_limit_buckets(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limit_buckets_scope_key
  ON auth_rate_limit_buckets(scope, bucket_key_hash, updated_at DESC);
