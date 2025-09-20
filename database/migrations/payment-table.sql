-- add_payments_table.sql
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  provider text NOT NULL,                -- 'paystack' | 'flutterwave' | etc.
  event text,                            -- provider event type (e.g. 'charge.success')
  provider_reference text,               -- provider reference / tx_ref / transaction id
  amount numeric,
  currency text,
  status text,                            -- provider status string
  raw jsonb,                              -- full provider payload / verification response
  created_at timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON payments(provider_reference);
