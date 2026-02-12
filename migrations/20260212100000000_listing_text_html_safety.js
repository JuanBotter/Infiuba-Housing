const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(
    path.join(__dirname, "20260212100000000_listing_text_html_safety.sql"),
    "utf8",
  );
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE listings
      DROP CONSTRAINT IF EXISTS listings_address_no_html_tag_chars,
      DROP CONSTRAINT IF EXISTS listings_neighborhood_no_html_tag_chars;
  `);
};
