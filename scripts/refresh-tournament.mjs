// Builds src/data/tournament.json: the PDC tournament in progress (or the most
// recent / next one). The Matches page also refreshes this live in the browser.
import { API, BROADCASTERS, normaliseTournament } from '../src/lib/pdc.mjs';
import { get, getAll, writeJsonIfChanged, today, log } from './lib.mjs';

const OUT = new URL('../src/data/tournament.json', import.meta.url).pathname;
const t = today();
const year = Number(t.slice(0, 4));

const rows = [];
for (const season of [year - 1, year, year + 1]) rows.push(...(await getAll(API.tournaments, { seasonID: season }, 100)));
const list = rows
  .map(r => ({ id: r.id, ...r.attributes }))
  .filter(a => ['2', '3', '4'].includes(a.tournamentCategoryID) && !/qualifier|test/i.test(a.name));

const inScope = a => !!BROADCASTERS[a.tournamentTypeID];
const live = a => a.startDate <= t && a.endDate >= t;
const pick =
  list.find(a => live(a) && inScope(a)) ||
  list.find(a => live(a)) ||
  list.filter(a => inScope(a) && a.startDate > t).sort((x, y) => x.startDate.localeCompare(y.startDate))
    .find(a => (new Date(a.startDate) - new Date(t)) / 864e5 <= 3) ||
  list.filter(a => inScope(a) && a.endDate < t).sort((x, y) => y.endDate.localeCompare(x.endDate))[0];

if (!pick) throw new Error('No tournament found');
const tournament = normaliseTournament(await get(`${API.tournaments}${pick.id}`));
const next = list.filter(a => inScope(a) && a.startDate > tournament.end)
  .sort((x, y) => x.startDate.localeCompare(y.startDate))[0];

const changed = await writeJsonIfChanged(OUT, {
  updatedAt: new Date().toISOString(),
  tournament,
  next: next ? { id: next.id, name: next.name.replace(/^\d{4}(\/\d{2,4})?\s+/, ''), start: next.startDate, end: next.endDate, broadcaster: BROADCASTERS[next.tournamentTypeID] } : null,
}, { stamp: 'updatedAt' });
log(`tournament: ${tournament.fullName} (${changed ? 'updated' : 'unchanged'})`);
