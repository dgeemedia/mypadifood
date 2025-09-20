-- database/migrations/20250916_add_chat_and_audit_fields.sql
-- Add columns to orders for negotiated totals, payment refs, and create messages table.

-- ensure uuid & pgcrypto extensions exist (already present in init.sql)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add negotiated_total, payment_method and payment_reference columns if not present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='negotiated_total'
  ) THEN
    ALTER TABLE orders ADD COLUMN negotiated_total NUMERIC;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_reference'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_reference TEXT;
  END IF;

  -- payment_method may already exist as payment_method; if you use payment_provider name keep it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_provider'
  ) THEN
    -- we already store payment_method in earlier schema; keep both if desired
    ALTER TABLE orders ADD COLUMN payment_provider TEXT;
  END IF;
END$$;

-- Create messages table for chat
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- client | admin | bot/support
  sender_id uuid, -- optional reference to clients/admins
  message TEXT,
  metadata jsonb,
  read_by_admin BOOLEAN DEFAULT FALSE,
  read_by_client BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
