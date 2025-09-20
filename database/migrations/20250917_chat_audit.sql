-- 20250917_chat_audit.sql
-- 1) messages table for client/admin/support chat (if not existing)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,           -- 'client' | 'admin' | 'support' | 'bot'
  sender_id uuid NULL,                 -- foreign key to clients/admins when applicable
  sender_name TEXT NULL,               -- cached display name (for audit)
  message TEXT NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,     -- whether the server emitted to recipients
  read_by_admin BOOLEAN DEFAULT FALSE,
  read_by_client BOOLEAN DEFAULT FALSE,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_order ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- 2) Add columns for audit & preferences to clients and admins
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT FALSE;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT FALSE;

-- 3) Add payment related fields (if missing)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS negotiated_total numeric,
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp;

-- 4) Convenience view (for auditor exports): join orders, clients, assigned admin
CREATE OR REPLACE VIEW auditor_order_view AS
SELECT
  o.id AS order_id,
  o.client_id,
  c.full_name AS client_name,
  c.phone AS client_phone,
  c.state AS client_state,
  c.lga AS client_lga,
  o.vendor_id,
  v.name AS vendor_name,
  o.assigned_admin AS assigned_admin_id,
  a.name AS assigned_admin_name,
  o.status,
  o.total_amount,
  o.negotiated_total,
  o.payment_provider,
  o.payment_reference,
  o.created_at AS order_created_at
FROM orders o
LEFT JOIN clients c ON c.id = o.client_id
LEFT JOIN vendors v ON v.id = o.vendor_id
LEFT JOIN admins a ON a.id = o.assigned_admin;

-- 5) Helper function to export CSV server-side can be derived from the view; no function required here.
