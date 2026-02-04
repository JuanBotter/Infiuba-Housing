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

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('survey', 'web')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
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

CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood);
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
