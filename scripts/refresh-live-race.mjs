// Precomputes the live race so pages can show it instantly.
// Writes src/data/live-race.json: the ranking events played since the PDC last
// republished its rankings (the one in progress, plus any that finished but are
// not in the official list yet), the events whose money is expiring, each
// player's expiring money and the projected top 150. The rankings page shows
// this at once and refreshes the event in progress in the browser.
//
// Runs hourly. It keeps state between runs: a signature of the official list,
// so it can tell when the PDC has republished it (finished events are then in
// the official figures and drop out of the race), and each player's ranking
// reset date, worked out again whenever the official list changes.
import { createHash } from 'node:crypto';
import {
  API, normaliseRankings, isRankedEvent, eventPrizes, expiringMap, liveRaceWith,
  eventsDropping, resetCandidates, acceptReset, pendingEvents,
} from '../src/lib/pdc.mjs';
import { writeFile } from 'node:fs/promises';
import { get, getAll, readJson, writeJsonIfChanged, pool, today, log } from './lib.mjs';

const OUT = new URL('../src/data/live-race.json', import.meta.url).pathname;
const day = today();
const prev = await readJson(OUT, {});

const official = normaliseRankings(await get(`${API.rankings}2YEAR?page.size=500`));
if (official.length < 128) throw new Error(`Rankings incomplete (${official.length})`);
const sig = createHash('sha1').update(official.map(p => `${p.id}:${p.money}`).join(',')).digest('hex').slice(0, 16);
const republished = !!prev.officialSig && prev.officialSig !== sig;

// Every ranked event from three seasons back to next season.
const y = Number(day.slice(0, 4));
const allRows = (await Promise.all([y - 3, y - 2, y - 1, y, y + 1].map(s => getAll(API.tournaments, { seasonID: s }, 500))))
  .flat().map(d => ({ id: d.id, ...d.attributes }));
const idx = allRows.filter(t => isRankedEvent(t) && !/test/i.test(t.name));

// Self-check: when the PDC republishes after the pending events have all
// finished, compare what the race predicted with the new official figures.
// The result is kept in the data file (and written out when it is poor).
let lastCheck = prev.lastCheck || null;
if (republished && prev.event && !prev.event.live && prev.race?.length) {
  const byId = new Map(official.map(p => [p.id, p]));
  const compared = prev.race.filter(p => byId.has(p.id));
  const misses = compared.filter(p => byId.get(p.id).money !== p.money);
  lastCheck = {
    checkedAt: new Date().toISOString(),
    events: prev.settledNames?.length ? prev.settledNames : [prev.event.name],
    compared: compared.length,
    exact: compared.length - misses.length,
    misses: misses.slice(0, 25).map(p => ({ name: p.name, predicted: p.money, official: byId.get(p.id).money })),
  };
  log(`live race self-check: ${lastCheck.exact}/${lastCheck.compared} players' money exactly as predicted after ${lastCheck.events.join(' + ')}`);
  if (lastCheck.exact < lastCheck.compared * 0.95) await writeFile('.live-race-check.txt',
    `After ${lastCheck.events.join(' + ')} the PDC's official rankings differed from the live race's prediction for ${misses.length} of ${compared.length} players.\n\n`
    + lastCheck.misses.map(x => `- ${x.name}: predicted £${x.predicted}, official £${x.official}`).join('\n') + '\n');
}

// Events of a type the code doesn't know, at ProTour or major level, played
// recently or coming up: their money is not counted, so they need checking.
const KNOWN_UNRANKED_TYPES = ['3', '11', '13', '17', '18', '32', '54', '83', '84', '85', '86', '87', '99'];
const near = d => Math.abs(Date.parse(d) - Date.parse(day)) < 45 * 864e5;
const unknown = allRows.filter(t => !isRankedEvent(t) && !KNOWN_UNRANKED_TYPES.includes(String(t.tournamentTypeID))
  && ['2', '4'].includes(String(t.tournamentCategoryID)) && near(t.startDate));
if (unknown.length) {
  log(`live race: WARNING ${unknown.length} event(s) of an unknown type, not counted: ${unknown.map(t => t.name).join(', ')}`);
  await writeFile('.unknown-event-types.txt', 'These PDC events are of a type the live race does not know, so their money is not counted. Check whether they count towards the Order of Merit and, if so, add the type to RANKED_TYPES in src/lib/pdc.mjs.\n\n'
    + unknown.map(t => `- ${t.name} (type ${t.tournamentTypeID}, starts ${t.startDate}, feed says ${t.isRanked ? 'ranked' : 'not ranked'})`).join('\n') + '\n');
}

// Events not in the official list yet (see pendingEvents).
const pending = pendingEvents(idx, prev.pending || [], { day, since: (prev.updatedAt || '').slice(0, 10) || day, republished });

// Ranking resets: worked out again whenever the official list changes.
let countsFrom = prev.countsFrom;
if (!countsFrom || prev.officialSig !== sig) {
  const ids = new Set(pending.map(t => t.id));
  const included = idx.filter(t => !ids.has(t.id) && t.fixtureCount > 0 && t.endDate < day);
  const lastIncluded = included.map(t => t.endDate).sort().pop();
  const windowStart = new Date(Date.parse(lastIncluded + 'T12:00:00Z') - 728 * 864e5).toISOString().slice(0, 10);
  const inWindow = included.filter(t => t.endDate > windowStart);
  const totals = new Map();
  await pool(inWindow, 6, async t => {
    const a = (await get(API.tournaments + t.id)).data.attributes;
    for (const [id, r] of eventPrizes(a)) if (r.amount) (totals.get(id) || totals.set(id, []).get(id)).push({ endDate: t.endDate, amount: r.amount });
  });
  const starts = [...new Set(inWindow.map(t => t.seasonID))].map(s => `${s}-01-10`).filter(d => d > windowStart).sort();
  const cands = resetCandidates(official, totals, starts);
  // Check each candidate against the player's Tour Card years.
  countsFrom = {};
  await pool(Object.entries(cands), 6, async ([id, c]) => {
    const years = (await get(API.participants + id).catch(() => null))?.data?.attributes?.tourCardYears || [];
    if (acceptReset(c, years)) countsFrom[id] = c.from;
  });
  countsFrom = Object.fromEntries(Object.entries(countsFrom).sort(([a], [b]) => Number(a) - Number(b)));
  log(`live race: ranking resets for ${Object.keys(countsFrom).length} players (${inWindow.length} events in the window)`);
}

if (!pending.length) {
  await writeJsonIfChanged(OUT, { updatedAt: new Date().toISOString(), officialSig: sig, countsFrom, lastCheck, pending: [], event: null }, { stamp: 'updatedAt' });
  log('live race: no ranking event since the official list was last updated');
} else {
  const payloads = await Promise.all(pending.map(t => get(API.tournaments + t.id).then(r => r.data.attributes)));
  // The event shown in the race: the one being played, else the latest finished.
  const curIdx = Math.max(0, pending.findLastIndex(t => t.startDate <= day && t.endDate >= day));
  const showIdx = pending.some(t => t.startDate <= day && t.endDate >= day) ? curIdx : pending.length - 1;
  const live = pending[showIdx].endDate >= day;
  // Money from the other pending events (finished, not yet official).
  const settled = {};
  payloads.forEach((a, i) => {
    if (i === showIdx && live) return;
    for (const [id, r] of eventPrizes(a)) if (r.amount) settled[id] = { amount: (settled[id]?.amount || 0) + r.amount, name: r.name };
  });
  const drops = eventsDropping(idx, pending, day);
  const dropPayloads = await Promise.all(drops.map(t => get(API.tournaments + t.id).then(r => ({ ...r.data.attributes, endDate: t.endDate }))));
  const expiring = Object.fromEntries(expiringMap(dropPayloads, countsFrom));
  const race = liveRaceWith(official, live ? payloads[showIdx] : null, expiring, settled).filter(p => p.live <= 150)
    .map(({ id, name, slug, pos, live: l, move, money, plus, minus, expiring: ex, round, alive, estimated }) =>
      ({ id, name, slug, pos, live: l, move, money, plus, minus, expiring: ex, round, alive, estimated }));
  const m = pending[showIdx];
  const changed = await writeJsonIfChanged(OUT, {
    updatedAt: new Date().toISOString(),
    officialSig: sig,
    // Lets the browser check it has the same official list before recomputing.
    officialTotal: official.reduce((n, p) => n + p.money, 0),
    countsFrom,
    lastCheck,
    pending: pending.map(t => t.id),
    event: { id: m.id, name: m.name, seasonID: m.seasonID, startDate: m.startDate, endDate: m.endDate, live },
    // Finished events counted in the race until the PDC republishes its list.
    settledNames: pending.filter((t, i) => !(i === showIdx && live)).map(t => t.name),
    settled,
    dropNames: drops.map(t => t.name),
    expiring,
    race,
  }, { stamp: 'updatedAt' });
  log(`live race: ${pending.map(t => t.name).join(' + ')}${live ? ' (in progress)' : ' (awaiting official list)'}, dropping ${drops.map(t => t.name).join(' + ') || 'nothing'} (${changed ? 'updated' : 'unchanged'})`);
}
