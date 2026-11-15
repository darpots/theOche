// Builds one profile file per top-128 player at public/data/players/<id>.json
// (loaded by the Rankings pop-up), using only the PDC's public feeds:
//  - participants feed: age, country, darts used, walk-on, titles, nine-darters
//  - tournaments feed: tournament-by-tournament finishes and the season record
//
// Completed tournaments are summarised once into data/results-cache.json
// (committed), so weekly runs only fetch new events.
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { API, cleanName, playerName, isPlaceholder } from '../src/lib/pdc.mjs';
import { get, getAll, readJson, writeJsonIfChanged, pool, today, log, sleep } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = `${ROOT}data/results-cache.json`;
const OUTDIR = `${ROOT}public/data/players/`;
const TOP = 128;
const FIRST_SEASON = 2005;
const t = today();
const season = Number(t.slice(0, 4));

const rankings = await readJson(`${ROOT}src/data/rankings.json`);
if (!rankings?.players?.length) throw new Error('Run refresh-rankings first');
const top = rankings.players.slice(0, TOP);

// ---- 1. Tournament index -------------------------------------------------
const index = (await getAll(API.tournaments, {}, 200)).map(r => ({ id: r.id, ...r.attributes }));
log(`index: ${index.length} tournaments`);

// History: majors (not individual PL nights), World Series, European Tour.
// Season record: everything on the main tour this season (incl. PCs, PL nights).
const isHistory = a => (a.tournamentCategoryID === '2' && !['3', '17'].includes(a.tournamentTypeID)) || ['18', '14'].includes(a.tournamentTypeID);
const isSeason = a => ['2', '3', '4'].includes(a.tournamentCategoryID) && a.tournamentTypeID !== '17';
const wanted = index.filter(a =>
  !/qualifier|test|women|youth|challenge|development/i.test(a.name) && a.fixtureCount > 0 && a.startDate <= t &&
  ((isHistory(a) && a.seasonID >= FIRST_SEASON) || (isSeason(a) && a.seasonID >= season - 1)));

// ---- 2. Summarise each tournament (cached when completed) ----------------
const cache = (await readJson(CACHE)) || {};
// Keep cached category/type/winner in step with the index (winners can be
// confirmed after the event, and older cache entries may lack them).
const byId = new Map(index.map(a => [String(a.id), a]));
for (const [id, sum] of Object.entries(cache)) {
  const a = byId.get(id);
  if (!a) continue;
  sum.c = a.tournamentCategoryID; sum.ty = a.tournamentTypeID;
  if (a.winnerParticipantID) sum.w = String(a.winnerParticipantID);
}
const todo = wanted.filter(a => !cache[a.id]);
log(`tournaments: ${wanted.length} relevant, ${todo.length} to fetch`);

function summarise(payload, meta) {
  const a = { ...payload.data.attributes, ...meta };
  const players = {}; // pid -> [bestRound, won, lost, legsFor, legsAgainst]
  const rounds = {};
  for (const s of a.stages || []) {
    rounds[s.roundNumber] = s.stage?.name || 'Round';
    const legs = !((s.numberOfSets || 0) > 1);
    for (const f of s.fixtures || []) {
      const sides = [[f.participant1, f.participant1Score, f.participant2Score], [f.participant2, f.participant2Score, f.participant1Score]];
      const done = f.winnerParticipantID || (/result/i.test(f.status || '') && f.participant1Score !== f.participant2Score);
      for (const [p, mine, theirs] of sides) {
        if (isPlaceholder(p)) continue;
        const id = String(p.participantID);
        const rec = players[id] ||= [s.roundNumber, 0, 0, 0, 0];
        rec[0] = Math.min(rec[0], s.roundNumber);
        if (!done) continue;
        const won = f.winnerParticipantID ? String(f.winnerParticipantID) === id : mine > theirs;
        rec[won ? 1 : 2]++;
        if (legs && Number.isFinite(mine) && Number.isFinite(theirs)) { rec[3] += mine; rec[4] += theirs; }
      }
    }
  }
  return {
    n: a.name, s: a.seasonID, d: a.startDate, e: a.endDate, ty: a.tournamentTypeID, c: a.tournamentCategoryID,
    w: a.winnerParticipantID ? String(a.winnerParticipantID) : null,
    r: rounds, p: players,
  };
}

let fetched = 0;
await pool(todo, 4, async a => {
  try {
    const sum = summarise(await get(`${API.tournaments}${a.id}`), a);
    sum.done = a.endDate < t;
    cache[a.id] = sum;
    if (++fetched % 50 === 0) log(`  fetched ${fetched}/${todo.length}`);
  } catch (e) { console.warn(`skip ${a.id} ${a.name}: ${e.message}`); }
  await sleep(150);
});
// Tournaments still running are re-fetched next time.
const persistable = Object.fromEntries(Object.entries(cache).filter(([, v]) => v.done));
await mkdir(`${ROOT}data`, { recursive: true });
await writeJsonIfChanged(CACHE, persistable);

// ---- 3. Per-player profiles ----------------------------------------------
function finishLabel(sum, pid) {
  const best = sum.p[pid][0];
  if (sum.w === pid) return { label: 'Winner', rank: 0 };
  const name = sum.r[best] || 'Round';
  if (best === 1) return { label: 'Runner-up', rank: 1 };
  if (/^group/i.test(name)) return { label: 'Group stage', rank: 50 };
  return { label: name.replace(/^Round of /i, 'Last '), rank: best };
}

await mkdir(OUTDIR, { recursive: true });
const keep = new Set();
await pool(top, 4, async row => {
  const body = await get(`${API.participants}${row.id}`);
  const a = body.data.attributes;
  const m = a.meta || {};
  const history = [];
  const seasonRec = { played: 0, won: 0, lost: 0, legsFor: 0, legsAgainst: 0, titles: [] };
  for (const [id, sum] of Object.entries(cache)) {
    const rec = sum.p[row.id];
    if (!rec) continue;
    const isHist = (sum.c === '2' && !['3', '17'].includes(sum.ty)) || ['18', '14'].includes(sum.ty);
    if (isHist) {
      const { name, tag } = cleanName(sum.n);
      history.push({ id, season: sum.s, date: sum.d, name, tag, ...finishLabel(sum, row.id), w: rec[1], l: rec[2] });
    }
    if (sum.s === season && sum.c !== '17' && ['2', '3', '4'].includes(sum.c)) {
      seasonRec.won += rec[1]; seasonRec.lost += rec[2];
      seasonRec.legsFor += rec[3]; seasonRec.legsAgainst += rec[4];
      if (sum.w === row.id && sum.done !== false && sum.e < t) seasonRec.titles.push(cleanName(sum.n).name + (cleanName(sum.n).tag ? ` (${cleanName(sum.n).tag})` : ''));
    }
  }
  seasonRec.played = seasonRec.won + seasonRec.lost;
  history.sort((x, y) => y.date.localeCompare(x.date));
  const career = Object.fromEntries((a.statistics?.careerRecord || [])
    .filter(c => ['1000', '2', '3', '4'].includes(c.tournamentCategoryID))
    .map(c => [c.tournamentCategoryName, c.winCount]));
  const profile = {
    id: row.id,
    name: playerName(a),
    nick: a.nickname || null,
    slug: a.participantSlug,
    country: a.countryCode || null,
    dob: a.dob || null,
    hometown: m.homeTown || m.placeOfBirth || null,
    darts: m.makeOfDart ? `${m.weightOfDart ? m.weightOfDart + 'g ' : ''}${m.makeOfDart}` : null,
    walkOn: m.walkOnSongMusic || null,
    started: m.startedPlayingYear || null,
    leftHanded: !!m.isLeftHanded,
    tourCard: !!a.isCurrentTourCardHolder,
    nineDarters: a.statistics?.nineDartCount ?? null,
    career,
    season: { year: season, ...seasonRec },
    history,
  };
  keep.add(`${row.id}.json`);
  await writeFile(`${OUTDIR}${row.id}.json`, JSON.stringify(profile));
  await sleep(120);
});
for (const f of await readdir(OUTDIR)) if (!keep.has(f)) await unlink(`${OUTDIR}${f}`);
log(`players: ${keep.size} profiles written`);
