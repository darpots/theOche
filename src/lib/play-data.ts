// Build-time data for the interactive pages (/play, /h2h, /my, /world-championship):
// a compact list of ranked players with the numbers the games and tools need.
import rankings from '../data/rankings.json';
import { loadProfile } from './players';
import { cutout, avatarSrc } from './images.mjs';
import { countryName } from './pdc.mjs';

export interface PlayPlayer {
  id: string; name: string; slug: string; pos: number; nick: string | null; country: string; countryName: string;
  avg: number | null; f9: number | null; t80: number | null; co: number | null; hi: number | null;
  titles: number; won: number; lost: number; age: number | null; darts: string | null; walkOn: string | null;
  nine: number; cut: string | null; avatar: string | null; started: number | null; hand: 'left' | 'right';
}

const ageOf = (dob?: string) => {
  if (!dob) return null;
  const d = new Date(dob), n = new Date();
  return n.getFullYear() - d.getFullYear() - (n < new Date(n.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
};

/** Ranked players (top `limit`), best first. */
export function playPlayers(limit = 128): PlayPlayer[] {
  return rankings.players.slice(0, limit).map(r => {
    const p = loadProfile(r.id) || {};
    const st = p.season?.stats || {};
    return {
      id: String(r.id), name: r.name, slug: r.slug, pos: r.pos, nick: p.nick || null, country: r.country || p.country || '',
      countryName: countryName(r.country || p.country || ''),
      avg: st.avg ?? null, f9: st.f9 ?? null, t80: st.t80 ?? null, co: st.co ?? null, hi: st.hi ?? null,
      titles: p.season?.titles?.length ?? 0, won: p.season?.won ?? 0, lost: p.season?.lost ?? 0,
      age: ageOf(p.dob), darts: p.darts || null, walkOn: p.walkOn || null, nine: p.nineDarters || 0,
      cut: cutout(r.name, 'pdc')?.src || null, avatar: avatarSrc(r.name) || null,
      started: p.started || null, hand: p.leftHanded ? 'left' : 'right',
    };
  });
}

/** JSON for a <script type="application/json"> block (safe inside HTML). */
export const jsonForHtml = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
