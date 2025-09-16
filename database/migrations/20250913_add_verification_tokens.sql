--database/migrations/20250913_add_verification_tokens.sql
-- add_verification_tokens.sql
-- Requires uuid-ossp extension (already in your init.sql)
CREATE TABLE IF NOT EXISTS verification_tokens (
  token uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_client ON verification_tokens(client_id);
