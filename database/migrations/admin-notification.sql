-- migrations/20250922_create_notifications.sql (fixed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- safe to run even if already present

CREATE TABLE IF NOT EXISTS admin_notifications (
  id SERIAL PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'order' | 'menu_update' | 'message' etc
  payload JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_order_id ON admin_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON admin_notifications(read);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE NULL;
