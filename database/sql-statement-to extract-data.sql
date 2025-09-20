-- list all vendors (most recent first)
SELECT id, name, email, phone, state, lga, address, food_item, base_price, status, latitude, longitude, location_source, created_at
FROM vendors
ORDER BY created_at DESC;

-- list all clients (most recent first)
SELECT id, full_name, email, phone, state, lga, address, verified, wallet_balance, latitude, longitude, location_source, created_at
FROM clients
ORDER BY created_at DESC;

-- list all admins and agents
SELECT id, name, email, role, region_state, region_lga, active, preferences, must_change_password, created_at
FROM admins
WHERE role IN ('agent','super')   -- include both agent and super
ORDER BY role, created_at DESC;

-- agents
SELECT id, name, email, region_state, region_lga, active, created_at
FROM admins
WHERE role = 'agent'
ORDER BY created_at DESC;

-- super admins
SELECT id, name, email, region_state, region_lga, active, created_at
FROM admins
WHERE role = 'super'
ORDER BY created_at DESC;

-- list all approved vendors (most recent first)
SELECT id, name, email, phone, state, lga, food_item, base_price, created_at
FROM vendors
WHERE status = 'approved'
ORDER BY created_at DESC;

-- counts for quick overview
SELECT 'vendors' AS entity, COUNT(*) AS total FROM vendors
UNION ALL
SELECT 'clients' AS entity, COUNT(*) FROM clients
UNION ALL
SELECT 'admins' AS entity, COUNT(*) FROM admins;

-- admins by role
SELECT role, COUNT(*) AS total
FROM admins
GROUP BY role
ORDER BY role;

-- combined list of vendors, clients, and admins in a single JSON object
-- with each category as a separate array, ordered by created_at descending within each category
SELECT json_build_object(
  'vendors', (SELECT json_agg(v) FROM (SELECT id, name, email, phone, state, lga, address, food_item, base_price, status, created_at FROM vendors ORDER BY created_at DESC) v),
  'clients', (SELECT json_agg(c) FROM (SELECT id, full_name, email, phone, state, lga, verified, wallet_balance, created_at FROM clients ORDER BY created_at DESC) c),
  'admins',  (SELECT json_agg(a) FROM (SELECT id, name, email, role, region_state, region_lga, active, created_at FROM admins WHERE role IN ('agent','super') ORDER BY role, created_at DESC) a)
) AS all_lists;

-- separate JSON arrays for each category
-- vendors JSON
SELECT json_agg(v) AS vendors
FROM (
  SELECT id, name, email, phone, state, lga, address, food_item, base_price, status, created_at
  FROM vendors
  ORDER BY created_at DESC
) v;

-- clients JSON
SELECT json_agg(c) AS clients
FROM (
  SELECT id, full_name, email, phone, state, lga, verified, wallet_balance, created_at
  FROM clients
  ORDER BY created_at DESC
) c;

-- admins JSON
SELECT json_agg(a) AS admins
FROM (
  SELECT id, name, email, role, region_state, region_lga, active, created_at
  FROM admins
  WHERE role IN ('agent','super')
  ORDER BY role, created_at DESC
) a;

-- combined JSON object with separate arrays for vendors, clients, and admins
SELECT json_build_object(
  'vendors',  (SELECT json_agg(v) FROM (SELECT id, name, email, phone, state, lga, address, food_item, base_price, status, created_at FROM vendors ORDER BY created_at DESC) v),
  'clients',  (SELECT json_agg(c) FROM (SELECT id, full_name, email, phone, state, lga, verified, wallet_balance, created_at FROM clients ORDER BY created_at DESC) c),
  'admins',   (SELECT json_agg(a) FROM (SELECT id, name, email, role, region_state, region_lga, active, created_at FROM admins WHERE role IN ('agent','super') ORDER BY role, created_at DESC) a)
) AS all_lists;


-- Example: server-side (Postgres user must have filesystem write access)
COPY (
  SELECT id, name, email, phone, state, lga, address, food_item, base_price, status, created_at
  FROM vendors
  ORDER BY created_at DESC
) TO '/var/lib/postgresql/exports/vendors.csv' WITH CSV HEADER;

-- Example: server-side (Postgres user must have filesystem write access)
\copy (
  SELECT id, name, email, phone, state, lga, address, food_item, base_price, status, created_at
  FROM vendors
  ORDER BY created_at DESC
) TO 'vendors.csv' CSV HEADER;

\copy (
  SELECT id, full_name, email, phone, state, lga, verified, wallet_balance, created_at
  FROM clients
  ORDER BY created_at DESC
) TO 'clients.csv' CSV HEADER;

\copy (
  SELECT id, name, email, role, region_state, region_lga, active, created_at
  FROM admins
  WHERE role IN ('agent','super')
  ORDER BY role, created_at DESC
) TO 'admins.csv' CSV HEADER;

