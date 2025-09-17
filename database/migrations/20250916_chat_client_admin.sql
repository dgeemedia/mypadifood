-- database/migrations/20250916_chat_client_admin.sql
-- Persist chat/messages tied to an order
CREATE TABLE IF NOT EXISTS order_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,    -- 'client' | 'admin' | 'vendor' | 'bot'
  sender_id uuid,               -- optional FK to clients/admins/vendors (nullable)
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- optional (e.g. extra price calc)
  read_by_admin BOOLEAN DEFAULT FALSE,
  read_by_client BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order_id ON order_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_created_at ON order_messages(created_at);
