const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "20260210170000000_listing_favorites.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS listing_favorites;
  `);
};
