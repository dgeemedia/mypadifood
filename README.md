# MyPadiFood
Small Express + EJS MVP for a local food vendor marketplace.

## Setup
1. Copy files into project folder.
2. Fill .env with real values.
3. Run `pnpm install`.
4. Create Postgres DB and run migrations in `/migrations/init.sql`.
5. Optionally run `psql -f scripts/seed_vendors.sql` to seed sample data.
6. Start dev server: `pnpm dev`.

## Notes
- This starter uses `pg` driver. You can swap to Knex or Sequelize later.
- GDPR/privacy: phone numbers are stored but not returned through public endpoints.
