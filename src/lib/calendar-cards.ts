// Shared by /calendar and /calendar/past (the past seasons, loaded on demand).

import calendar from '../data/calendar.json';
import { avatarSrc, cutout } from '../lib/images.mjs';
import { getCollection } from 'astro:content';
import current from '../data/tournament.json';
import venuePhotos from '../data/venue-photos.json';
import { tvBadge, keyName } from '../lib/pdc.mjs';
import { dayNum, monthShort, monthLong, weekday, dateRange, initials, avatarColours } from '../lib/format.mjs';

export const pic = (name: string) => avatarSrc(name);
export const av = (name: string) => { const [c1, c2] = avatarColours(name); return `--c1:${c1};--c2:${c2}`; };
export const days = (e: { start: string; end: string }) => Math.round((Date.parse(e.end) - Date.parse(e.start)) / 864e5) + 1;

export type Ev = (typeof calendar.events)[number];
export const events = calendar.events as Ev[];
export const months = new Map<string, Ev[]>();
for (const e of events) {
  const k = e.start.slice(0, 7);
  if (!months.has(k)) months.set(k, []);
  months.get(k)!.push(e);
}
export const place = (e: { venue: string | null; city: string | null }) => (e.venue && e.city && e.venue.includes(e.city) ? e.venue : [e.venue, e.city].filter(Boolean).join(' · '));
export const kind = (e: Ev) => e.broadcaster;
// Completed events start hidden in the HTML too (the site rebuilds daily), so the
// "Include past 2 years" toggle is right even before the script below runs.
export const builtOn = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
export const isPast = (e: Ev) => e.end < builtOn;
export const isLive = (e: Ev) => e.start <= builtOn && e.end >= builtOn;

// The calendar opens on the previous, current and next tournaments: the page's own
// HTML starts at the month of the latest event to have finished, and the two years
// before it (/calendar/past) load in after the first paint.
const lastDone = events.filter(isPast).map(e => e.start.slice(0, 7)).sort().pop();
export const focusMonth = lastDone || [...months.keys()].sort()[0] || '';
export const focusMonths = [...months.entries()].filter(([k]) => k >= focusMonth);
export const pastMonths = [...months.entries()].filter(([k]) => k < focusMonth);

// What each event's page has, shown as badges so people know it's there.
const allNews = (await getCollection('news')).map(n => n.data);  // top-level await: fine in an ES module
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const newsFor = (e: Ev) => allNews.filter(n => n.tournament ? n.tournament === e.id : n.tags.some(t => t.toLowerCase() === e.name.toLowerCase()) && n.date.slice(0, 10) >= shift(e.start, -7) && n.date.slice(0, 10) <= shift(e.end, 3)).length;
const KNOCKOUT_FREE = /premier league/i; // league nights have a bracket but no "draw" as such
const hasDraw = (e: Ev) => ((e as any).fixtures > 0 || e.id === current.tournament.id) && !KNOCKOUT_FREE.test(e.name);
export function badges(e: Ev) {
  const b: { cls: string; text: string }[] = [];
  if (isLive(e)) b.push({ cls: 'live', text: 'Live scores' });
  else if (isPast(e)) b.push({ cls: 'res', text: 'Results' });
  else if ((e as any).fixtures > 0) b.push({ cls: 'sched', text: 'Schedule out' });
  if (hasDraw(e)) b.push({ cls: 'draw', text: 'Draw' });
  const n = newsFor(e);
  if (n) b.push({ cls: 'news', text: `News ${n}` });
  return b;
}
// Majors get a wide feature card with a licensed photo that fits the event.
const MAJOR_PHOTO: [RegExp, string][] = [[/world championship/i, 'ally-pally-crowd'], [/matchplay/i, 'winter-gardens'], [/grand slam/i, 'on-stage'], [/grand prix/i, 'board-lights'], [/uk open/i, 'crowd-180s'], [/european championship/i, 'darts-cluster'], [/players championship/i, 'referee'], [/masters/i, 'confetti'], [/world cup/i, 'crowd-signs'], [/world series/i, 'walk-on-crowd']];
export const featured = (e: Ev) => !!e.major;
const photoFor = (e: Ev) => (MAJOR_PHOTO.find(([re]) => re.test(e.name))?.[1]) || 'arena';
// Every card has a background: the venue's photo, else (for majors) a fitting
// library photo, else one of eight generated backgrounds picked by the event id.
const venueKey = (v: string | null) => String(v || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const VENUES = venuePhotos as Record<string, unknown>;
export const bgFor = (e: Ev) => {
  const k = venueKey(e.venue);
  if (VENUES[k]) return `/venues/${k}-600.webp`;
  if (featured(e)) return `/news-img/${photoFor(e)}-600.webp`;
  return `/venues/bg-${(Number(e.id) % 8) + 1}-600.webp`;
};
export const champCut = (e: Ev) => (e.winner ? cutout(e.winner.name, 'pdc') : null);
