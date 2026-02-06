const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "005_drop_legacy_invites.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_consumed_reason_enum') THEN
        CREATE TYPE invite_consumed_reason_enum AS ENUM ('activated', 'superseded');
      END IF;
    END
    $$;

    CREATE TABLE IF NOT EXISTS auth_invites (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      role user_role_enum NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      consumed_reason invite_consumed_reason_enum,
      created_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_invites_token_hash_unique
      ON auth_invites(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_invites_email_pending
      ON auth_invites(email, consumed_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_invites_email_lower
      ON auth_invites((LOWER(email)));
  `);
};
