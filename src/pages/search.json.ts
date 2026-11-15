// Search index for the site search (players, events, news), built at deploy.
import { getCollection } from 'astro:content';
import rankings from '../data/rankings.json';
import calendar from '../data/calendar.json';
import { countryName } from '../lib/pdc.mjs';

export async function GET() {
  const players = rankings.players.filter(p => p.pos <= 128).map(p => ({ t: 'p', n: p.name, s: `World #${p.pos}${p.nick ? ` · ${p.nick}` : ''} · ${countryName(p.country) || ''}`, u: `/players/${p.slug}`, k: `${p.name} ${p.nick || ''} ${countryName(p.country) || ''}`.toLowerCase(), c: p.country }));
  const events = calendar.events.map(e => ({ t: 'e', n: [e.name, e.tag].filter(Boolean).join(' · '), s: new Date(e.start + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + (e.city ? ` · ${e.city}` : ''), u: `/tournament/${e.id}`, k: `${e.name} ${e.tag || ''} ${e.city || ''}`.toLowerCase(), d: e.start }));
  const cutoff = Date.now() - 200 * 864e5;
  const news = (await getCollection('news')).map(n => n.data).filter(n => Date.parse(n.date) >= cutoff).sort((a, b) => b.date.localeCompare(a.date))
    .map(n => ({ t: 'n', n: n.headline, s: new Date(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), u: `/news/${n.slug}`, k: `${n.headline} ${n.players.join(' ')} ${n.tags.join(' ')}`.toLowerCase() }));
  return new Response(JSON.stringify([...players, ...events, ...news]), { headers: { 'content-type': 'application/json' } });
}
