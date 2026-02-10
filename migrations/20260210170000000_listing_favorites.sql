CREATE TABLE IF NOT EXISTS listing_favorites (
  user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email, listing_id),
  CONSTRAINT listing_favorites_user_email_non_empty CHECK (btrim(user_email) <> ''),
  CONSTRAINT listing_favorites_listing_id_non_empty CHECK (btrim(listing_id) <> '')
);

CREATE INDEX IF NOT EXISTS idx_listing_favorites_user_created
  ON listing_favorites(user_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_favorites_listing_id
  ON listing_favorites(listing_id);
