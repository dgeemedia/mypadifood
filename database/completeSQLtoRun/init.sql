-- init_clean.sql
-- Clean recreation script for MyPadi database schema
-- Drops existing objects where possible, then recreates the schema cleanly.
-- NOTE: This creates objects owned by mypadi_user as in original dump.
-- Run in pgAdmin Query Tool (open file -> F5).

-- ========== DROP existing objects (safe to re-run) ==========
-- Drop triggers that might reference functions/tables
DROP TRIGGER IF EXISTS trg_order_after_insert_system_message ON public.orders CASCADE;
DROP TRIGGER IF EXISTS trg_riders_set_timestamp ON public.riders CASCADE;
DROP TRIGGER IF EXISTS trg_weekly_plan_after_insert_system_message ON public.weekly_plan_orders CASCADE;

-- Drop tables (order doesn't matter due to CASCADE)
DROP TABLE IF EXISTS public.withdrawals CASCADE;
DROP TABLE IF EXISTS public.withdrawal_requests CASCADE;
DROP TABLE IF EXISTS public.weekly_plan_items CASCADE;
DROP TABLE IF EXISTS public.weekly_plan_messages CASCADE;
DROP TABLE IF EXISTS public.weekly_plan_orders CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;
DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.verification_tokens CASCADE;
DROP TABLE IF EXISTS public.testimonials CASCADE;
DROP TABLE IF EXISTS public.session CASCADE;
DROP TABLE IF EXISTS public.riders CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.partners CASCADE;
DROP TABLE IF EXISTS public.order_messages CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.clients_address_backup CASCADE;
DROP TABLE IF EXISTS public.auditor_order_view CASCADE;
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.agent_lgas CASCADE;
DROP TABLE IF EXISTS public.admins CASCADE;
DROP TABLE IF EXISTS public.admin_reset_tokens CASCADE;
DROP TABLE IF EXISTS public.admin_notifications_backup_weeklyplan_fix CASCADE;
DROP TABLE IF EXISTS public.admin_notifications CASCADE;

-- Drop sequences
DROP SEQUENCE IF EXISTS public.admin_notifications_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.agent_lgas_id_seq CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.fn_create_order_system_message() CASCADE;
DROP FUNCTION IF EXISTS public.fn_create_weeklyplan_system_message() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_set_timestamp() CASCADE;

-- Drop extensions if you want a fully fresh install (optional)
-- DROP EXTENSION IF EXISTS pgcrypto CASCADE;
-- DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;

-- ========== Ensure schema/public ownership ==========
-- set schema owner (will fail if mypadi_user does not exist; ok to adjust)
ALTER SCHEMA public OWNER TO mypadi_user;

-- ========== Extensions ==========
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions (gen_random_uuid)';

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- ========== Functions (trigger helpers) ==========
-- System message creator when an order is created
CREATE OR REPLACE FUNCTION public.fn_create_order_system_message() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert user-facing order message
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

ALTER FUNCTION public.fn_create_order_system_message() OWNER TO mypadi_user;

-- Weeklyplan system message creator
CREATE OR REPLACE FUNCTION public.fn_create_weeklyplan_system_message() RETURNS trigger
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

ALTER FUNCTION public.fn_create_weeklyplan_system_message() OWNER TO mypadi_user;

-- Updated_at setter
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.trigger_set_timestamp() OWNER TO mypadi_user;

-- ========== Sequences ==========
CREATE SEQUENCE public.admin_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.admin_notifications_id_seq OWNER TO mypadi_user;

CREATE SEQUENCE public.agent_lgas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.agent_lgas_id_seq OWNER TO mypadi_user;

-- ========== Tables ==========
CREATE TABLE public.admin_notifications (
    id integer DEFAULT nextval('public.admin_notifications_id_seq'::regclass) NOT NULL,
    order_id uuid,
    type text NOT NULL,
    payload jsonb,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_notifications OWNER TO mypadi_user;

CREATE TABLE public.admin_notifications_backup_weeklyplan_fix (
    id integer DEFAULT nextval('public.admin_notifications_id_seq'::regclass) NOT NULL,
    order_id uuid,
    type text NOT NULL,
    payload jsonb,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_notifications_backup_weeklyplan_fix OWNER TO mypadi_user;

CREATE TABLE public.admin_reset_tokens (
    token text NOT NULL,
    admin_id uuid,
    meta jsonb,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.admin_reset_tokens OWNER TO mypadi_user;

CREATE TABLE public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'agent'::text NOT NULL,
    region_state text,
    region_lga text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb,
    must_change_password boolean DEFAULT false
);
ALTER TABLE public.admins OWNER TO mypadi_user;

CREATE TABLE public.agent_lgas (
    id integer DEFAULT nextval('public.agent_lgas_id_seq'::regclass) NOT NULL,
    admin_id uuid NOT NULL,
    state text NOT NULL,
    lga text NOT NULL
);
ALTER TABLE public.agent_lgas OWNER TO mypadi_user;

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    state text,
    lga text,
    address text,
    password_hash text NOT NULL,
    verified boolean DEFAULT false,
    wallet_balance numeric(12,2) DEFAULT 0,
    latitude double precision,
    longitude double precision,
    location_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb,
    must_change_password boolean DEFAULT false
);
ALTER TABLE public.clients OWNER TO mypadi_user;

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    vendor_id uuid,
    item text,
    status text DEFAULT 'pending'::text,
    assigned_admin uuid,
    payment_method text,
    total_amount numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    negotiated_total numeric,
    payment_provider text,
    payment_reference text,
    paid_at timestamp with time zone,
    completed_at timestamp with time zone
);
ALTER TABLE public.orders OWNER TO mypadi_user;

CREATE TABLE public.vendors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    state text,
    lga text,
    address text,
    phone text,
    email text,
    food_item text,
    base_price numeric,
    status text DEFAULT 'pending'::text,
    latitude double precision,
    longitude double precision,
    location_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.vendors OWNER TO mypadi_user;

CREATE VIEW public.auditor_order_view AS
 SELECT o.id AS order_id,
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
   FROM (((public.orders o
     LEFT JOIN public.clients c ON ((c.id = o.client_id)))
     LEFT JOIN public.vendors v ON ((v.id = o.vendor_id)))
     LEFT JOIN public.admins a ON ((a.id = o.assigned_admin)));
ALTER VIEW public.auditor_order_view OWNER TO mypadi_user;

CREATE TABLE public.clients_address_backup (
    id uuid,
    address text
);
ALTER TABLE public.clients_address_backup OWNER TO mypadi_user;

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    sender_name text,
    message text NOT NULL,
    delivered boolean DEFAULT false,
    read_by_admin boolean DEFAULT false,
    read_by_client boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.messages OWNER TO mypadi_user;

CREATE TABLE public.order_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    read_by_admin boolean DEFAULT false,
    read_by_client boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.order_messages OWNER TO mypadi_user;

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    logo_url text,
    website text,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.partners OWNER TO mypadi_user;

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    provider text NOT NULL,
    event text,
    provider_reference text,
    amount numeric,
    currency text,
    status text,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.payments OWNER TO mypadi_user;

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vendor_id uuid NOT NULL,
    client_id uuid,
    admin_id uuid,
    order_id uuid,
    parent_id uuid,
    rating smallint,
    comment text,
    visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);
ALTER TABLE public.reviews OWNER TO mypadi_user;

CREATE TABLE public.riders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    status text DEFAULT 'pending'::text NOT NULL,
    latitude double precision,
    longitude double precision,
    location_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_reason text
);
ALTER TABLE public.riders OWNER TO mypadi_user;

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp with time zone NOT NULL
);
ALTER TABLE public.session OWNER TO mypadi_user;

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    photo_url text,
    city text,
    quote text NOT NULL,
    approved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    consent boolean DEFAULT false NOT NULL
);
ALTER TABLE public.testimonials OWNER TO mypadi_user;

CREATE TABLE public.verification_tokens (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.verification_tokens OWNER TO mypadi_user;

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    type text NOT NULL,
    reason text,
    provider text,
    provider_reference text,
    order_id uuid,
    note text,
    raw jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_transactions_type_check CHECK ((type = ANY (ARRAY['credit'::text, 'debit'::text])))
);
ALTER TABLE public.wallet_transactions OWNER TO mypadi_user;

CREATE TABLE public.wallets (
    client_id uuid NOT NULL,
    balance numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    wallet_identifier character varying(50),
    wallet_identifier_locked boolean DEFAULT false,
    wallet_uuid uuid DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.wallets OWNER TO mypadi_user;

CREATE TABLE public.weekly_plan_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weekly_plan_order_id uuid NOT NULL,
    day_of_week text NOT NULL,
    slot integer DEFAULT 1 NOT NULL,
    food_key text NOT NULL,
    food_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.weekly_plan_items OWNER TO mypadi_user;

CREATE TABLE public.weekly_plan_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weekly_plan_order_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.weekly_plan_messages OWNER TO mypadi_user;

CREATE TABLE public.weekly_plan_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    vendor_id uuid,
    week_of date NOT NULL,
    plan_type text NOT NULL,
    total_price numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method text,
    payment_status text DEFAULT 'pending'::text,
    status text DEFAULT 'pending'::text,
    assigned_admin uuid,
    modifiable_from timestamp with time zone,
    modifiable_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.weekly_plan_orders OWNER TO mypadi_user;

CREATE TABLE public.withdrawal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text DEFAULT 'NGN'::text NOT NULL,
    method text NOT NULL,
    destination jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_id uuid,
    admin_note text,
    provider text,
    provider_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.withdrawal_requests OWNER TO mypadi_user;

CREATE TABLE public.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    amount numeric(16,2) NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    provider character varying(64),
    provider_reference character varying(128),
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.withdrawals OWNER TO mypadi_user;

-- ========== Constraints (Primary / Unique) ==========
ALTER TABLE ONLY public.admin_notifications_backup_weeklyplan_fix
    ADD CONSTRAINT admin_notifications_backup_weeklyplan_fix_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.admin_reset_tokens
    ADD CONSTRAINT admin_reset_tokens_pkey PRIMARY KEY (token);

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);
ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.agent_lgas
    ADD CONSTRAINT agent_lgas_admin_id_state_lga_key UNIQUE (admin_id, state, lga);
ALTER TABLE ONLY public.agent_lgas
    ADD CONSTRAINT agent_lgas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_email_key UNIQUE (email);
ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.riders
    ADD CONSTRAINT riders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.verification_tokens
    ADD CONSTRAINT verification_tokens_pkey PRIMARY KEY (token);

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (client_id);

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.weekly_plan_messages
    ADD CONSTRAINT weekly_plan_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);

-- ========== Indexes ==========
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.session USING btree (expire);
CREATE INDEX IF NOT EXISTS admin_notifications_backup_weeklyplan_fix_order_id_idx ON public.admin_notifications_backup_weeklyplan_fix USING btree (order_id);
CREATE INDEX IF NOT EXISTS admin_notifications_backup_weeklyplan_fix_read_idx ON public.admin_notifications_backup_weeklyplan_fix USING btree (read);
CREATE INDEX IF NOT EXISTS admin_reset_tokens_admin_id_idx ON public.admin_reset_tokens USING btree (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_order_id ON public.admin_notifications USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_read ON public.admin_notifications USING btree (read);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients USING btree (email);
CREATE INDEX IF NOT EXISTS idx_clients_latlon ON public.clients USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_order ON public.messages USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_order_messages_created_at ON public.order_messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_order_messages_order_id ON public.order_messages USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_client ON public.orders USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON public.orders USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_ref ON public.payments USING btree (provider_reference);
CREATE INDEX IF NOT EXISTS idx_riders_email ON public.riders USING btree (email);
CREATE INDEX IF NOT EXISTS idx_riders_lga ON public.riders USING btree (lga);
CREATE INDEX IF NOT EXISTS idx_riders_phone ON public.riders USING btree (phone);
CREATE INDEX IF NOT EXISTS idx_riders_state ON public.riders USING btree (state);
CREATE INDEX IF NOT EXISTS idx_vendors_latlon ON public.vendors USING btree (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_vendors_state_lga ON public.vendors USING btree (state, lga);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors USING btree (status);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_client ON public.verification_tokens USING btree (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_wallet_identifier ON public.wallets USING btree (wallet_identifier) WHERE (wallet_identifier IS NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_tx_client_idx ON public.wallet_transactions USING btree (client_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_provider_ref_uniq ON public.wallet_transactions USING btree (provider, provider_reference) WHERE ((provider IS NOT NULL) AND (provider_reference IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_provider_ref_uniq ON public.withdrawal_requests USING btree (provider, provider_reference) WHERE ((provider IS NOT NULL) AND (provider_reference IS NOT NULL));
CREATE INDEX IF NOT EXISTS withdrawals_client_idx ON public.withdrawal_requests USING btree (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON public.withdrawal_requests USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_week ON public.weekly_plan_items USING btree (weekly_plan_order_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_messages_created ON public.weekly_plan_messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_messages_plan ON public.weekly_plan_messages USING btree (weekly_plan_order_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_orders_client_week ON public.weekly_plan_orders USING btree (client_id, week_of);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_orders_created ON public.weekly_plan_orders USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_orders_status ON public.weekly_plan_orders USING btree (status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_client_id ON public.withdrawals USING btree (client_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_client_created ON public.wallet_transactions USING btree (client_id, created_at DESC);

-- ========== Triggers (attach after tables exist) ==========
CREATE TRIGGER trg_order_after_insert_system_message
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_create_order_system_message();

CREATE TRIGGER trg_riders_set_timestamp
  BEFORE UPDATE ON public.riders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_timestamp();

CREATE TRIGGER trg_weekly_plan_after_insert_system_message
  AFTER INSERT ON public.weekly_plan_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_create_weeklyplan_system_message();

-- ========== Foreign keys ==========
ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.admin_reset_tokens
    ADD CONSTRAINT admin_reset_tokens_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.agent_lgas
    ADD CONSTRAINT agent_lgas_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_admin FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_client FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_parent FOREIGN KEY (parent_id) REFERENCES public.reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT fk_reviews_vendor FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_admin_fkey FOREIGN KEY (assigned_admin) REFERENCES public.admins(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.verification_tokens
    ADD CONSTRAINT verification_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id) REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.weekly_plan_messages
    ADD CONSTRAINT weekly_plan_messages_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id) REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_assigned_admin_fkey FOREIGN KEY (assigned_admin) REFERENCES public.admins(id);

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- ========== Final note ==========
-- This script intentionally omits SETVAL / sequence adjustments and any INSERT/seed data.
-- After running, create any initial admin/client users via your admin setup flow or separate seed scripts
-- (do NOT paste real user/passwords into this schema file).

-- End of init_clean.sql
