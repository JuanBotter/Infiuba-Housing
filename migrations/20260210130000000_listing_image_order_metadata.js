const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(
    path.join(__dirname, "20260210130000000_listing_image_order_metadata.sql"),
    "utf8",
  );
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE listings
    SET image_urls = COALESCE(image_urls[1:12], '{}'::text[])
    WHERE COALESCE(array_length(image_urls, 1), 0) > 12;

    ALTER TABLE listings
      DROP CONSTRAINT IF EXISTS listings_image_urls_max_count;

    ALTER TABLE listings
      ADD CONSTRAINT listings_image_urls_max_count
      CHECK (COALESCE(array_length(image_urls, 1), 0) <= 12);
  `);
};
