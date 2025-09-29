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

-- weekly_plan_orders
CREATE TABLE IF NOT EXISTS weekly_plan_orders (
    id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    admin_id INT REFERENCES admins(id) ON DELETE SET NULL,
    week_of DATE NOT NULL,
    plan_type VARCHAR(20) NOT NULL,
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    assigned_admin INT REFERENCES admins(id) ON DELETE SET NULL,
    modifiable_from TIMESTAMPTZ,
    modifiable_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- weekly_plan_items
CREATE TABLE IF NOT EXISTS weekly_plan_items (
    id SERIAL PRIMARY KEY,
    weekly_plan_order_id INT NOT NULL REFERENCES weekly_plan_orders(id) ON DELETE CASCADE,
    day_of_week VARCHAR(20) NOT NULL,
    slot SMALLINT NOT NULL DEFAULT 1,
    food_key TEXT NOT NULL,
    food_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- weekly_plan_messages
CREATE TABLE IF NOT EXISTS weekly_plan_messages (
    id SERIAL PRIMARY KEY,
    weekly_plan_order_id INT NOT NULL REFERENCES weekly_plan_orders(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL, -- 'client' or 'admin'
    sender_id INT,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fn_create_weeklyplan_system_message()
RETURNS trigger AS $$
BEGIN
  INSERT INTO admin_notifications (order_id, type, payload, read, created_at)
  VALUES (
    NULL, -- do not fill order_id with weekly-plan id
    'weekly_plan_created',
    jsonb_build_object('weekly_plan_id', NEW.id::text, 'client_id', COALESCE(NEW.client_id::text, NULL)),
    FALSE,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
