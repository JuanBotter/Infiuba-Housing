const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "004_dataset_meta_bootstrap.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = () => {};
