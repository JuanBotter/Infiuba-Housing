import { Pool } from "pg";
import "./load-env.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to initialize Postgres schema.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const schemaSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
    CREATE TYPE user_role_enum AS ENUM ('whitelisted', 'admin');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_source_enum') THEN
    CREATE TYPE review_source_enum AS ENUM ('survey', 'web');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_status_enum') THEN
    CREATE TYPE review_status_enum AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_consumed_reason_enum') THEN
    CREATE TYPE invite_consumed_reason_enum AS ENUM ('activated', 'superseded');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS dataset_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  generated_at TIMESTAMPTZ,
  source_file TEXT,
  total_listings INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  price_usd NUMERIC,
  capacity NUMERIC,
  average_rating NUMERIC,
  recommendation_rate NUMERIC,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  recent_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_contacts (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  contact TEXT NOT NULL,
  UNIQUE (listing_id, contact)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role user_role_enum NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role user_role_enum;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS role user_role_enum;
ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;
ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS consumed_reason invite_consumed_reason_enum;
ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE auth_invites
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  source review_source_enum NOT NULL,
  status review_status_enum NOT NULL,
  year INTEGER,
  rating NUMERIC,
  recommended BOOLEAN,
  comment TEXT,
  comment_en TEXT,
  comment_es TEXT,
  comment_fr TEXT,
  comment_de TEXT,
  comment_pt TEXT,
  comment_it TEXT,
  comment_no TEXT,
  student_contact TEXT,
  student_name TEXT,
  student_email TEXT,
  allow_contact_sharing BOOLEAN NOT NULL DEFAULT FALSE,
  semester TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ
);

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS source review_source_enum;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS status review_status_enum;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_en TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_es TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_fr TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_de TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_pt TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_it TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS comment_no TEXT;
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS allow_contact_sharing BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND column_name = 'comment_translations'
  ) THEN
    UPDATE reviews
    SET
      comment_en = COALESCE(comment_en, NULLIF(BTRIM(comment_translations ->> 'en'), '')),
      comment_es = COALESCE(comment_es, NULLIF(BTRIM(comment_translations ->> 'es'), '')),
      comment_fr = COALESCE(comment_fr, NULLIF(BTRIM(comment_translations ->> 'fr'), '')),
      comment_de = COALESCE(comment_de, NULLIF(BTRIM(comment_translations ->> 'de'), '')),
      comment_pt = COALESCE(comment_pt, NULLIF(BTRIM(comment_translations ->> 'pt'), '')),
      comment_it = COALESCE(comment_it, NULLIF(BTRIM(comment_translations ->> 'it'), '')),
      comment_no = COALESCE(comment_no, NULLIF(BTRIM(comment_translations ->> 'no'), ''));

    ALTER TABLE reviews
      DROP COLUMN comment_translations;
  END IF;
END
$$;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'users'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'auth_invites'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE auth_invites DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'auth_invites'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%consumed_reason%'
  LOOP
    EXECUTE format('ALTER TABLE auth_invites DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'reviews'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'reviews'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE reviews DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

UPDATE dataset_meta
SET total_listings = 0
WHERE total_listings IS NULL OR total_listings < 0;

UPDATE listings
SET
  address = COALESCE(NULLIF(BTRIM(address), ''), CONCAT('Unknown address ', id)),
  neighborhood = COALESCE(NULLIF(BTRIM(neighborhood), ''), 'Unknown'),
  total_reviews = GREATEST(COALESCE(total_reviews, 0), 0),
  price_usd = CASE WHEN price_usd IS NOT NULL AND price_usd <= 0 THEN NULL ELSE price_usd END,
  capacity = CASE WHEN capacity IS NOT NULL AND capacity <= 0 THEN NULL ELSE capacity END,
  average_rating = CASE
    WHEN average_rating IS NOT NULL AND (average_rating < 1 OR average_rating > 5) THEN NULL
    ELSE average_rating
  END,
  recommendation_rate = CASE
    WHEN recommendation_rate IS NOT NULL AND (recommendation_rate < 0 OR recommendation_rate > 1) THEN NULL
    ELSE recommendation_rate
  END,
  recent_year = CASE
    WHEN recent_year IS NOT NULL AND (recent_year < 1900 OR recent_year > 2100) THEN NULL
    ELSE recent_year
  END,
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

UPDATE listings
SET latitude = NULL,
    longitude = NULL
WHERE (latitude IS NULL) <> (longitude IS NULL)
  OR (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
  OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180));

UPDATE listing_contacts
SET contact = BTRIM(contact)
WHERE contact IS NOT NULL;

DELETE FROM listing_contacts
WHERE contact IS NULL OR contact = '';

UPDATE users
SET email = LOWER(BTRIM(email))
WHERE email IS NOT NULL;

UPDATE users
SET email = CONCAT('unknown-user-', id::text, '@invalid.local')
WHERE email IS NULL OR email = '';

UPDATE users
SET role = 'whitelisted'
WHERE role IS NULL OR role::text NOT IN ('whitelisted', 'admin');

UPDATE users
SET password_hash = 'disabled'
WHERE password_hash IS NULL OR BTRIM(password_hash) = '';

UPDATE users
SET is_active = COALESCE(is_active, FALSE),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW());

UPDATE users
SET is_active = FALSE
WHERE password_hash = 'disabled';

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email)
      ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS row_number
  FROM users
)
UPDATE users AS target
SET email = CONCAT('dedup+', target.id::text, '@invalid.local'),
    is_active = FALSE,
    updated_at = NOW()
FROM ranked
WHERE ranked.row_number > 1
  AND ranked.id = target.id;

UPDATE auth_invites
SET email = LOWER(BTRIM(email))
WHERE email IS NOT NULL;

UPDATE auth_invites
SET email = CONCAT('unknown-invite-', id::text, '@invalid.local')
WHERE email IS NULL OR email = '';

UPDATE auth_invites
SET role = 'whitelisted'
WHERE role IS NULL OR role::text NOT IN ('whitelisted', 'admin');

UPDATE auth_invites
SET token_hash = CONCAT('invalid-', id::text, '-', md5(random()::text || clock_timestamp()::text))
WHERE token_hash IS NULL OR BTRIM(token_hash) = '';

UPDATE auth_invites
SET expires_at = COALESCE(expires_at, NOW()),
    created_at = COALESCE(created_at, NOW());

UPDATE auth_invites
SET consumed_reason = 'superseded'
WHERE consumed_reason::text = 'replaced';

UPDATE auth_invites
SET consumed_reason = NULL
WHERE consumed_reason IS NOT NULL
  AND consumed_reason::text NOT IN ('activated', 'superseded');

UPDATE auth_invites
SET consumed_reason = 'activated'
WHERE consumed_at IS NOT NULL
  AND consumed_reason IS NULL;

UPDATE auth_invites
SET consumed_reason = NULL
WHERE consumed_at IS NULL;

DO $$
DECLARE source_udt TEXT;
BEGIN
  SELECT c.udt_name
  INTO source_udt
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'reviews'
    AND c.column_name = 'source';

  IF source_udt = 'review_source_enum' THEN
    EXECUTE $sql$
      UPDATE reviews
      SET source = CASE
        WHEN source::text = 'survey' THEN 'survey'::review_source_enum
        WHEN source::text = 'web' THEN 'web'::review_source_enum
        WHEN id LIKE 'web-%' THEN 'web'::review_source_enum
        ELSE 'survey'::review_source_enum
      END
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE reviews
      SET source = CASE
        WHEN source::text = 'survey' THEN 'survey'
        WHEN source::text = 'web' THEN 'web'
        WHEN id LIKE 'web-%' THEN 'web'
        ELSE 'survey'
      END
    $sql$;
  END IF;
END
$$;

DO $$
DECLARE status_udt TEXT;
BEGIN
  SELECT c.udt_name
  INTO status_udt
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'reviews'
    AND c.column_name = 'status';

  IF status_udt = 'review_status_enum' THEN
    EXECUTE $sql$
      UPDATE reviews
      SET status = CASE
        WHEN status::text = 'pending' THEN 'pending'::review_status_enum
        WHEN status::text = 'approved' THEN 'approved'::review_status_enum
        WHEN status::text = 'rejected' THEN 'rejected'::review_status_enum
        WHEN source::text = 'survey' THEN 'approved'::review_status_enum
        ELSE 'pending'::review_status_enum
      END
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE reviews
      SET status = CASE
        WHEN status::text = 'pending' THEN 'pending'
        WHEN status::text = 'approved' THEN 'approved'
        WHEN status::text = 'rejected' THEN 'rejected'
        WHEN source::text = 'survey' THEN 'approved'
        ELSE 'pending'
      END
    $sql$;
  END IF;
END
$$;

UPDATE reviews
SET rating = NULL
WHERE rating IS NOT NULL
  AND (rating < 1 OR rating > 5);

UPDATE reviews
SET year = NULL
WHERE year IS NOT NULL
  AND (year < 1900 OR year > 2100);

UPDATE reviews
SET allow_contact_sharing = COALESCE(allow_contact_sharing, FALSE),
    created_at = COALESCE(created_at, NOW());

UPDATE reviews
SET approved_at = COALESCE(approved_at, created_at)
WHERE status::text = 'approved'
  AND approved_at IS NULL;

UPDATE reviews
SET approved_at = NULL
WHERE status::text <> 'approved';

ALTER TABLE users
  ALTER COLUMN role TYPE user_role_enum
  USING role::text::user_role_enum;

ALTER TABLE auth_invites
  ALTER COLUMN role TYPE user_role_enum
  USING role::text::user_role_enum;

ALTER TABLE auth_invites
  ALTER COLUMN consumed_reason TYPE invite_consumed_reason_enum
  USING CASE
    WHEN consumed_reason IS NULL THEN NULL
    ELSE consumed_reason::text::invite_consumed_reason_enum
  END;

ALTER TABLE reviews
  ALTER COLUMN source TYPE review_source_enum
  USING source::text::review_source_enum;

ALTER TABLE reviews
  ALTER COLUMN status TYPE review_status_enum
  USING status::text::review_status_enum;

ALTER TABLE users
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN password_hash SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE auth_invites
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN token_hash SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE reviews
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN allow_contact_sharing SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dataset_meta_total_listings_non_negative'
  ) THEN
    ALTER TABLE dataset_meta
      ADD CONSTRAINT dataset_meta_total_listings_non_negative
      CHECK (total_listings >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_address_not_blank'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_address_not_blank
      CHECK (BTRIM(address) <> '');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_neighborhood_not_blank'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_neighborhood_not_blank
      CHECK (BTRIM(neighborhood) <> '');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_total_reviews_non_negative'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_total_reviews_non_negative
      CHECK (total_reviews >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_coordinates_pair_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_coordinates_pair_check
      CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_latitude_range_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_latitude_range_check
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_longitude_range_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_longitude_range_check
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_average_rating_range_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_average_rating_range_check
      CHECK (average_rating IS NULL OR (average_rating >= 1 AND average_rating <= 5));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_recommendation_rate_range_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_recommendation_rate_range_check
      CHECK (recommendation_rate IS NULL OR (recommendation_rate >= 0 AND recommendation_rate <= 1));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_capacity_positive_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_capacity_positive_check
      CHECK (capacity IS NULL OR capacity > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_price_positive_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_price_positive_check
      CHECK (price_usd IS NULL OR price_usd > 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_recent_year_range_check'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_recent_year_range_check
      CHECK (recent_year IS NULL OR (recent_year >= 1900 AND recent_year <= 2100));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listing_contacts_contact_not_blank'
  ) THEN
    ALTER TABLE listing_contacts
      ADD CONSTRAINT listing_contacts_contact_not_blank
      CHECK (BTRIM(contact) <> '');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_email_not_blank'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_not_blank
      CHECK (BTRIM(email) <> '');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_invites_email_not_blank'
  ) THEN
    ALTER TABLE auth_invites
      ADD CONSTRAINT auth_invites_email_not_blank
      CHECK (BTRIM(email) <> '');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_invites_consumed_consistency_check'
  ) THEN
    ALTER TABLE auth_invites
      ADD CONSTRAINT auth_invites_consumed_consistency_check
      CHECK (
        (consumed_at IS NULL AND consumed_reason IS NULL)
        OR (consumed_at IS NOT NULL AND consumed_reason IS NOT NULL)
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_invites_consumed_after_created_check'
  ) THEN
    ALTER TABLE auth_invites
      ADD CONSTRAINT auth_invites_consumed_after_created_check
      CHECK (consumed_at IS NULL OR consumed_at >= created_at);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_rating_range_check'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_rating_range_check
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_year_range_check'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_year_range_check
      CHECK (year IS NULL OR (year >= 1900 AND year <= 2100));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_approved_at_consistency_check'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_approved_at_consistency_check
      CHECK (
        (status::text = 'approved' AND approved_at IS NOT NULL)
        OR (status::text <> 'approved' AND approved_at IS NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users((LOWER(email)));
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_invites_token_hash_unique ON auth_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_invites_email_pending ON auth_invites(email, consumed_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_invites_email_lower ON auth_invites((LOWER(email)));
CREATE INDEX IF NOT EXISTS idx_reviews_listing_status ON reviews(listing_id, status, source);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews(status, created_at DESC);
`;

async function run() {
  await pool.query(schemaSql);
  console.log("Postgres schema initialized.");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
