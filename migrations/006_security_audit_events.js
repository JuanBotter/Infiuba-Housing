const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "006_security_audit_events.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_security_audit_events_event_type_created;
    DROP INDEX IF EXISTS idx_security_audit_events_outcome_created;
    DROP INDEX IF EXISTS idx_security_audit_events_created_at;
    DROP TABLE IF EXISTS security_audit_events;
  `);
};
