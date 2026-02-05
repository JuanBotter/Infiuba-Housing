const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "001_initial_schema.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = () => {};
