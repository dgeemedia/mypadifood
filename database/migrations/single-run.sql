-- schema_organized.sql
-- Organized, idempotent schema for MyPadiFood
-- Run with psql or pgAdmin Query Tool.

-- ============================================================================
-- 0) Session / safety settings (safe to run repeatedly)
-- ============================================================================
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ============================================================================
-- 1) Extensions (create if missing)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';

-- NOTE: gen_random_uuid() is provided by pgcrypto (or pgcrypto/gen_random_uuid depending on PG)
-- If you use gen_random_uuid() from pgcrypto, ensure pgcrypto is available.

-- ============================================================================
-- 2) Sequences (create-if-missing)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.admin_notifications_id_seq
  AS integer START WITH 1 INCREMENT BY 1 CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.agent_lgas_id_seq
  AS integer START WITH 1 INCREMENT BY 1 CACHE 1;

-- ============================================================================
-- 3) Tables (CREATE TABLE IF NOT EXISTS) - ordered by dependencies
--    Primary keys and NOT NULL constraints declared inline where possible
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admins (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'agent',
  region_state text,
  region_lga text,
  active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  must_change_password boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text NOT NULL,
  state text,
  lga text,
  address text,
  password_hash text NOT NULL,
  verified boolean DEFAULT false,
  wallet_balance numeric DEFAULT 0,
  latitude double precision,
  longitude double precision,
  location_source text,
  created_at timestamp without time zone DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  must_change_password boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
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
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  client_id uuid,
  vendor_id uuid,
  item text,
  status text DEFAULT 'pending',
  assigned_admin uuid,
  payment_method text,
  total_amount numeric,
  created_at timestamp without time zone DEFAULT now(),
  negotiated_total numeric,
  payment_provider text,
  payment_reference text,
  paid_at timestamp without time zone,
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id integer PRIMARY KEY DEFAULT nextval('public.admin_notifications_id_seq'::regclass),
  order_id uuid,
  type text NOT NULL,
  payload jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- backup table (kept in your dump)
CREATE TABLE IF NOT EXISTS public.admin_notifications_backup_weeklyplan_fix (
  id integer PRIMARY KEY DEFAULT nextval('public.admin_notifications_id_seq'::regclass),
  order_id uuid,
  type text NOT NULL,
  payload jsonb,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_reset_tokens (
  token text PRIMARY KEY,
  admin_id uuid,
  meta jsonb,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
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
  expire timestamp(6) without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  order_id uuid,
  provider text NOT NULL,
  event text,
  provider_reference text,
  amount numeric,
  currency text,
  status text,
  raw jsonb,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification_tokens (
  token uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  client_id uuid,
  expires_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now()
);

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
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  order_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  read_by_admin boolean DEFAULT false,
  read_by_client boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now()
);

-- Weekly plan tables
CREATE TABLE IF NOT EXISTS public.weekly_plan_orders (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  client_id uuid NOT NULL,
  vendor_id uuid,
  week_of date NOT NULL,
  plan_type text NOT NULL,
  total_price bigint DEFAULT 0 NOT NULL,
  payment_method text,
  payment_status text DEFAULT 'pending',
  status text DEFAULT 'pending',
  assigned_admin uuid,
  modifiable_from timestamp with time zone,
  modifiable_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_plan_items (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  weekly_plan_order_id uuid NOT NULL,
  day_of_week text NOT NULL,
  slot integer DEFAULT 1 NOT NULL,
  food_key text NOT NULL,
  food_label text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_plan_messages (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  weekly_plan_order_id uuid NOT NULL,
  sender_type text NOT NULL,
  sender_id uuid,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- ============================================================================
-- 4) Indexes
-- ============================================================================
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
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages (created_at);

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
-- 5) Views
-- ============================================================================
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
-- 6) Functions (create or replace)
--    - system messages and weekly plan notification helper functions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_create_order_system_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- create a system message in order_messages so admins/clients see an initial chat entry
  INSERT INTO order_messages (order_id, sender_type, sender_id, message, metadata, created_at)
  VALUES (
    NEW.id,
    'bot',
    NULL,
    CONCAT('New order created by client. Order id: ', NEW.id::text),
    jsonb_build_object(
      'auto_created', true,
      'client_id', COALESCE(NEW.client_id::text, NULL),
      'vendor_id', COALESCE(NEW.vendor_id::text, NULL)
    ),
    NOW()
  );

  -- Also insert in messages audit table (if you use it)
  INSERT INTO messages (order_id, sender_type, sender_id, sender_name, message, delivered, metadata, created_at)
  VALUES (
    NEW.id,
    'bot',
    NULL,
    'System',
    CONCAT('Order created (auto message) — id: ', NEW.id::text),
    TRUE,
    jsonb_build_object('auto_created', true),
    NOW()
  );

  -- Create a persistent admin notification for quick discoverability
  INSERT INTO admin_notifications (order_id, type, payload, read, created_at)
  VALUES (
    NEW.id,
    'order_created',
    jsonb_build_object('order_id', NEW.id::text, 'client_id', COALESCE(NEW.client_id::text, NULL)),
    FALSE,
    NOW()
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_create_weeklyplan_system_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

-- ============================================================================
-- 7) Triggers (create only if not existing)
--    We'll check existence in catalog before creating to avoid duplicates
-- ============================================================================
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
-- 8) Foreign keys (deferred-add where required)
--    In many cases we declared PKs inline; add FK constraints in safe checks
-- ============================================================================
-- helper DO block to add FK only if not present
DO $$
BEGIN
  -- admin_notifications.order_id -> orders.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_notifications_order_id_fkey'
  ) THEN
    ALTER TABLE public.admin_notifications
      ADD CONSTRAINT admin_notifications_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  -- admin_reset_tokens.admin_id -> admins.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_reset_tokens_admin_id_fkey'
  ) THEN
    ALTER TABLE public.admin_reset_tokens
      ADD CONSTRAINT admin_reset_tokens_admin_id_fkey FOREIGN KEY (admin_id)
      REFERENCES public.admins(id) ON DELETE CASCADE;
  END IF;

  -- agent_lgas.admin_id -> admins.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_lgas_admin_id_fkey'
  ) THEN
    ALTER TABLE public.agent_lgas
      ADD CONSTRAINT agent_lgas_admin_id_fkey FOREIGN KEY (admin_id)
      REFERENCES public.admins(id) ON DELETE CASCADE;
  END IF;

  -- messages.order_id -> orders.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_order_id_fkey'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  -- order_messages.order_id -> orders.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_messages_order_id_fkey'
  ) THEN
    ALTER TABLE public.order_messages
      ADD CONSTRAINT order_messages_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  -- orders.assigned_admin -> admins.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_assigned_admin_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_assigned_admin_fkey FOREIGN KEY (assigned_admin)
      REFERENCES public.admins(id);
  END IF;

  -- orders.client_id -> clients.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_client_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  -- orders.vendor_id -> vendors.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_vendor_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id)
      REFERENCES public.vendors(id) ON DELETE CASCADE;
  END IF;

  -- payments.order_id -> orders.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_order_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;

  -- verification_tokens.client_id -> clients.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'verification_tokens_client_id_fkey'
  ) THEN
    ALTER TABLE public.verification_tokens
      ADD CONSTRAINT verification_tokens_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  -- weekly_plan_items.weekly_plan_order_id -> weekly_plan_orders.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_items_weekly_plan_order_id_fkey'
  ) THEN
    ALTER TABLE public.weekly_plan_items
      ADD CONSTRAINT weekly_plan_items_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id)
      REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;
  END IF;

  -- weekly_plan_messages.weekly_plan_order_id -> weekly_plan_orders.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_messages_weekly_plan_order_id_fkey'
  ) THEN
    ALTER TABLE public.weekly_plan_messages
      ADD CONSTRAINT weekly_plan_messages_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id)
      REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;
  END IF;

  -- weekly_plan_orders.assigned_admin -> admins.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_orders_assigned_admin_fkey'
  ) THEN
    ALTER TABLE public.weekly_plan_orders
      ADD CONSTRAINT weekly_plan_orders_assigned_admin_fkey FOREIGN KEY (assigned_admin)
      REFERENCES public.admins(id);
  END IF;

  -- weekly_plan_orders.client_id -> clients.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_orders_client_id_fkey'
  ) THEN
    ALTER TABLE public.weekly_plan_orders
      ADD CONSTRAINT weekly_plan_orders_client_id_fkey FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  -- weekly_plan_orders.vendor_id -> vendors.id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plan_orders_vendor_id_fkey'
  ) THEN
    ALTER TABLE public.weekly_plan_orders
      ADD CONSTRAINT weekly_plan_orders_vendor_id_fkey FOREIGN KEY (vendor_id)
      REFERENCES public.vendors(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================================================================
-- 9) Grants (if any; adapt as needed)
--    By default keep grant to DB owner. Add grants here if you have app user roles.
-- ============================================================================
-- Example: GRANT usage/select on specific tables to an application role (uncomment/update as needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mypadifood;

-- ============================================================================
-- 10) Small helpful comments & notes
-- ============================================================================
-- - This file intentionally avoids changing weekly_plan_items / weekly_plan_orders structure.
-- - The triggers fn_create_order_system_message() and fn_create_weeklyplan_system_message()
--   ensure an initial message / notification is created when orders and weekly plans are created.
-- - If you need exact original ordering/ownership from the dump (owner: mypadifood), you can
--   run ALTER TABLE ... OWNER TO mypadifood as needed, or run the original dump as-is.
-- - If you want the output of this script as a single one-line file: redirect stdout of psql to a file.
-- - To export this schema later to a file: use pgAdmin Backup (Plain, schema-only) or `pg_dump --schema-only`.

-- Completed schema load script.

ALTER TABLE public.weekly_plan_items
  ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- migrations/20251007_create_riders.sql

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create riders table (includes ID fields, bank, vehicle, uploaded id_file, geolocation)
CREATE TABLE IF NOT EXISTS riders (
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
  password_hash text,           -- changed to nullable (riders registered without password)
  -- ID verification fields
  id_type text,
  id_number text,
  id_file text,         -- relative path to uploaded file
  next_of_kin text,
  base_fee numeric,     -- optional base delivery fee
  status text NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  latitude numeric,
  longitude numeric,
  location_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_riders_state ON riders(state);
CREATE INDEX IF NOT EXISTS idx_riders_lga ON riders(lga);
CREATE INDEX IF NOT EXISTS idx_riders_phone ON riders(phone);
CREATE INDEX IF NOT EXISTS idx_riders_email ON riders(email);

-- Trigger to auto-update updated_at on update
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_timestamp ON riders;
CREATE TRIGGER trg_set_timestamp
BEFORE UPDATE ON riders
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

ALTER TABLE riders ALTER COLUMN password_hash DROP NOT NULL;

-- migrations/2025xx_create_wallets.sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS wallets (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  -- type = credit or debit for arithmetic; reason provides more detail
  type text NOT NULL CHECK (type IN ('credit','debit')),
  reason text,                 -- e.g. 'topup', 'purchase', 'refund'
  provider text,               -- 'paystack'|'flutterwave'|'wallet'|'internal'
  provider_reference text,     -- provider-specific id (for idempotency)
  order_id uuid NULL,          -- FK to orders if applicable
  note text,
  raw jsonb DEFAULT '{}'::jsonb,-- full provider payload for auditing
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Optional: prevent double-processing of the same provider event
CREATE UNIQUE INDEX IF NOT EXISTS wallet_provider_ref_uniq
  ON wallet_transactions (provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_tx_client_idx
  ON wallet_transactions (client_id, created_at DESC);

COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  method text NOT NULL,              -- e.g. 'bank_transfer','bank','manual'
  destination jsonb DEFAULT '{}'::jsonb, -- bank details or payout target
  status text NOT NULL DEFAULT 'pending', -- pending | approved | declined | paid | cancelled
  admin_id uuid NULL,                -- admin who processed
  admin_note text NULL,
  provider text NULL,                -- optional provider used to pay out (if integrated)
  provider_reference text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawals_client_idx ON withdrawal_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON withdrawal_requests (status, created_at DESC);

COMMIT;
