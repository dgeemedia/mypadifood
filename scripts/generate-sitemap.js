// scripts/generate-sitemap.js
// Usage: node scripts/generate-sitemap.js > public/sitemap.xml


const fs = require('fs');
const path = require('path');


// Edit these lists to reflect your site's real routes or output them from your DB
const SITE_URL = process.env.SITE_URL || 'https://www.mypadifood.com';


const staticRoutes = [
'/',
'/about',
'/contact',
'/careers',
'/terms',
'/privacy',
'/faq'
];


// Example dynamic data source: vendors and blog posts
// You can replace this with a DB query or load a JSON export
let vendors = [];
let posts = [];


try {
const vendorsPath = path.join(__dirname, '..', 'data', 'vendors.json');
if (fs.existsSync(vendorsPath)) vendors = JSON.parse(fs.readFileSync(vendorsPath, 'utf8'));
} catch (e) {
// ignore
}


try {
const postsPath = path.join(__dirname, '..', 'data', 'posts.json');
if (fs.existsSync(postsPath)) posts = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
} catch (e) {
// ignore
}


const urls = new Set();
staticRoutes.forEach(r => urls.add(r));


// assume vendor objects have slug field
vendors.forEach(v => {
if (v.slug) urls.add(`/vendor/${v.slug}`);
});


// assume posts have slug
posts.forEach(p => {
if (p.slug) urls.add(`/blog/${p.slug}`);
});


// build XML
function xmlEscape(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


console.log('<?xml version="1.0" encoding="UTF-8"?>');
console.log('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');


Array.from(urls).sort().forEach(urlPath => {
const loc = SITE_URL.replace(/\/$/, '') + urlPath;
console.log(' <url>');
console.log(` <loc>${xmlEscape(loc)}</loc>`);
console.log(' <changefreq>weekly</changefreq>');
console.log(' <priority>0.5</priority>');
console.log(' </url>');
});


console.log('</urlset>');