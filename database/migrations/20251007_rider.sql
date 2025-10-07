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

-- Add review audit columns to riders
ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reason text;

-- Optional index to filter by reviewer quickly
CREATE INDEX IF NOT EXISTS idx_riders_reviewed_by ON riders(reviewed_by);
