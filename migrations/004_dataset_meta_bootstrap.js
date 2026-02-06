const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "004_dataset_meta_bootstrap.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM dataset_meta
    WHERE id = 1
      AND source_file IS NULL
      AND COALESCE(total_listings, 0) = 0;
  `);
};
