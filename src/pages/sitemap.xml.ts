// Sitemap for search engines: every page the site builds.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import calendar from '../data/calendar.json';
import data from '../data/tournament.json';
import { rankedProfiles } from '../lib/players';

export const GET: APIRoute = async ({ site }) => {
  const u = (p: string) => new URL(p, site).href;
  const today = new Date().toISOString().slice(0, 10);
  const rows: { loc: string; lastmod?: string; freq: string; pri: string }[] = [
    { loc: u('/'), freq: 'hourly', pri: '1.0' },
    { loc: u('/news'), freq: 'hourly', pri: '0.9' },
    { loc: u('/calendar'), freq: 'daily', pri: '0.8' },
    { loc: u('/rankings'), freq: 'daily', pri: '0.8' },
    { loc: u('/stats'), freq: 'daily', pri: '0.8' },
    { loc: u('/about'), freq: 'monthly', pri: '0.3' },
    { loc: u('/privacy'), freq: 'yearly', pri: '0.2' },
    { loc: u('/credits'), freq: 'monthly', pri: '0.2' },
  ];
  const ids = new Set([data.tournament.id, ...calendar.events.map(e => e.id)]);
  for (const id of ids) rows.push({ loc: u(`/tournament/${id}`), freq: 'daily', pri: '0.7' });
  for (const { profile } of rankedProfiles()) rows.push({ loc: u(`/players/${profile.slug}`), lastmod: today, freq: 'daily', pri: '0.6' });
  for (const n of await getCollection('news')) rows.push({ loc: u(`/news/${n.data.slug}`), lastmod: n.data.date.slice(0, 10), freq: 'weekly', pri: '0.6' });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map(r => `  <url><loc>${r.loc}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ''}<changefreq>${r.freq}</changefreq><priority>${r.pri}</priority></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
