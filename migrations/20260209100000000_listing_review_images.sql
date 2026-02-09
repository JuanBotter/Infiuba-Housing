ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}'::text[];

UPDATE listings
SET image_urls = '{}'::text[]
WHERE image_urls IS NULL;

UPDATE reviews
SET image_urls = '{}'::text[]
WHERE image_urls IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_image_urls_max_count'
  ) THEN
    ALTER TABLE listings
      ADD CONSTRAINT listings_image_urls_max_count
      CHECK (COALESCE(array_length(image_urls, 1), 0) <= 12);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_image_urls_max_count'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_image_urls_max_count
      CHECK (COALESCE(array_length(image_urls, 1), 0) <= 6);
  END IF;
END $$;
