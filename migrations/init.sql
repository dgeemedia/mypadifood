-- Run this against your Postgres DB
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  password_hash text,
  role text NOT NULL CHECK (role IN ('customer','vendor','admin','manager')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text,
  lat double precision,
  lng double precision,
  food_item text,
  price_min integer,
  phone text,
  email text,
  business_type text,
  status text NOT NULL DEFAULT 'unverified',
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vendor_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  url text,
  alt text
);

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,
  name text,
  description text,
  price integer
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES users(id),
  vendor_id uuid REFERENCES vendors(id),
  menu_item_id uuid REFERENCES menu_items(id),
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  pickup_time timestamptz
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES users(id),
  vendor_id uuid REFERENCES vendors(id),
  amount integer,
  quantity integer DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  booking_date timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance numeric DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid REFERENCES wallets(id),
  type text NOT NULL CHECK (type IN ('topup','order_payment','refund','cashback')),
  amount numeric NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id),
  admin_id uuid REFERENCES users(id),
  notes text,
  action text,
  created_at timestamptz DEFAULT now()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_vendors_lat_lng ON vendors (lat, lng);
