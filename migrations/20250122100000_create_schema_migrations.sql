-- UP
-- This migration is automatically handled by the migration runner
-- but included here for documentation purposes

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(255) PRIMARY KEY,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  filename VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at
  ON schema_migrations(executed_at);

-- DOWN
DROP TABLE IF EXISTS schema_migrations;
