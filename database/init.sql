-- database/init.sql
-- MyPadifood initial schema + seed super admin (hash created in-DB using pgcrypto)
-- Safe to run on a fresh DB. Idempotent where possible.

-- 1) Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- used for crypt() hashing

-- 2) clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  state TEXT,
  lga TEXT,
  address TEXT,
  password_hash TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  wallet_balance NUMERIC DEFAULT 0,
  latitude double precision,
  longitude double precision,
  location_source TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_latlon ON clients(latitude, longitude);

-- 3) vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  state TEXT,
  lga TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  food_item TEXT,
  base_price NUMERIC,
  status TEXT DEFAULT 'pending',   -- pending | approved | rejected
  latitude double precision,
  longitude double precision,
  location_source TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_state_lga ON vendors(state, lga);
CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_latlon ON vendors(latitude, longitude);

-- 4) admins table
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent', -- agent | super
  region_state TEXT,
  region_lga TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- 5) orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  item TEXT,
  status TEXT DEFAULT 'pending',
  assigned_admin uuid REFERENCES admins(id),
  payment_method TEXT,
  total_amount NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 6) session table used by connect-pg-simple (explicitly created)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);

-- create primary key constraint on session.sids only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
  ) THEN
    ALTER TABLE "session" ADD CONSTRAINT session_pkey PRIMARY KEY ("sid");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- 7) Super-admin seed removed.
-- NOTE: The previous SQL seed used pgcrypto. That produces a crypt() hash incompatible with bcryptjs
-- used by the Node app. To avoid login mismatch, the SQL seed has been intentionally removed.
-- Please create the initial super admin using the Node helper script:
--   node createSuperAdmin.js super@admin.local 'YourStrongPassword!'
-- or set env vars:
--   SUPER_ADMIN_EMAIL=super@admin.local SUPER_ADMIN_PASSWORD='YourStrongPassword!' node createSuperAdmin.js
--
-- If you must seed via SQL, generate a bcrypt-compatible hash in Node and INSERT it here as a literal.


-- 8) Convenience notes
-- - After running this, log in with super@admin.local / ChangeMe123! (if you left the password) and change it immediately.
-- - To create the admin more securely, run the createSuperAdmin.js script provided in the project which hashes the password in Node.
-- - To remove the seeded account later, use: DELETE FROM admins WHERE email='super@admin.local';
