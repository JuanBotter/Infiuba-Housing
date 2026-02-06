const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "001_initial_schema.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = () => {
  throw new Error(
    "001_initial_schema is the irreversible baseline migration. Restore from backup instead of rolling this migration down.",
  );
};
