// "Add to calendar": the event (all day, every day) plus each scheduled match
// at its UK start time, as an .ics file calendars can import or subscribe to.
import type { APIRoute } from 'astro';
import data from '../../data/tournament.json';
import calendar from '../../data/calendar.json';
import { ukZone } from '../../lib/format.mjs';
import { BROADCASTER_INFO } from '../../lib/pdc.mjs';
import { SITE } from '../../lib/site.mjs';

export function getStaticPaths() {
  const seen = new Set<string>();
  return [data.tournament, ...calendar.events].filter((e: any) => e && !seen.has(e.id) && seen.add(e.id)).map((e: any) => ({ params: { id: e.id }, props: { ev: e } }));
}

const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');
const day = (d: string) => d.replace(/-/g, '');
const next = (d: string) => new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10).replace(/-/g, '');
/** UK local date + time to UTC "YYYYMMDDTHHMMSSZ". */
const utc = (d: string, hhmm: string) => {
  const off = ukZone(d) === 'BST' ? 1 : 0;
  return new Date(Date.parse(`${d}T${hhmm}:00Z`) - off * 3600e3).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
};
// Long lines are folded at 75 octets, as the format requires.
const fold = (line: string) => line.match(/.{1,74}/g)!.join('\r\n ');

export const GET: APIRoute = ({ props, site }) => {
  const ev: any = props.ev;
  const isCurrent = ev.id === data.tournament.id;
  const t: any = isCurrent ? data.tournament : ev;
  const where = t.venue && t.city && t.venue.includes(t.city) ? t.venue : [t.venue, t.city].filter(Boolean).join(', ');
  const tv = (BROADCASTER_INFO as any)[t.broadcaster]?.label;
  const url = new URL(`/tournament/${t.id}`, site).href;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${SITE.name}//Darts calendar//EN`, 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(t.name)}`,
    'BEGIN:VEVENT', `UID:event-${t.id}@oche`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(t.start)}`, `DTEND;VALUE=DATE:${next(t.end)}`,
    `SUMMARY:${esc(t.name)}${t.tag ? esc(` (${t.tag})`) : ''}`, where ? `LOCATION:${esc(where)}` : '', `DESCRIPTION:${esc(`${tv ? `Live on ${tv}. ` : ''}Schedule and live scores: ${url}`)}`, `URL:${url}`, 'END:VEVENT'];
  if (isCurrent) {
    for (const s of t.stages) for (const f of s.fixtures) {
      if (!f.p1 || !f.p2 || !f.time || !f.date) continue;
      lines.push('BEGIN:VEVENT', `UID:match-${f.id}@oche`, `DTSTAMP:${stamp}`, `DTSTART:${utc(f.date, f.time)}`, 'DURATION:PT1H',
        `SUMMARY:${esc(`${f.p1.name} v ${f.p2.name}`)}`, `DESCRIPTION:${esc(`${t.name}, ${s.name}${tv ? ` · ${tv}` : ''}. Live: ${new URL(`/match?id=${f.id}`, site).href}`)}`,
        where ? `LOCATION:${esc(where)}` : '', 'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.filter(Boolean).map(fold).join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
