// scripts/generate-sitemap.js
// Generates sitemap.xml using Postgres DB if available, otherwise falls back to static routes.
// Usage: node scripts/generate-sitemap.js > public/sitemap.xml

const fs = require('fs');
const { Pool } = require('pg');

const SITE = (process.env.SITE_URL || 'https://www.mypadifood.com').replace(/\/$/,'');
const staticRoutes = [
  '/', '/about', '/contact', '/careers', '/faq', '/vendor/register', '/rider/register', '/signup-choice', '/login'
];

async function run() {
  const urls = new Set(staticRoutes.map(p => SITE + p));
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (process.env.PGSSLMODE === 'require') ? { rejectUnauthorized: false } : false });
    try {
      // vendors
      const vRes = await pool.query("SELECT id, updated_at FROM vendors WHERE status='approved' LIMIT 10000");
      vRes.rows.forEach(r => urls.add(`${SITE}/vendor/${r.id}`));
      // blog posts (if table exists)
      try {
        const bRes = await pool.query("SELECT slug, updated_at FROM posts LIMIT 10000");
        bRes.rows.forEach(r => urls.add(`${SITE}/blog/${r.slug}`));
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('DB error (continuing with static routes):', e.message);
    } finally {
      await pool.end();
    }
  }

  // output sitemap
  console.log('<?xml version="1.0" encoding="UTF-8"?>');
  console.log('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  [...urls].forEach(url => {
    console.log('  <url>');
    console.log(`    <loc>${url}</loc>`);
    console.log('  </url>');
  });
  console.log('</urlset>');
}

run().catch(err => { console.error(err); process.exit(1); });
