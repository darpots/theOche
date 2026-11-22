// World Championship roll of honour, built from PDC results at every build:
//  - data/results-cache.json: every finished event the daily players job has
//    downloaded (PDC Worlds back to 2005/06), with the winner's id
//  - src/data/calendar.json and tournament.json: refreshed hourly, so a new
//    champion appears within the hour of the final, before the daily job runs
// Each entry is the year the final was played and the champion.
import results from '../../data/results-cache.json';
import calendar from '../data/calendar.json';
import current from '../data/tournament.json';
import rankings from '../data/rankings.json';

// Champions from before the cached events carried player names. PDC ids never
// change, and every newer champion comes with a name in the data.
const RETIRED: Record<string, string> = { '332': 'Phil Taylor', '36': 'John Part', '133': 'Adrian Lewis' };

const isWorlds = (name = '') => /world (darts )?championship/i.test(name) && !/youth|women|cup|senior|masters|qualif/i.test(name);

export interface Champion { year: number; name: string; slug: string | null }

export function worldsRoll(): Champion[] {
  const R = results as Record<string, any>;
  // Names for player ids, from every source that has them.
  const names = new Map<string, string>(Object.entries(RETIRED));
  for (const t of Object.values(R)) for (const [id, n] of Object.entries(t.pn || {})) names.set(id, n as string);
  for (const p of rankings.players) names.set(String(p.id), p.name);

  const byYear = new Map<number, string>();
  for (const t of Object.values(R)) {
    if (t.ty !== '1' || !isWorlds(t.n) || !t.w || !t.e) continue;
    const n = names.get(String(t.w));
    if (n) byYear.set(Number(t.e.slice(0, 4)), n);
  }
  // The hourly data has a new champion first.
  for (const e of calendar.events as any[]) if (isWorlds(e.name) && e.winner?.name && e.end) byYear.set(Number(e.end.slice(0, 4)), e.winner.name);
  const t = current.tournament as any;
  if (isWorlds(t.name) && t.winner?.name && t.end) byYear.set(Number(t.end.slice(0, 4)), t.winner.name);

  const slugOf = new Map(rankings.players.map(p => [p.name, p.slug]));
  return [...byYear].sort((a, b) => b[0] - a[0]).map(([year, name]) => ({ year, name, slug: slugOf.get(name) || null }));
}
