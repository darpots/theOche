// RSS feed of the latest news reports.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/site.mjs';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const items = (await getCollection('news')).map(n => n.data).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  const link = (p: string) => new URL(p, site).href;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(SITE.name)} news</title>
  <link>${link('/news')}</link>
  <atom:link href="${link('/rss.xml')}" rel="self" type="application/rss+xml" />
  <description>${esc(SITE.tagline)}</description>
  <language>en-gb</language>
${items.map(s => `  <item>
    <title>${esc(s.headline)}</title>
    <link>${link(`/news/${s.slug}`)}</link>
    <guid isPermaLink="true">${link(`/news/${s.slug}`)}</guid>
    <pubDate>${new Date(s.date).toUTCString()}</pubDate>
    <description>${esc(s.standfirst)}</description>
${s.tags.map(t => `    <category>${esc(t)}</category>`).join('\n')}
  </item>`).join('\n')}
</channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
