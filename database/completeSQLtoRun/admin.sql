-- seed_admin.sql
-- Create a single admin user for the admins table (safe seed).
-- If pgcrypto is installed, password will be bcrypt-hashed (default: ChangeMe123!).
-- IMPORTANT: Change the seeded password immediately after login.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    INSERT INTO public.admins (id, name, email, password_hash, role, region_state, region_lga, active, created_at, preferences, must_change_password)
    VALUES (
      gen_random_uuid(),
      'Platform Admin',
      'admin@mypadi.com',
      crypt('ChangeMe123!', gen_salt('bf', 10)),
      'admin',
      NULL,
      NULL,
      true,
      now(),
      '{}'::jsonb,
      true
    )
    ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          password_hash = EXCLUDED.password_hash,
          role = 'admin',
          active = TRUE,
          must_change_password = TRUE;
  ELSE
    INSERT INTO public.admins (id, name, email, password_hash, role, region_state, region_lga, active, created_at, preferences, must_change_password)
    VALUES (
      gen_random_uuid(),
      'Platform Admin',
      'admin@mypadi.com',
      '<REPLACE_WITH_BCRYPT_HASH>',
      'admin',
      NULL,
      NULL,
      true,
      now(),
      '{}'::jsonb,
      true
    )
    ON CONFLICT (email) DO NOTHING;
    RAISE NOTICE 'pgcrypto not installed — admin created with placeholder password_hash. Install pgcrypto or replace placeholder with a bcrypt hash and update must_change_password as required.';
  END IF;
END
$$;
