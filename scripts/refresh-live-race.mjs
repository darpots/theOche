// Precomputes the live race so pages can show it instantly.
// Writes src/data/live-race.json: the ranking event in progress, the events
// whose money is expiring, each player's expiring money (fixed for the whole
// event) and the projected top 150. Pages show this at once and then refresh
// it in the background with just the rankings and the current tournament.
import { API, normaliseRankings, findLiveRaceEvent, expiringMap, liveRaceWith } from '../src/lib/pdc.mjs';
import { get, writeJsonIfChanged, today, log } from './lib.mjs';

const OUT = new URL('../src/data/live-race.json', import.meta.url).pathname;
const found = await findLiveRaceEvent(today());
if (!found) {
  await writeJsonIfChanged(OUT, { updatedAt: new Date().toISOString(), event: null }, { stamp: 'updatedAt' });
  log('live race: no ranking event in progress');
} else {
  const official = normaliseRankings(await get(`${API.rankings}2YEAR?page.size=500`));
  const current = (await get(API.tournaments + found.meta.id)).data.attributes;
  const expiring = Object.fromEntries(expiringMap(found.prev));
  const race = liveRaceWith(official, current, expiring).filter(p => p.live <= 150)
    .map(({ id, name, slug, pos, live, move, money, plus, minus, expiring: ex, round, alive, estimated }) =>
      ({ id, name, slug, pos, live, move, money, plus, minus, expiring: ex, round, alive, estimated }));
  const m = found.meta;
  const changed = await writeJsonIfChanged(OUT, {
    updatedAt: new Date().toISOString(),
    event: { id: m.id, name: m.name, seasonID: m.seasonID, startDate: m.startDate, endDate: m.endDate },
    dropNames: found.dropNames,
    expiring,
    race,
  }, { stamp: 'updatedAt' });
  log(`live race: ${m.name}, dropping ${found.dropNames.join(' + ')} (${changed ? 'updated' : 'unchanged'})`);
}
