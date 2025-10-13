-- schema_organized.sql
-- Organized, idempotent schema for MyPadiFood
-- Run with: psql -f schema_organized.sql -d your_database
-- ============================================================================

/* --------------------------
   0) Safety / session settings
   -------------------------- */
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ============================================================================

/* --------------------------
   1) Extensions (create-if-missing)
   -------------------------- */
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions (gen_random_uuid)';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
COMMENT ON EXTENSION "uuid-ossp" IS 'uuid_generate_v4() - optional fallback';

-- ============================================================================

/* --------------------------
   2) Sequences used by integer PKs (if any)
   -------------------------- */
CREATE SEQUENCE IF NOT EXISTS public.admin_notifications_id_seq
  AS integer START WITH 1 INCREMENT BY 1 CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.agent_lgas_id_seq
  AS integer START WITH 1 INCREMENT BY 1 CACHE 1;

-- ============================================================================

/* --------------------------
   3) Tables (ordered by dependencies)
   - Use gen_random_uuid() as default for uuid PKs
   -------------------------- */

CREATE TABLE IF NOT EXISTS public.admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'agent',
  region_state text,
  region_lga text,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  must_change_password boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  state text,
  lga text,
  address text,
  password_hash text NOT NULL,
  verified boolean DEFAULT false,
  -- wallet_balance kept for backward-compat; new wallet tables introduced later
  wallet_balance numeric(12,2) DEFAULT 0,
  latitude double precision,
  longitude double precision,
  location_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  must_change_password boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text,
  lga text,
  address text,
  phone text,
  email text,
  food_item text,
  base_price numeric,
  status text DEFAULT 'pending',
  latitude double precision,
  longitude double precision,
  location_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  vendor_id uuid,
  item text,
  status text DEFAULT 'pending',
  assigned_admin uuid,
  payment_method text,
  total_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  negotiated_total numeric,
  payment_provider text,
  payment_reference text,
  paid_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id integer PRIMARY KEY DEFAULT nextval('public.admin_notifications_id_seq'::regclass),
  order_id uuid,
  type text NOT NULL,
  payload jsonb,
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_notifications_backup_weeklyplan_fix (
  id integer PRIMARY KEY DEFAULT nextval('public.admin_notifications_id_seq'::regclass),
  order_id uuid,
  type text NOT NULL,
  payload jsonb,
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_reset_tokens (
  token text PRIMARY KEY,
  admin_id uuid,
  meta jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_lgas (
  id integer PRIMARY KEY DEFAULT nextval('public.agent_lgas_id_seq'::regclass),
  admin_id uuid NOT NULL,
  state text NOT NULL,
  lga text NOT NULL,
  CONSTRAINT agent_lgas_admin_id_state_lga_key UNIQUE (admin_id, state, lga)
);

CREATE TABLE IF NOT EXISTS public.session (
  sid character varying NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  provider text NOT NULL,
  event text,
  provider_reference text,
  amount numeric,
  currency text,
  status text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification_tokens (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- messages vs order_messages: preserve both tables if code uses either
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  sender_name text,
  message text NOT NULL,
  delivered boolean DEFAULT false,
  read_by_admin boolean DEFAULT false,
  read_by_client boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_by_admin boolean DEFAULT false,
  read_by_client boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Weekly plan orders + items + messages
CREATE TABLE IF NOT EXISTS public.weekly_plan_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  vendor_id uuid,
  week_of date NOT NULL,
  plan_type text NOT NULL,
  total_price numeric(12,2) DEFAULT 0 NOT NULL,
  payment_method text,
  payment_status text DEFAULT 'pending',
  status text DEFAULT 'pending',
  assigned_admin uuid,
  modifiable_from timestamptz,
  modifiable_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_order_id uuid NOT NULL,
  day_of_week text NOT NULL,
  slot integer DEFAULT 1 NOT NULL,
  food_key text NOT NULL,
  food_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_plan_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_order_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================

/* --------------------------
   Riders (migration consolidated)
   - trigger to set updated_at (generic)
   -------------------------- */
CREATE TABLE IF NOT EXISTS public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text NOT NULL,
  state text,
  lga text,
  address text,
  vehicle_type text,
  vehicle_number text,
  bank_name text,
  account_number text,
  password_hash text,
  id_type text,
  id_number text,
  id_file text,
  next_of_kin text,
  base_fee numeric,
  status text NOT NULL DEFAULT 'pending',
  latitude double precision,
  longitude double precision,
  location_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Make password_hash nullable if present as NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'riders' AND column_name = 'password_hash'
  ) THEN
    -- Only drop not null if currently not null-constrained
    IF (SELECT attnotnull FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        WHERE c.relname = 'riders' AND a.attname = 'password_hash') = true THEN
      EXECUTE 'ALTER TABLE public.riders ALTER COLUMN password_hash DROP NOT NULL';
    END IF;
  END IF;
END$$;

-- Generic timestamp trigger function (create or replace)
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- attach trigger to riders (safe create)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname = 'trg_riders_set_timestamp' AND c.relname = 'riders'
  ) THEN
    CREATE TRIGGER trg_riders_set_timestamp
      BEFORE UPDATE ON public.riders
      FOR EACH ROW
      EXECUTE PROCEDURE public.trigger_set_timestamp();
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_riders_state ON public.riders(state);
CREATE INDEX IF NOT EXISTS idx_riders_lga ON public.riders(lga);
CREATE INDEX IF NOT EXISTS idx_riders_phone ON public.riders(phone);
CREATE INDEX IF NOT EXISTS idx_riders_email ON public.riders(email);

-- ============================================================================

/* --------------------------
   4) Wallets & wallet transactions
   -------------------------- */
CREATE TABLE IF NOT EXISTS public.wallets (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('credit','debit')),
  reason text,
  provider text,
  provider_reference text,
  order_id uuid,
  note text,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_provider_ref_uniq
  ON public.wallet_transactions (provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_tx_client_idx
  ON public.wallet_transactions (client_id, created_at DESC);

-- ============================================================================

/* --------------------------
   5) Withdrawal requests table
   -------------------------- */
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  method text NOT NULL,
  destination jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  admin_id uuid,
  admin_note text,
  provider text,
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawals_client_idx ON public.withdrawal_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON public.withdrawal_requests (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_provider_ref_uniq
  ON public.withdrawal_requests (provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;

-- ============================================================================

/* --------------------------
   6) Indexes for other tables (create if missing)
   -------------------------- */
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.session (expire);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_order_id ON public.admin_notifications (order_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON public.admin_notifications (read);

CREATE INDEX IF NOT EXISTS admin_notifications_backup_weeklyplan_fix_order_id_idx
  ON public.admin_notifications_backup_weeklyplan_fix (order_id);
CREATE INDEX IF NOT EXISTS admin_notifications_backup_weeklyplan_fix_read_idx
  ON public.admin_notifications_backup_weeklyplan_fix (read);

CREATE INDEX IF NOT EXISTS admin_reset_tokens_admin_id_idx ON public.admin_reset_tokens (admin_id);

CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_latlon ON public.clients (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_vendors_state_lga ON public.vendors (state, lga);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors (status);
CREATE INDEX IF NOT EXISTS idx_vendors_latlon ON public.vendors (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON public.orders (vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_order ON public.messages (order_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at);

CREATE INDEX IF NOT EXISTS idx_order_messages_order_id ON public.order_messages (order_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_created_at ON public.order_messages (created_at);

CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON public.payments (provider_reference);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_client ON public.verification_tokens (client_id);

CREATE INDEX IF NOT EXISTS idx_weekly_plan_orders_client_week ON public.weekly_plan_orders (client_id, week_of);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_orders_status ON public.weekly_plan_orders (status);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_orders_created ON public.weekly_plan_orders (created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_week ON public.weekly_plan_items (weekly_plan_order_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_messages_plan ON public.weekly_plan_messages (weekly_plan_order_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_messages_created ON public.weekly_plan_messages (created_at);

-- ============================================================================

/* --------------------------
   7) Views
   -------------------------- */
CREATE OR REPLACE VIEW public.auditor_order_view AS
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
FROM public.orders o
LEFT JOIN public.clients c ON c.id = o.client_id
LEFT JOIN public.vendors v ON v.id = o.vendor_id
LEFT JOIN public.admins a ON a.id = o.assigned_admin;

-- ============================================================================

/* --------------------------
   8) Functions (create or replace)
   -------------------------- */
CREATE OR REPLACE FUNCTION public.fn_create_order_system_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert into order_messages (user-facing thread)
  INSERT INTO public.order_messages (order_id, sender_type, sender_id, message, metadata, created_at)
  VALUES (
    NEW.id,
    'bot',
    NULL,
    CONCAT('New order created by client. Order id: ', NEW.id::text),
    jsonb_build_object('auto_created', true, 'client_id', COALESCE(NEW.client_id::text, NULL), 'vendor_id', COALESCE(NEW.vendor_id::text, NULL)),
    now()
  );

  -- Audited messages
  INSERT INTO public.messages (order_id, sender_type, sender_id, sender_name, message, delivered, metadata, created_at)
  VALUES (
    NEW.id,
    'bot',
    NULL,
    'System',
    CONCAT('Order created (auto message) — id: ', NEW.id::text),
    TRUE,
    jsonb_build_object('auto_created', true),
    now()
  );

  -- Admin notification (persistent)
  INSERT INTO public.admin_notifications (order_id, type, payload, read, created_at)
  VALUES (
    NEW.id,
    'order_created',
    jsonb_build_object('order_id', NEW.id::text, 'client_id', COALESCE(NEW.client_id::text, NULL)),
    FALSE,
    now()
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_weeklyplan_system_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.admin_notifications (order_id, type, payload, read, created_at)
  VALUES (
    NULL,
    'weekly_plan_created',
    jsonb_build_object('weekly_plan_id', NEW.id::text, 'client_id', COALESCE(NEW.client_id::text, NULL)),
    FALSE,
    now()
  );
  RETURN NEW;
END;
$$;

-- ============================================================================

/* --------------------------
   9) Triggers (safe create)
   -------------------------- */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname = 'trg_order_after_insert_system_message' AND c.relname = 'orders'
  ) THEN
    CREATE TRIGGER trg_order_after_insert_system_message
      AFTER INSERT ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_create_order_system_message();
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname = 'trg_weekly_plan_after_insert_system_message' AND c.relname = 'weekly_plan_orders'
  ) THEN
    CREATE TRIGGER trg_weekly_plan_after_insert_system_message
      AFTER INSERT ON public.weekly_plan_orders
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_create_weeklyplan_system_message();
  END IF;
END$$;

-- ============================================================================

/* --------------------------
   10) Foreign keys (added if not present)
   -------------------------- */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_notifications_order_id_fkey') THEN
    ALTER TABLE public.admin_notifications
      ADD CONSTRAINT admin_notifications_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_reset_tokens_admin_id_fkey') THEN
    ALTER TABLE public.admin_reset_tokens
      ADD CONSTRAINT admin_reset_tokens_admin_id_fkey FOREIGN KEY (admin_id)
      REFERENCES public.admins(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_lgas_admin_id_fkey') THEN
    ALTER TABLE public.agent_lgas
      ADD CONSTRAINT agent_lgas_admin_id_fkey FOREIGN KEY (admin_id)
      REFERENCES public.admins(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_order_id_fkey') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_messages_order_id_fkey') THEN
    ALTER TABLE public.order_messages
      ADD CONSTRAINT order_messages_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_assigned_admin_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_assigned_admin_fkey FOREIGN KEY (assigned_admin)
      REFERENCES public.admins(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_client_id_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_vendor_id_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id)
      REFERENCES public.vendors(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_order_id_fkey') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'verification_tokens_client_id_fkey') THEN
    ALTER TABLE public.verification_tokens
      ADD CONSTRAINT verification_tokens_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_items_weekly_plan_order_id_fkey') THEN
    ALTER TABLE public.weekly_plan_items
      ADD CONSTRAINT weekly_plan_items_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id)
      REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_messages_weekly_plan_order_id_fkey') THEN
    ALTER TABLE public.weekly_plan_messages
      ADD CONSTRAINT weekly_plan_messages_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id)
      REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_orders_assigned_admin_fkey') THEN
    ALTER TABLE public.weekly_plan_orders
      ADD CONSTRAINT weekly_plan_orders_assigned_admin_fkey FOREIGN KEY (assigned_admin)
      REFERENCES public.admins(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_orders_client_id_fkey') THEN
    ALTER TABLE public.weekly_plan_orders
      ADD CONSTRAINT weekly_plan_orders_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_orders_vendor_id_fkey') THEN
    ALTER TABLE public.weekly_plan_orders
      ADD CONSTRAINT weekly_plan_orders_vendor_id_fkey FOREIGN KEY (vendor_id)
      REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transactions_client_id_fkey') THEN
    ALTER TABLE public.wallet_transactions
      ADD CONSTRAINT wallet_transactions_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_client_id_fkey') THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'withdrawal_requests_client_id_fkey') THEN
    ALTER TABLE public.withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

END$$;

-- ============================================================================

/* --------------------------
   11) Small helpful comments & final housekeeping
   -------------------------- */

-- Ensure weekly_plan_items.updated_at exists (if not already added above)
ALTER TABLE public.weekly_plan_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- End of organized schema script

-- migrations/2025xxxx_add_wallet_identifier.sql
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS wallet_identifier VARCHAR(50);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS wallet_identifier_locked boolean DEFAULT false;

-- Unique index for wallet_identifier (ignore NULL values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_wallet_identifier ON wallets (wallet_identifier) WHERE wallet_identifier IS NOT NULL;

-- Backfill wallet_identifier from clients.phone (attempt best-effort: last 10 digits)
UPDATE wallets w
SET wallet_identifier = sub
FROM (
  SELECT id AS client_id,
         right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 10) AS sub
  FROM clients
) c
WHERE w.client_id = c.client_id
  AND (w.wallet_identifier IS NULL OR w.wallet_identifier = '')
  AND c.sub IS NOT NULL
  AND length(c.sub) = 10;

-- Lock wallet_identifier for existing wallets we've backfilled
UPDATE wallets SET wallet_identifier_locked = true WHERE wallet_identifier IS NOT NULL;

ALTER TABLE wallets
ADD COLUMN wallet_uuid uuid DEFAULT gen_random_uuid();

ALTER TABLE wallets
ADD COLUMN created_at timestamp with time zone DEFAULT now();
