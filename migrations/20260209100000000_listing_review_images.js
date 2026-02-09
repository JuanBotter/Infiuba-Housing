const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(
    path.join(__dirname, "20260209100000000_listing_review_images.sql"),
    "utf8",
  );
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE reviews
      DROP CONSTRAINT IF EXISTS reviews_image_urls_max_count;
    ALTER TABLE listings
      DROP CONSTRAINT IF EXISTS listings_image_urls_max_count;
    ALTER TABLE reviews
      DROP COLUMN IF EXISTS image_urls;
    ALTER TABLE listings
      DROP COLUMN IF EXISTS image_urls;
  `);
};
