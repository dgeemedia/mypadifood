-- PostgreSQL database dump
--

\restrict PichOvsgGNnMn1JwuxC144QabcSZsBknscQJbV6yluUsq1S3XE2fIZOgzcZKDjJ

-- Dumped from database version 17.6 (Debian 17.6-1.pgdg12+1)
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-30 10:22:12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 7 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: mypadifood
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO mypadifood;

--
-- TOC entry 3 (class 3079 OID 16409)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 3617 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 2 (class 3079 OID 16398)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 3618 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 295 (class 1255 OID 16764)
-- Name: fn_create_order_system_message(); Type: FUNCTION; Schema: public; Owner: mypadifood
--

CREATE FUNCTION public.fn_create_order_system_message() RETURNS trigger
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


ALTER FUNCTION public.fn_create_order_system_message() OWNER TO mypadifood;

--
-- TOC entry 296 (class 1255 OID 16766)
-- Name: fn_create_weeklyplan_system_message(); Type: FUNCTION; Schema: public; Owner: mypadifood
--

CREATE FUNCTION public.fn_create_weeklyplan_system_message() RETURNS trigger
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


ALTER FUNCTION public.fn_create_weeklyplan_system_message() OWNER TO mypadifood;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 230 (class 1259 OID 16643)
-- Name: admin_notifications; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.admin_notifications (
    id integer NOT NULL,
    order_id uuid,
    type text NOT NULL,
    payload jsonb,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_notifications OWNER TO mypadifood;

--
-- TOC entry 229 (class 1259 OID 16642)
-- Name: admin_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: mypadifood
--

CREATE SEQUENCE public.admin_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_notifications_id_seq OWNER TO mypadifood;

--
-- TOC entry 3665 (class 0 OID 0)
-- Dependencies: 229
-- Name: admin_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mypadifood
--

ALTER SEQUENCE public.admin_notifications_id_seq OWNED BY public.admin_notifications.id;


--
-- TOC entry 237 (class 1259 OID 16773)
-- Name: admin_notifications_backup_weeklyplan_fix; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.admin_notifications_backup_weeklyplan_fix (
    id integer DEFAULT nextval('public.admin_notifications_id_seq'::regclass) NOT NULL,
    order_id uuid,
    type text NOT NULL,
    payload jsonb,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_notifications_backup_weeklyplan_fix OWNER TO mypadifood;

--
-- TOC entry 231 (class 1259 OID 16661)
-- Name: admin_reset_tokens; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.admin_reset_tokens (
    token text NOT NULL,
    admin_id uuid,
    meta jsonb,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_reset_tokens OWNER TO mypadifood;

--
-- TOC entry 221 (class 1259 OID 16474)
-- Name: admins; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.admins (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'agent'::text NOT NULL,
    region_state text,
    region_lga text,
    active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    preferences jsonb DEFAULT '{}'::jsonb,
    must_change_password boolean DEFAULT false
);


ALTER TABLE public.admins OWNER TO mypadifood;

--
-- TOC entry 233 (class 1259 OID 16687)
-- Name: agent_lgas; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.agent_lgas (
    id integer NOT NULL,
    admin_id uuid NOT NULL,
    state text NOT NULL,
    lga text NOT NULL
);


ALTER TABLE public.agent_lgas OWNER TO mypadifood;

--
-- TOC entry 232 (class 1259 OID 16686)
-- Name: agent_lgas_id_seq; Type: SEQUENCE; Schema: public; Owner: mypadifood
--

CREATE SEQUENCE public.agent_lgas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agent_lgas_id_seq OWNER TO mypadifood;

--
-- TOC entry 3666 (class 0 OID 0)
-- Dependencies: 232
-- Name: agent_lgas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: mypadifood
--

ALTER SEQUENCE public.agent_lgas_id_seq OWNED BY public.agent_lgas.id;


--
-- TOC entry 219 (class 1259 OID 16446)
-- Name: clients; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.clients (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
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


ALTER TABLE public.clients OWNER TO mypadifood;

--
-- TOC entry 222 (class 1259 OID 16488)
-- Name: orders; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    client_id uuid,
    vendor_id uuid,
    item text,
    status text DEFAULT 'pending'::text,
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


ALTER TABLE public.orders OWNER TO mypadifood;

--
-- TOC entry 220 (class 1259 OID 16461)
-- Name: vendors; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.vendors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.vendors OWNER TO mypadifood;

--
-- TOC entry 227 (class 1259 OID 16580)
-- Name: auditor_order_view; Type: VIEW; Schema: public; Owner: mypadifood
--

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


ALTER VIEW public.auditor_order_view OWNER TO mypadifood;

--
-- TOC entry 226 (class 1259 OID 16556)
-- Name: messages; Type: TABLE; Schema: public; Owner: mypadifood
--

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
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.messages OWNER TO mypadifood;

--
-- TOC entry 225 (class 1259 OID 16537)
-- Name: order_messages; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.order_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    read_by_admin boolean DEFAULT false,
    read_by_client boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.order_messages OWNER TO mypadifood;

--
-- TOC entry 228 (class 1259 OID 16586)
-- Name: payments; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
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


ALTER TABLE public.payments OWNER TO mypadifood;

--
-- TOC entry 223 (class 1259 OID 16516)
-- Name: session; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO mypadifood;

--
-- TOC entry 224 (class 1259 OID 16524)
-- Name: verification_tokens; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.verification_tokens (
    token uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    client_id uuid,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.verification_tokens OWNER TO mypadifood;

--
-- TOC entry 235 (class 1259 OID 16730)
-- Name: weekly_plan_items; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.weekly_plan_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    weekly_plan_order_id uuid NOT NULL,
    day_of_week text NOT NULL,
    slot integer DEFAULT 1 NOT NULL,
    food_key text NOT NULL,
    food_label text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.weekly_plan_items OWNER TO mypadifood;

--
-- TOC entry 236 (class 1259 OID 16747)
-- Name: weekly_plan_messages; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.weekly_plan_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    weekly_plan_order_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    message text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.weekly_plan_messages OWNER TO mypadifood;

--
-- TOC entry 234 (class 1259 OID 16702)
-- Name: weekly_plan_orders; Type: TABLE; Schema: public; Owner: mypadifood
--

CREATE TABLE public.weekly_plan_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    client_id uuid NOT NULL,
    vendor_id uuid,
    week_of date NOT NULL,
    plan_type text NOT NULL,
    total_price bigint DEFAULT 0 NOT NULL,
    payment_method text,
    payment_status text DEFAULT 'pending'::text,
    status text DEFAULT 'pending'::text,
    assigned_admin uuid,
    modifiable_from timestamp with time zone,
    modifiable_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.weekly_plan_orders OWNER TO mypadifood;

--
-- TOC entry 3362 (class 2604 OID 16646)
-- Name: admin_notifications id; Type: DEFAULT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admin_notifications ALTER COLUMN id SET DEFAULT nextval('public.admin_notifications_id_seq'::regclass);


--
-- TOC entry 3366 (class 2604 OID 16690)
-- Name: agent_lgas id; Type: DEFAULT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.agent_lgas ALTER COLUMN id SET DEFAULT nextval('public.agent_lgas_id_seq'::regclass);


--
-- TOC entry 3447 (class 2606 OID 16782)
-- Name: admin_notifications_backup_weeklyplan_fix_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admin_notifications_backup_weeklyplan_fix
    ADD CONSTRAINT admin_notifications_backup_weeklyplan_fix_pkey PRIMARY KEY (id);


--
-- TOC entry 3424 (class 2606 OID 16652)
-- Name: admin_notifications admin_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 3429 (class 2606 OID 16668)
-- Name: admin_reset_tokens admin_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admin_reset_tokens
    ADD CONSTRAINT admin_reset_tokens_pkey PRIMARY KEY (token);


--
-- TOC entry 3394 (class 2606 OID 16486)
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- TOC entry 3396 (class 2606 OID 16484)
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- TOC entry 3431 (class 2606 OID 16696)
-- Name: agent_lgas agent_lgas_admin_id_state_lga_key; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.agent_lgas
    ADD CONSTRAINT agent_lgas_admin_id_state_lga_key UNIQUE (admin_id, state, lga);


--
-- TOC entry 3433 (class 2606 OID 16694)
-- Name: agent_lgas agent_lgas_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.agent_lgas
    ADD CONSTRAINT agent_lgas_pkey PRIMARY KEY (id);


--
-- TOC entry 3383 (class 2606 OID 16458)
-- Name: clients clients_email_key; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_email_key UNIQUE (email);


--
-- TOC entry 3385 (class 2606 OID 16456)
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- TOC entry 3418 (class 2606 OID 16568)
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- TOC entry 3413 (class 2606 OID 16548)
-- Name: order_messages order_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 3403 (class 2606 OID 16497)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- TOC entry 3422 (class 2606 OID 16594)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 3406 (class 2606 OID 16522)
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- TOC entry 3392 (class 2606 OID 16470)
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- TOC entry 3409 (class 2606 OID 16530)
-- Name: verification_tokens verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.verification_tokens
    ADD CONSTRAINT verification_tokens_pkey PRIMARY KEY (token);


--
-- TOC entry 3440 (class 2606 OID 16739)
-- Name: weekly_plan_items weekly_plan_items_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_pkey PRIMARY KEY (id);


--
-- TOC entry 3444 (class 2606 OID 16756)
-- Name: weekly_plan_messages weekly_plan_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_messages
    ADD CONSTRAINT weekly_plan_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 3438 (class 2606 OID 16714)
-- Name: weekly_plan_orders weekly_plan_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_pkey PRIMARY KEY (id);


--
-- TOC entry 3404 (class 1259 OID 16523)
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- TOC entry 3445 (class 1259 OID 16783)
-- Name: admin_notifications_backup_weeklyplan_fix_order_id_idx; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX admin_notifications_backup_weeklyplan_fix_order_id_idx ON public.admin_notifications_backup_weeklyplan_fix USING btree (order_id);


--
-- TOC entry 3448 (class 1259 OID 16784)
-- Name: admin_notifications_backup_weeklyplan_fix_read_idx; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX admin_notifications_backup_weeklyplan_fix_read_idx ON public.admin_notifications_backup_weeklyplan_fix USING btree (read);


--
-- TOC entry 3427 (class 1259 OID 16674)
-- Name: admin_reset_tokens_admin_id_idx; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX admin_reset_tokens_admin_id_idx ON public.admin_reset_tokens USING btree (admin_id);


--
-- TOC entry 3425 (class 1259 OID 16658)
-- Name: idx_admin_notifications_order_id; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_admin_notifications_order_id ON public.admin_notifications USING btree (order_id);


--
-- TOC entry 3426 (class 1259 OID 16659)
-- Name: idx_admin_notifications_read; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_admin_notifications_read ON public.admin_notifications USING btree (read);


--
-- TOC entry 3397 (class 1259 OID 16487)
-- Name: idx_admins_email; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_admins_email ON public.admins USING btree (email);


--
-- TOC entry 3386 (class 1259 OID 16459)
-- Name: idx_clients_email; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_clients_email ON public.clients USING btree (email);


--
-- TOC entry 3387 (class 1259 OID 16460)
-- Name: idx_clients_latlon; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_clients_latlon ON public.clients USING btree (latitude, longitude);


--
-- TOC entry 3414 (class 1259 OID 16575)
-- Name: idx_messages_created; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_messages_created ON public.messages USING btree (created_at);


--
-- TOC entry 3415 (class 1259 OID 16585)
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at);


--
-- TOC entry 3416 (class 1259 OID 16574)
-- Name: idx_messages_order; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_messages_order ON public.messages USING btree (order_id);


--
-- TOC entry 3410 (class 1259 OID 16555)
-- Name: idx_order_messages_created_at; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_order_messages_created_at ON public.order_messages USING btree (created_at);


--
-- TOC entry 3411 (class 1259 OID 16554)
-- Name: idx_order_messages_order_id; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_order_messages_order_id ON public.order_messages USING btree (order_id);


--
-- TOC entry 3398 (class 1259 OID 16513)
-- Name: idx_orders_client; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_orders_client ON public.orders USING btree (client_id);


--
-- TOC entry 3399 (class 1259 OID 16515)
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- TOC entry 3400 (class 1259 OID 16768)
-- Name: idx_orders_status_created; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_orders_status_created ON public.orders USING btree (status, created_at);


--
-- TOC entry 3401 (class 1259 OID 16514)
-- Name: idx_orders_vendor; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_orders_vendor ON public.orders USING btree (vendor_id);


--
-- TOC entry 3419 (class 1259 OID 16600)
-- Name: idx_payments_order; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_payments_order ON public.payments USING btree (order_id);


--
-- TOC entry 3420 (class 1259 OID 16601)
-- Name: idx_payments_provider_ref; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_payments_provider_ref ON public.payments USING btree (provider_reference);


--
-- TOC entry 3388 (class 1259 OID 16473)
-- Name: idx_vendors_latlon; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_vendors_latlon ON public.vendors USING btree (latitude, longitude);


--
-- TOC entry 3389 (class 1259 OID 16471)
-- Name: idx_vendors_state_lga; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_vendors_state_lga ON public.vendors USING btree (state, lga);


--
-- TOC entry 3390 (class 1259 OID 16472)
-- Name: idx_vendors_status; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_vendors_status ON public.vendors USING btree (status);


--
-- TOC entry 3407 (class 1259 OID 16536)
-- Name: idx_verification_tokens_client; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_verification_tokens_client ON public.verification_tokens USING btree (client_id);


--
-- TOC entry 3441 (class 1259 OID 16763)
-- Name: idx_weekly_plan_messages_created; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_weekly_plan_messages_created ON public.weekly_plan_messages USING btree (created_at);


--
-- TOC entry 3442 (class 1259 OID 16762)
-- Name: idx_weekly_plan_messages_plan; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_weekly_plan_messages_plan ON public.weekly_plan_messages USING btree (weekly_plan_order_id);


--
-- TOC entry 3434 (class 1259 OID 16745)
-- Name: idx_weekly_plan_orders_client_week; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_weekly_plan_orders_client_week ON public.weekly_plan_orders USING btree (client_id, week_of);


--
-- TOC entry 3435 (class 1259 OID 16769)
-- Name: idx_weekly_plan_orders_created; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_weekly_plan_orders_created ON public.weekly_plan_orders USING btree (created_at);


--
-- TOC entry 3436 (class 1259 OID 16746)
-- Name: idx_weekly_plan_orders_status; Type: INDEX; Schema: public; Owner: mypadifood
--

CREATE INDEX idx_weekly_plan_orders_status ON public.weekly_plan_orders USING btree (status);


--
-- TOC entry 3464 (class 2620 OID 16765)
-- Name: orders trg_order_after_insert_system_message; Type: TRIGGER; Schema: public; Owner: mypadifood
--

CREATE TRIGGER trg_order_after_insert_system_message AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_create_order_system_message();


--
-- TOC entry 3465 (class 2620 OID 16767)
-- Name: weekly_plan_orders trg_weekly_plan_after_insert_system_message; Type: TRIGGER; Schema: public; Owner: mypadifood
--

CREATE TRIGGER trg_weekly_plan_after_insert_system_message AFTER INSERT ON public.weekly_plan_orders FOR EACH ROW EXECUTE FUNCTION public.fn_create_weeklyplan_system_message();


--
-- TOC entry 3456 (class 2606 OID 16653)
-- Name: admin_notifications admin_notifications_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admin_notifications
    ADD CONSTRAINT admin_notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 3457 (class 2606 OID 16669)
-- Name: admin_reset_tokens admin_reset_tokens_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.admin_reset_tokens
    ADD CONSTRAINT admin_reset_tokens_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;


--
-- TOC entry 3458 (class 2606 OID 16697)
-- Name: agent_lgas agent_lgas_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.agent_lgas
    ADD CONSTRAINT agent_lgas_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admins(id) ON DELETE CASCADE;


--
-- TOC entry 3454 (class 2606 OID 16569)
-- Name: messages messages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 3453 (class 2606 OID 16549)
-- Name: order_messages order_messages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.order_messages
    ADD CONSTRAINT order_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 3449 (class 2606 OID 16508)
-- Name: orders orders_assigned_admin_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_admin_fkey FOREIGN KEY (assigned_admin) REFERENCES public.admins(id);


--
-- TOC entry 3450 (class 2606 OID 16498)
-- Name: orders orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- TOC entry 3451 (class 2606 OID 16503)
-- Name: orders orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;


--
-- TOC entry 3455 (class 2606 OID 16595)
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- TOC entry 3452 (class 2606 OID 16531)
-- Name: verification_tokens verification_tokens_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.verification_tokens
    ADD CONSTRAINT verification_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- TOC entry 3462 (class 2606 OID 16740)
-- Name: weekly_plan_items weekly_plan_items_weekly_plan_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_items
    ADD CONSTRAINT weekly_plan_items_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id) REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;


--
-- TOC entry 3463 (class 2606 OID 16757)
-- Name: weekly_plan_messages weekly_plan_messages_weekly_plan_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_messages
    ADD CONSTRAINT weekly_plan_messages_weekly_plan_order_id_fkey FOREIGN KEY (weekly_plan_order_id) REFERENCES public.weekly_plan_orders(id) ON DELETE CASCADE;


--
-- TOC entry 3459 (class 2606 OID 16725)
-- Name: weekly_plan_orders weekly_plan_orders_assigned_admin_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_assigned_admin_fkey FOREIGN KEY (assigned_admin) REFERENCES public.admins(id);


--
-- TOC entry 3460 (class 2606 OID 16715)
-- Name: weekly_plan_orders weekly_plan_orders_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- TOC entry 3461 (class 2606 OID 16720)
-- Name: weekly_plan_orders weekly_plan_orders_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: mypadifood
--

ALTER TABLE ONLY public.weekly_plan_orders
    ADD CONSTRAINT weekly_plan_orders_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;


--
-- TOC entry 3619 (class 0 OID 0)
-- Dependencies: 291
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.armor(bytea) TO mypadifood;


--
-- TOC entry 3620 (class 0 OID 0)
-- Dependencies: 292
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.armor(bytea, text[], text[]) TO mypadifood;


--
-- TOC entry 3621 (class 0 OID 0)
-- Dependencies: 263
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.crypt(text, text) TO mypadifood;


--
-- TOC entry 3622 (class 0 OID 0)
-- Dependencies: 293
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dearmor(text) TO mypadifood;


--
-- TOC entry 3623 (class 0 OID 0)
-- Dependencies: 267
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.decrypt(bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3624 (class 0 OID 0)
-- Dependencies: 269
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.decrypt_iv(bytea, bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3625 (class 0 OID 0)
-- Dependencies: 260
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.digest(bytea, text) TO mypadifood;


--
-- TOC entry 3626 (class 0 OID 0)
-- Dependencies: 259
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.digest(text, text) TO mypadifood;


--
-- TOC entry 3627 (class 0 OID 0)
-- Dependencies: 266
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.encrypt(bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3628 (class 0 OID 0)
-- Dependencies: 268
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.encrypt_iv(bytea, bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3629 (class 0 OID 0)
-- Dependencies: 270
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.gen_random_bytes(integer) TO mypadifood;


--
-- TOC entry 3630 (class 0 OID 0)
-- Dependencies: 271
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.gen_random_uuid() TO mypadifood;


--
-- TOC entry 3631 (class 0 OID 0)
-- Dependencies: 264
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.gen_salt(text) TO mypadifood;


--
-- TOC entry 3632 (class 0 OID 0)
-- Dependencies: 265
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.gen_salt(text, integer) TO mypadifood;


--
-- TOC entry 3633 (class 0 OID 0)
-- Dependencies: 262
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.hmac(bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3634 (class 0 OID 0)
-- Dependencies: 261
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.hmac(text, text, text) TO mypadifood;


--
-- TOC entry 3635 (class 0 OID 0)
-- Dependencies: 294
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_armor_headers(text, OUT key text, OUT value text) TO mypadifood;


--
-- TOC entry 3636 (class 0 OID 0)
-- Dependencies: 290
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_key_id(bytea) TO mypadifood;


--
-- TOC entry 3637 (class 0 OID 0)
-- Dependencies: 284
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea) TO mypadifood;


--
-- TOC entry 3638 (class 0 OID 0)
-- Dependencies: 286
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3639 (class 0 OID 0)
-- Dependencies: 288
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt(bytea, bytea, text, text) TO mypadifood;


--
-- TOC entry 3640 (class 0 OID 0)
-- Dependencies: 285
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea) TO mypadifood;


--
-- TOC entry 3641 (class 0 OID 0)
-- Dependencies: 287
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3642 (class 0 OID 0)
-- Dependencies: 289
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO mypadifood;


--
-- TOC entry 3643 (class 0 OID 0)
-- Dependencies: 276
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt(text, bytea) TO mypadifood;


--
-- TOC entry 3644 (class 0 OID 0)
-- Dependencies: 282
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt(text, bytea, text) TO mypadifood;


--
-- TOC entry 3645 (class 0 OID 0)
-- Dependencies: 281
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea) TO mypadifood;


--
-- TOC entry 3646 (class 0 OID 0)
-- Dependencies: 283
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text) TO mypadifood;


--
-- TOC entry 3647 (class 0 OID 0)
-- Dependencies: 279
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt(bytea, text) TO mypadifood;


--
-- TOC entry 3648 (class 0 OID 0)
-- Dependencies: 278
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt(bytea, text, text) TO mypadifood;


--
-- TOC entry 3649 (class 0 OID 0)
-- Dependencies: 277
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt_bytea(bytea, text) TO mypadifood;


--
-- TOC entry 3650 (class 0 OID 0)
-- Dependencies: 275
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pgp_sym_decrypt_bytea(bytea, text, text) TO mypadifood;


--
-- TOC entry 3651 (class 0 OID 0)
-- Dependencies: 254
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v1() TO mypadifood;


--
-- TOC entry 3656 (class 0 OID 0)
-- Dependencies: 255
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v1mc() TO mypadifood;


--
-- TOC entry 3657 (class 0 OID 0)
-- Dependencies: 256
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v3(namespace uuid, name text) TO mypadifood;


--
-- TOC entry 3658 (class 0 OID 0)
-- Dependencies: 257
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v4() TO mypadifood;


--
-- TOC entry 3659 (class 0 OID 0)
-- Dependencies: 258
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_generate_v5(namespace uuid, name text) TO mypadifood;


--
-- TOC entry 3660 (class 0 OID 0)
-- Dependencies: 249
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_nil() TO mypadifood;


--
-- TOC entry 3661 (class 0 OID 0)
-- Dependencies: 250
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_dns() TO mypadifood;


--
-- TOC entry 3662 (class 0 OID 0)
-- Dependencies: 252
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_oid() TO mypadifood;


--
-- TOC entry 3663 (class 0 OID 0)
-- Dependencies: 251
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_url() TO mypadifood;


--
-- TOC entry 3664 (class 0 OID 0)
-- Dependencies: 253
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.uuid_ns_x500() TO mypadifood;


--
-- TOC entry 2160 (class 826 OID 16391)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON SEQUENCES TO mypadifood;


--
-- TOC entry 2162 (class 826 OID 16393)
-- Name: DEFAULT PRIVILEGES FOR TYPES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TYPES TO mypadifood;


--
-- TOC entry 2161 (class 826 OID 16392)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON FUNCTIONS TO mypadifood;


--
-- TOC entry 2159 (class 826 OID 16390)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: -; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO mypadifood;


-- Completed on 2025-09-30 10:22:48

--
-- PostgreSQL database dump complete
--

\unrestrict PichOvsgGNnMn1JwuxC144QabcSZsBknscQJbV6yluUsq1S3XE2fIZOgzcZKDjJ
