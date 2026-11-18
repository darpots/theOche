// Builds one profile file per top-128 player at public/data/players/<id>.json
// (loaded by the Rankings pop-up), using only the PDC's public feeds:
//  - participants feed: age, country, darts used, walk-on, titles, nine-darters
//  - tournaments feed: tournament-by-tournament finishes and the season record
//
// Completed tournaments are summarised once into data/results-cache.json
// (committed), so weekly runs only fetch new events.
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import { API, cleanName, playerName, isPlaceholder, fixtureStatsUrl } from '../src/lib/pdc.mjs';
import { get, getAll, readJson, writeJsonIfChanged, pool, today, log, sleep } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = `${ROOT}data/results-cache.json`;
const STATS = `${ROOT}data/stats-cache.json`;
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
// This season's main-tour events also need their fixture ids (for averages).
const isSeasonEvent = a => isSeason(a) && Number(a.seasonID) === season;
// Match stats are also kept for the two previous seasons' history events
// (majors, World Series, European Tour), for the averages in each player's
// tournament history.
const STATS_FROM = season - 2;
const isStatsEvent = a => isSeasonEvent(a) || (isHistory(a) && Number(a.seasonID) >= STATS_FROM && Number(a.seasonID) <= season);
// Summaries made before the round fix have rounds keyed "null": redo them.
const badRounds = sum => Object.keys(sum.r || {}).some(k => k === 'null' || k === 'undefined');
const todo = wanted.filter(a => !cache[a.id] || badRounds(cache[a.id]) || (isStatsEvent(a) && !Array.isArray(cache[a.id].fx?.[0])));
log(`tournaments: ${wanted.length} relevant, ${todo.length} to fetch`);

function summarise(payload, meta) {
  const a = { ...payload.data.attributes, ...meta };
  const players = {}; // pid -> [bestRound, won, lost, legsFor, legsAgainst]
  const rounds = {};
  const fx = [];
  const names = {};
  for (const s of a.stages || []) {
    // Older events have no roundNumber; cupRound counts back from the final
    // (1 = final, 2 = semi-final…) and 0 means a group or league stage.
    const rn = s.roundNumber ?? (Number(s.cupRound) > 0 ? Number(s.cupRound) : 99);
    rounds[rn] = s.stage?.name || 'Round';
    const legs = !((s.numberOfSets || 0) > 1);
    for (const f of s.fixtures || []) {
      const sides = [[f.participant1, f.participant1Score, f.participant2Score], [f.participant2, f.participant2Score, f.participant1Score]];
      const done = f.winnerParticipantID || (/result/i.test(f.status || '') && f.participant1Score !== f.participant2Score);
      if (done && !isPlaceholder(f.participant1) && !isPlaceholder(f.participant2)) {
        // [fixtureId, date, p1, p2, score1, score2, winner, stage]
        fx.push([String(f.fixtureID), f.startDate, String(f.participant1.participantID), String(f.participant2.participantID), f.participant1Score, f.participant2Score, String(f.winnerParticipantID || ''), s.stage?.name || '']);
        names[String(f.participant1.participantID)] = playerName(f.participant1);
        names[String(f.participant2.participantID)] = playerName(f.participant2);
      }
      for (const [p, mine, theirs] of sides) {
        if (isPlaceholder(p)) continue;
        const id = String(p.participantID);
        const rec = players[id] ||= [rn, 0, 0, 0, 0];
        rec[0] = Math.min(rec[0], rn);
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
    // Per-match detail only for this season's events (keeps the cache small).
    ...(isStatsEvent(a) ? { fx, pn: names } : {}),
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

// ---- 3. Season match stats -------------------------------------------------
// Every finished main-tour match this season has a timeline with each visit.
// Points and darts are summed from the visits, so season averages are
// weighted by darts thrown (as the PDC's own averages are). Finished matches
// never change, so each is fetched once and kept in data/stats-cache.json.
// Per side: [pid, points, darts, first9 points, first9 darts, 180s, checkouts hit, checkout attempts, best checkout]
const statsCache = (await readJson(STATS)) || {};
const sumMeta = sum => ({ tournamentCategoryID: sum.c, tournamentTypeID: sum.ty, seasonID: sum.s });
const seasonEvents = Object.entries(cache).filter(([, sum]) => isSeasonEvent(sumMeta(sum)));
const statsEvents = Object.entries(cache).filter(([, sum]) => isStatsEvent(sumMeta(sum)));
const wantFx = new Map(statsEvents.flatMap(([tid, sum]) => (sum.fx || []).map(f => [Array.isArray(f) ? f[0] : f, tid])));
for (const id of Object.keys(statsCache)) if (!wantFx.has(id)) delete statsCache[id]; // older seasons drop off
const missing = [...wantFx.keys()].filter(id => !statsCache[id]);
log(`match stats: ${wantFx.size} matches (${season} plus ${STATS_FROM}–${season - 1} history events), ${missing.length} to fetch`);
function sideStats(a, isP1, pid) {
  const r = [pid, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const leg of a.legs || []) {
    let n = 0;
    for (const v of [...(leg.visits || [])].sort((x, y) => x.order - y.order)) {
      if (v.isParticipant1 !== isP1) continue;
      const pts = v.isBust ? 0 : v.score || 0, d = v.numberOfDartsThrown || 0;
      r[1] += pts; r[2] += d;
      if (n++ < 3) { r[3] += pts; r[4] += d; }
    }
  }
  const m = a.fixtureMeta?.[isP1 ? 'participant1Data' : 'participant2Data'] || {};
  r[5] = m.score180 || 0; r[6] = m.checkoutSuccesses ?? m.checkouts ?? 0; r[7] = m.checkoutAttempts || 0; r[8] = m.highestCheckout || 0;
  if (typeof r[6] !== 'number') r[6] = Number(String(r[6]).split('/')[0]) || 0;
  return r;
}
let got = 0;
await pool(missing, 8, async id => {
  try {
    const a = (await get(fixtureStatsUrl(id))).data.attributes;
    if (!a.legs?.length) return;
    statsCache[id] = { t: wantFx.get(id), a: sideStats(a, true, String(a.participant1ID)), b: sideStats(a, false, String(a.participant2ID)) };
    if (++got % 500 === 0) log(`  stats ${got}/${missing.length}`);
  } catch { /* try again tomorrow */ }
});
await writeJsonIfChanged(STATS, statsCache);

// Totals per player, overall and per tournament.
const seasonStats = new Map(); // pid -> { all: totals, byT: Map<tid, totals> }
const add = (t, r) => { for (let i = 1; i < 9; i++) t[i] = i === 8 ? Math.max(t[i], r[i]) : t[i] + r[i]; t[0]++; };
for (const s of Object.values(statsCache)) for (const r of [s.a, s.b]) {
  if (!r[2]) continue;
  const e = seasonStats.get(r[0]) || { all: [0, 0, 0, 0, 0, 0, 0, 0, 0], byT: new Map() };
  if (cache[s.t]?.s === season) add(e.all, r); // the season summary is this year only
  if (!e.byT.has(s.t)) e.byT.set(s.t, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  add(e.byT.get(s.t), r);
  seasonStats.set(r[0], e);
}
const avgOf = t => (t[2] ? Math.round((t[1] / t[2]) * 300) / 100 : null);
function summaryOf(t) {
  if (!t || !t[2]) return null;
  return { matches: t[0], avg: avgOf(t), f9: t[4] ? Math.round((t[3] / t[4]) * 300) / 100 : null, t80: t[5], co: t[7] ? Math.round((t[6] / t[7]) * 1000) / 10 : null, hi: t[8] || null };
}

// ---- 4. Per-player profiles ----------------------------------------------
function finishLabel(sum, pid) {
  const best = sum.p[pid][0];
  if (sum.w === pid) return { label: 'Winner', rank: 0 };
  const name = sum.r[best] || 'Round';
  if (best === 1) return { label: 'Runner-up', rank: 1 };
  if (/^(group|league)/i.test(name)) return { label: 'Group stage', rank: 50 };
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
      const ev = seasonStats.get(row.id)?.byT.get(id);
      history.push({ id, season: sum.s, date: sum.d, name, tag, ...finishLabel(sum, row.id), w: rec[1], l: rec[2], ...(ev ? { avg: avgOf(ev) } : {}) });
    }
    if (sum.s === season && sum.c !== '17' && ['2', '3', '4'].includes(sum.c)) {
      seasonRec.won += rec[1]; seasonRec.lost += rec[2];
      seasonRec.legsFor += rec[3]; seasonRec.legsAgainst += rec[4];
      if (sum.w === row.id && sum.done !== false && sum.e < t) seasonRec.titles.push(cleanName(sum.n).name + (cleanName(sum.n).tag ? ` (${cleanName(sum.n).tag})` : ''));
    }
  }
  seasonRec.played = seasonRec.won + seasonRec.lost;
  history.sort((x, y) => y.date.localeCompare(x.date));
  // Recent matches this season (newest first) for the form guide.
  const recent = seasonEvents.flatMap(([tid, sum]) => (sum.fx || []).filter(f => Array.isArray(f) && (f[2] === row.id || f[3] === row.id)).map(f => {
    const me = f[2] === row.id ? 0 : 1, opp = me ? f[2] : f[3];
    const st = statsCache[f[0]];
    const mine = st ? (st.a[0] === row.id ? st.a : st.b) : null;
    return { id: f[0], date: f[1], event: cleanName(sum.n).name, tag: cleanName(sum.n).tag, stage: f[7], tid, opp: sum.pn?.[opp] || '', my: me ? f[5] : f[4], their: me ? f[4] : f[5], won: f[6] === row.id, avg: mine && mine[2] ? Math.round((mine[1] / mine[2]) * 300) / 100 : null };
  })).sort((x, y) => y.date.localeCompare(x.date) || Number(y.id) - Number(x.id));
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
    season: { year: season, ...seasonRec, stats: summaryOf(seasonStats.get(row.id)?.all) },
    form: recent.slice(0, 10),
    history,
  };
  keep.add(`${row.id}.json`);
  await writeFile(`${OUTDIR}${row.id}.json`, JSON.stringify(profile));
  await sleep(120);
});
for (const f of await readdir(OUTDIR)) if (!keep.has(f)) await unlink(`${OUTDIR}${f}`);
log(`players: ${keep.size} profiles written`);
