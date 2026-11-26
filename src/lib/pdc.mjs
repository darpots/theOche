import { shownNow } from './tv-delay.mjs';
// Shared PDC helpers. Plain JS so both the Node refresh scripts and the
// browser (live updates) can use the same normalisers.

export const API = {
  tournaments: 'https://tournaments.darts.web.gc.pdcservices.co.uk/v2/',
  rankings: 'https://rankings.darts.web.gc.pdcservices.co.uk/v2/',
  participants: 'https://participants.darts.web.gc.pdcservices.co.uk/v2/',
  images: 'https://images.gc.pdcservices.co.uk/',
};

// Which UK broadcaster covers each PDC tournament type (tournamentTypeID).
// Sky Sports: World Championship, Premier League, Matchplay, Grand Prix,
// Grand Slam, World Cup. ITV: UK Open, European Championship, Players
// Championship Finals, Masters, World Series events + Finals.
// PDCTV: European Tour. Unmapped televised types are reported by the
// refresh job so a human can add them here.
export const BROADCASTERS = {
  1: 'sky', // World Championship
  3: 'sky', // Premier League nights
  54: 'sky', // Premier League play-offs
  6: 'sky', // World Grand Prix
  9: 'sky', // Grand Slam of Darts
  15: 'sky', // World Matchplay
  17: 'sky', // World Cup of Darts
  4: 'itv', // UK Open
  7: 'itv', // European Championship
  19: 'itv', // The Masters
  30: 'itv', // Players Championship Finals
  18: 'itv', // World Series events and Finals
  14: 'pdctv', // European Tour
};

/**
 * The UK channel for a tournament: the map above, or, for a televised event of a
 * type not in it yet, a guess from its name (the refresh job also opens an issue
 * so the guess can be confirmed). Works on feed attributes or list rows.
 */
export function broadcasterFor(a) {
  const type = a?.type?.tournamentTypeID ?? a?.tournamentTypeID;
  if (BROADCASTERS[type]) return BROADCASTERS[type];
  const cat = a?.category?.tournamentCategoryID ?? a?.tournamentCategoryID;
  if (!a?.isTelevised || !['2', '3'].includes(String(cat))) return null;
  return guessBroadcaster(a.name || '', String(cat));
}
/** Name-based guess for a televised event type the map doesn't know; 'tv' (channel to be confirmed) when the name doesn't say. */
export function guessBroadcaster(name, cat) {
  if (/world championship|premier league|matchplay|world grand prix|grand slam|world cup/i.test(name)) return 'sky';
  if (/uk open|european championship|\bmasters\b|players championship finals|world series/i.test(name)) return 'itv';
  if (/\bET\d+\b|european tour/i.test(name)) return 'pdctv';
  return 'tv';
}

export const BROADCASTER_INFO = {
  sky: { label: 'Sky Sports', short: 'Sky', logo: '/brand/sky-sports.svg' },
  itv: { label: 'ITV', short: 'ITV', logo: '/brand/itv.svg' },
  pdctv: { label: 'PDCTV', short: 'PDCTV', logo: '/brand/pdctv.png' },
  // A new televised event whose UK channel isn't confirmed yet.
  tv: { label: 'TV (channel to be confirmed)', short: 'TV', logo: null },
};

/** Broadcaster logo badge (HTML string), shared by build-time pages and browser scripts. */
export function tvBadge(b) {
  const info = BROADCASTER_INFO[b];
  if (!info) return '';
  if (!info.logo) return `<span class="tv tv-${b}" title="${info.label}">On TV</span>`;
  return `<span class="tv tv-${b}" title="Live on ${info.label}"><img src="${info.logo}" alt="${info.label}" height="16" decoding="async"></span>`;
}

/** "2026 ET14 - Swiss Darts Trophy" -> { name: "Swiss Darts Trophy", tag: "European Tour 14" } */
export function cleanName(raw = '') {
  let name = raw.replace(/^\d{4}(\/\d{2,4})?\s+/, '').trim();
  let tag = null;
  const et = name.match(/^ET(\d+)\s*-\s*(.+)$/);
  if (et) { tag = `European Tour ${et[1]}`; name = et[2]; }
  const pl = name.match(/^Premier League Night (\d+)$/i);
  if (pl) { tag = `Night ${pl[1]}`; name = 'Premier League'; }
  if (/^Premier League Finals$/i.test(name)) { tag = 'Play-offs'; name = 'Premier League'; }
  return { name, tag };
}

export const playerName = p => p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
export const isPlaceholder = p => !p || /to be confirmed|^tbc$|^bye$/i.test(`${p.lastName ?? ''}`) || /^Player \d/.test(p.firstName ?? '');

export function imageUrl(file, size) {
  if (!file) return null;
  return API.images + (size ? `fit-in/${size}x${size}/` : '') + file;
}

function slimPlayer(p) {
  if (isPlaceholder(p)) return null;
  return {
    id: String(p.participantID),
    name: playerName(p),
    last: p.lastName || null,
    nick: p.nickname || null,
    country: p.countryCode || null,
    ranking: p.ranking ?? null,
  };
}

/** Normalise a tournament detail payload into the shape the Matches page renders. */
export function normaliseTournament(payload) {
  const d = payload?.data;
  const a = d?.attributes;
  if (!a) throw new Error('Tournament payload missing attributes');
  const { name, tag } = cleanName(a.name);
  const stages = (a.stages || [])
    .map(s => ({
      name: s.stage?.name || 'Round',
      round: s.roundNumber,
      sets: (s.numberOfSets || 0) > 1,
      // Match length: best of N sets (legs per set) or best of N legs.
      bestOf: (s.numberOfSets || 0) > 1 ? s.numberOfSets : s.numberOfLegsPerSet || null,
      legsPerSet: s.numberOfLegsPerSet || null,
      twoClear: !!s.twoClearLegsToWin,
      prize: s.compensationValue != null ? Number(s.compensationValue) : null,
      fixtures: (s.fixtures || []).map(f => {
        const p1 = slimPlayer(f.participant1);
        const p2 = slimPlayer(f.participant2);
        const done = /result|complete|finished/i.test(f.status || '');
        return {
          id: String(f.fixtureID),
          date: f.startDate || null,
          time: f.startTime ? f.startTime.slice(0, 5) : null,
          status: done ? 'result' : /live|progress/i.test(f.status || '') ? 'live' : 'upcoming',
          p1, p2,
          s1: f.participant1Score ?? null,
          s2: f.participant2Score ?? null,
          winner: f.winnerParticipantID ? String(f.winnerParticipantID) : null,
        };
      }),
    }))
    .sort((x, y) => y.round - x.round);
  return {
    // The feed can name a winner before the final is played (it did for the 2026
    // Grand Slam), so the champion is the final's winner once it has a result.
    winner: eventWinner(a, stages),
    id: String(d.id),
    name, tag,
    fullName: a.name,
    start: a.startDate,
    end: a.endDate,
    venue: a.venue || null,
    city: a.city || null,
    typeId: a.type?.tournamentTypeID ?? a.tournamentTypeID ?? null,
    broadcaster: broadcasterFor(a),
    logo: a.tournamentLogo || null,
    image: a.tournamentPromoImage || a.tournamentListingImage || null,
    stages,
  };
}

/**
 * A draw published before the PDC feed has fixtures (src/data/draws/<id>.json):
 * { stage, matches: [[seed, name, seed, name], ...] } in bracket order. Players
 * are matched to the rankings by name for their id and country.
 */
export function publishedDraw(published, ranked = []) {
  const key = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const byName = new Map(ranked.map(p => [key(p.name), p]));
  const player = (seed, name) => {
    const r = byName.get(key(name));
    return { id: r ? String(r.id) : null, name, last: name.split(' ').slice(1).join(' ') || name, country: r?.country || null, seed: seed ?? null };
  };
  return { stage: published.stage || 'First round', matches: (published.matches || []).map(([s1, n1, s2, n2]) => [player(s1, n1), player(s2, n2)]) };
}

/** Today in London, as YYYY-MM-DD. */
const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/**
 * A tournament's champion, trusted only once it's decided: the final's winner when
 * the final has a result; with no final in the data (round-robin or not drawn), the
 * feed's winner once the event's last day has passed.
 */
export function eventWinner(a, stages = null) {
  const fin = stages ? stages.find(s => /^final$/i.test(s.name))?.fixtures?.[0] : null;
  if (fin) {
    if (fin.status !== 'result' || !fin.winner) return null;
    const p = [fin.p1, fin.p2].find(x => x && x.id === fin.winner);
    return p ? { id: p.id, name: p.name } : null;
  }
  if (!a?.winner || isPlaceholder(a.winner) || !a.endDate || a.endDate >= ukToday()) return null;
  return { id: String(a.winner.participantID), name: playerName(a.winner) };
}

/** Normalise the World Rankings payload. */
export function normaliseRankings(payload) {
  const a = payload?.data?.attributes;
  if (!a?.positions?.length) throw new Error('Rankings payload empty');
  return a.positions.map(p => ({
    pos: p.position,
    id: String(p.participant.participantID),
    name: playerName(p.participant),
    nick: p.participant.nickname || null,
    slug: p.participant.participantSlug,
    country: p.participant.countryCode || null,
    dob: p.participant.dob || null,
    money: Number(p.value) || 0,
  }));
}

export function age(dob, at = new Date()) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00Z');
  let y = at.getUTCFullYear() - b.getUTCFullYear();
  const m = at.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < b.getUTCDate())) y--;
  return y;
}

const SUBDIVISIONS = { 'GB-ENG': 'England', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales', 'GB-NIR': 'Northern Ireland' };
export function countryName(code) {
  if (!code) return null;
  if (SUBDIVISIONS[code]) return SUBDIVISIONS[code];
  try { return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code) || code; } catch { return code; }
}
/** Flag image (HTML string). SVG flags from the flag-icons project (MIT), in /public/flags. */
export function flag(code) {
  if (!code) return '';
  const c = code.toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{3})?$/.test(c)) return '';
  return `<img class="flag" src="/flags/${c}.svg" alt="" width="16" height="12" loading="lazy" decoding="async">`;
}
export const keyName = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
// Live race: the official list is only republished after each ranking event.
// While one is being played, money from the same event two years ago is about
// to expire and is replaced by what players have already guaranteed this time.
// projected = official − previous edition prize + prize guaranteed so far.
// ---------------------------------------------------------------------------

/** Tournament types that count towards the PDC Order of Merit. */
export const RANKED_TYPES = ['1', '4', '6', '7', '9', '14', '15', '29', '30'];
const typeOf = t => String(t?.tournamentTypeID ?? t?.type?.tournamentTypeID ?? '');
// Qualifying rounds played as a separate event whose money counts: the World
// Masters preliminary rounds (the last 64, 32 and 16 of the qualifiers).
const RANKED_QUALIFIERS = /Winmau World Masters \(Preliminary\)/i;
/**
 * Whether an event counts towards the Order of Merit: the usual ranking types,
 * the World Masters (type 19) and its preliminary rounds, plus any event the
 * feed marks as ranked. The feed's flag alone is not enough: it marks the UK
 * Open and the 2025 World Masters as unranked, and both count.
 */
export const isRankedEvent = t => RANKED_TYPES.includes(typeOf(t)) || typeOf(t) === '19' || RANKED_QUALIFIERS.test(t?.name || '') || t?.isRanked === true;

// The feed gives each stage's prize for losing there, but not the winner's
// prize. Known winner prizes are listed (checked against the official
// rankings); any other edition is worked out from the runner-up prize with the
// ratio for that kind of event (below) and marked as estimated.
const WINNER_PRIZE = {
  '2024 Grand Slam of Darts': 150000,
  '2025 Grand Slam of Darts': 150000,
  '2026 Grand Slam of Darts': 200000,
  '2024 World Championship': 500000,
  '2025 World Championship': 500000,
  '2026 World Championship': 1000000,
  '2024 World Matchplay': 200000,
  '2025 World Matchplay': 200000,
  '2024 World Grand Prix': 120000,
  '2024 European Championship': 120000,
  '2024 Players Championship Finals': 120000,
  '2024 UK Open': 110000,
};
// Winner's prize ÷ runner-up's prize for each ranking event type, from the
// PDC's prize structures, for editions not listed above.
const WINNER_RATIO = {
  '1': 2.5, // World Championship (£1m / £400k)
  '9': 2, // Grand Slam (£200k / £100k)
  '15': 2, // World Matchplay (£200k / £100k)
  '6': 2, // World Grand Prix
  '7': 2, // European Championship
  '30': 2, // Players Championship Finals
  '4': 2.2, // UK Open (£110k / £50k)
  '29': 1.5, // Players Championship (floor)
  '14': 2.5, // European Tour
  '19': 2, // World Masters
};
// Winner's prize by type from a given season, where the ratio changed.
const WINNER_FROM = { '14': [[2026, 35000]] };
const winnerPrize = (a, runnerUp) => {
  if (a.name in WINNER_PRIZE) return { amount: WINNER_PRIZE[a.name], estimated: false };
  const ty = typeOf(a), fixed = (WINNER_FROM[ty] || []).filter(([y]) => Number(a.seasonID) >= y).pop();
  if (fixed) return { amount: fixed[1], estimated: false };
  return { amount: Math.round(runnerUp * (WINNER_RATIO[ty] ?? 2)), estimated: true };
};
// Group stages where the feed gives one prize for the whole stage but the PDC
// pays by finishing place (checked against the official rankings): `prize`
// replaces the feed's group prize for that place, `bonus` is added on top
// (also for players who went through). Places not listed get the feed's.
const GROUP_PLACE_PRIZE = {
  '9': [
    // Grand Slam to 2025: 8 groups of four, top two through.
    { from: 0, to: 2025, size: 4, prize: { 3: 8000 }, bonus: { 1: 3500 } },
    // Grand Slam from 2026: 16 groups of three, only the winner goes through.
    { from: 2026, to: 9999, size: 3, prize: { 2: 12500, 3: 5000 } },
  ],
};
/** Split a group stage's fixtures into its groups (the feed can list all groups as one stage). */
function splitGroups(fixtures) {
  const adj = new Map(), key = q => String(q.participantID);
  for (const f of fixtures) for (const [a, b] of [[f.participant1, f.participant2], [f.participant2, f.participant1]]) (adj.get(key(a)) || adj.set(key(a), new Set()).get(key(a))).add(key(b));
  const seen = new Set(), groups = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const members = new Set(), todo = [start];
    while (todo.length) { const x = todo.pop(); if (seen.has(x)) continue; seen.add(x); members.add(x); adj.get(x).forEach(y => todo.push(y)); }
    groups.push(fixtures.filter(f => members.has(key(f.participant1))));
  }
  return groups;
}

// Order of the rounds, from their names: the feed's cupRound numbers are not
// always in playing order (the UK Open's early rounds are numbered 7, 8, 9 for
// the last 160, 128 and 96). 1 = final, 2 = semi-final, ...; group stages 99.
const roundSize = name => {
  if (/^final$/i.test(name)) return 2;
  if (/semi/i.test(name)) return 4;
  if (/quarter/i.test(name)) return 8;
  const l = /last (\d+)/i.exec(name); if (l) return Number(l[1]);
  if (/first round|round 1\b/i.test(name)) return 1e6;
  return null; // group or league stage
};
function stageOrders(stages) {
  const ko = stages.filter(s => roundSize(s.stage?.name || '')).sort((x, y) => roundSize(x.stage.name) - roundSize(y.stage.name));
  const ord = new Map(ko.map((s, i) => [s, i + 1]));
  return s => ord.get(s) ?? 99;
}

/** Finishing places in a round-robin group: wins, then leg difference, legs won, head-to-head. */
export function groupPlaces(fixtures) {
  const t = new Map();
  for (const f of fixtures) for (const [q, s, o] of [[f.participant1, f.participant1Score, f.participant2Score], [f.participant2, f.participant2Score, f.participant1Score]]) {
    if (isPlaceholder(q)) continue;
    const id = String(q.participantID), r = t.get(id) || { id, w: 0, ld: 0, lf: 0 };
    if (String(f.winnerParticipantID) === id) r.w++;
    r.ld += (Number(s) || 0) - (Number(o) || 0); r.lf += Number(s) || 0; t.set(id, r);
  }
  const h2h = (a, b) => { const f = fixtures.find(f => [String(f.participant1?.participantID), String(f.participant2?.participantID)].sort().join() === [a, b].sort().join()); return f?.winnerParticipantID ? (String(f.winnerParticipantID) === a ? -1 : 1) : 0; };
  return new Map([...t.values()].sort((a, b) => b.w - a.w || b.ld - a.ld || b.lf - a.lf || h2h(a.id, b.id)).map((r, i) => [r.id, i + 1]));
}

// European Tour seeds who lose their opening match are paid, but the money
// does not count towards the rankings (seasons listed; checked against the
// official two-year totals and the PDC's 2026 European Tour list). The feed
// does not mark seeds; the seed is listed first in their opening fixture.
const SEED_OPENING_LOSS_UNRANKED = { '14': [2025, 2026, 2027] };

/**
 * Ranking money per player from a tournament payload's attributes.
 * Completed rounds count in full; for an event in progress a player still in it
 * is credited with the prize for the furthest round they are guaranteed.
 * Returns Map<pid, { amount, round, alive, estimated }>.
 */
export function eventPrizes(a) {
  const all = a.stages || [];
  const stageOrder = stageOrders(all);
  const stages = [...all].sort((x, y) => stageOrder(y) - stageOrder(x));
  const byCup = new Map(stages.map(s => [stageOrder(s), s]));
  const ty = typeOf(a), season = Number(a.seasonID);
  const out = new Map();
  const inStage = (s, id) => (s.fixtures || []).find(x => [x.participant1, x.participant2].some(q => String(q?.participantID) === id));
  for (const s of stages) {
    const comp = Number(s.compensationValue) || 0;
    for (const f of s.fixtures || []) {
      for (const p of [f.participant1, f.participant2]) {
        if (isPlaceholder(p)) continue;
        const id = String(p.participantID);
        const rec = out.get(id) || { amount: 0, round: s.stage?.name || '', order: 999, alive: true, name: playerName(p) };
        const ord = stageOrder(s);
        if (ord <= rec.order) {
          rec.order = ord; rec.amount = Math.max(rec.amount, comp); rec.round = s.stage?.name || rec.round;
          const decided = !!f.winnerParticipantID;
          const won = decided && String(f.winnerParticipantID) === id;
          rec.alive = !decided || won || ord === 99;
          if (won && ord === 1 && RANKED_QUALIFIERS.test(a.name || '')) {
            // Through to the main draw: their money comes from there.
            rec.amount = 0; rec.round = 'Qualified';
          } else if (won && ord === 1) {
            const w = winnerPrize(a, comp);
            rec.amount = w.amount; rec.round = 'Winner'; rec.estimated = w.estimated;
          } else if (won && ord < 99 && byCup.has(ord - 1) && !inStage(byCup.get(ord - 1), id)) {
            // Won this round, next round not drawn yet: guaranteed the next round's prize.
            const next = byCup.get(ord - 1);
            rec.amount = Math.max(rec.amount, Number(next.compensationValue) || 0); rec.round = next.stage?.name || rec.round;
          }
        }
        out.set(id, rec);
      }
    }
  }
  // Group stages paid by finishing place, once every match in the group is played.
  const gp = (GROUP_PLACE_PRIZE[ty] || []).find(r => season >= r.from && season <= r.to);
  if (gp) for (const s of all.filter(s => stageOrder(s) === 99)) {
    const real = (s.fixtures || []).filter(f => !isPlaceholder(f.participant1) && !isPlaceholder(f.participant2));
    for (const fx of splitGroups(real)) {
      if (fx.some(f => !f.winnerParticipantID)) continue;
      const places = groupPlaces(fx);
      if (places.size !== gp.size) continue;
      for (const [id, place] of places) {
        const r = out.get(id); if (!r) continue;
        if (r.order === 99 && gp.prize?.[place] != null) r.amount = gp.prize[place];
        if (gp.bonus?.[place]) r.amount += gp.bonus[place];
      }
    }
  }
  // Once the knockout draw has players in it, anyone whose best round is a
  // group or league stage has been knocked out.
  const koDrawn = stages.some(st => stageOrder(st) < 99 && (st.fixtures || []).some(f => !isPlaceholder(f.participant1) || !isPlaceholder(f.participant2)));
  if (koDrawn) for (const rec of out.values()) if (rec.order === 99) rec.alive = false;
  // Seeds who lose their opening match: paid, but not ranking money.
  if (SEED_OPENING_LOSS_UNRANKED[ty]?.includes(season)) {
    const first = new Map(); // player -> their earliest fixture
    for (const s of stages) for (const f of s.fixtures || []) for (const p of [f.participant1, f.participant2]) if (!isPlaceholder(p) && !first.has(String(p.participantID))) first.set(String(p.participantID), f);
    for (const [id, f] of first) {
      const r = out.get(id);
      if (r && f.winnerParticipantID && String(f.winnerParticipantID) !== id && String(f.participant1?.participantID) === id) { r.amount = 0; r.unranked = true; }
    }
  }
  return out;
}

const eventNumber = name => (name.match(/(?:Players Championship|ET)\s*(\d+)/i) || [])[1] || null;

/** Find the edition two years earlier that this event's money replaces. */
export function previousEdition(event, index) {
  const type = event.tournamentTypeID ?? event.type?.tournamentTypeID;
  const season = Number(event.seasonID) - 2;
  const pool = index.filter(t => t.tournamentTypeID === type && Number(t.seasonID) === season && t.fixtureCount > 0);
  if (pool.length <= 1) return pool[0] || null;
  const n = eventNumber(event.name);
  return pool.find(t => eventNumber(t.name) === n) || null;
}

/**
 * Re-rank the official list for a ranked event in progress.
 * official: normaliseRankings() output; current/previous: tournament attributes.
 */
/** Money coming off per player: Map<pid, { amount, estimated, events: [{ name, amount, round }] }>. */
export function expiringMap(dropping, countsFrom = {}) {
  const lose = new Map();
  for (const d of [].concat(dropping || [])) for (const [id, r] of eventPrizes(d)) {
    if (!r.amount) continue;
    // Money earned before the player's ranking money was reset is not in their total.
    if (countsFrom[id] && (d.endDate || '') < countsFrom[id]) continue;
    const l = lose.get(id) || { amount: 0, estimated: false, events: [] };
    l.amount += r.amount; l.estimated ||= !!r.estimated;
    l.events.push({ name: d.name, amount: r.amount, round: r.round });
    lose.set(id, l);
  }
  return lose;
}

export function liveRace(official, current, dropping) {
  return liveRaceWith(official, current, expiringMap(dropping));
}

/**
 * The live race from a precomputed expiring map (a Map, or a plain object from JSON).
 * current: the event in progress (tournament attributes) or null.
 * settled: money from finished events not yet in the official list ({ pid: { amount, name } }).
 */
export function liveRaceWith(official, current, expiring, settled = {}) {
  const lose = expiring instanceof Map ? expiring : new Map(Object.entries(expiring || {}));
  const gain = current ? eventPrizes(current) : new Map();
  for (const [id, s] of Object.entries(settled || {})) {
    const g = gain.get(id);
    gain.set(id, g ? { ...g, amount: g.amount + s.amount, earlier: s.amount } : { amount: s.amount, earlier: s.amount, name: s.name, round: null, alive: null });
  }
  const list = official.map(p => {
    const g = gain.get(p.id), l = lose.get(p.id);
    const plus = g?.amount || 0, minus = l?.amount || 0;
    return { ...p, official: p.money, money: p.money - minus + plus, plus, minus, expiring: l?.events || [], round: g?.round || null, alive: g ? g.alive : null, estimated: !!l?.estimated };
  });
  // Players who are not on the list yet but have earned money this event.
  for (const [id, g] of gain) if (g.amount && !official.some(p => p.id === id)) list.push({ id, name: g.name, money: g.amount, official: 0, plus: g.amount, minus: 0, expiring: [], round: g.round, alive: g.alive, pos: null });
  // Level on money: the PDC lists the player who has just gained more first,
  // then keeps the previous order (checked against its published lists).
  list.sort((x, y) => y.money - x.money || (y.plus - y.minus) - (x.plus - x.minus) || (x.pos ?? 1e9) - (y.pos ?? 1e9));
  list.forEach((p, i) => { p.live = i + 1; p.move = p.pos ? p.pos - p.live : null; });
  return list;
}

// ---------------------------------------------------------------------------
// Match stats: the fixtures feed's timeline carries each player's averages,
// 180s and checkouts (updated during the match).
// ---------------------------------------------------------------------------
export const fixtureStatsUrl = id => `https://fixtures.darts.web.gc.pdcservices.co.uk/v2/${id}/timeline`;

/** Slim stats from a fixture timeline payload, or null when there are none yet. */
export function slimStats(payload) {
  const m = payload?.data?.attributes?.fixtureMeta;
  const one = d => d && d.threeDartAverage != null ? {
    avg: Number(d.threeDartAverage), f9: d.first9Average != null ? Number(d.first9Average) : null,
    t80: d.score180 ?? 0, co: d.checkoutPercentage != null ? Number(d.checkoutPercentage) : null, hi: d.highestCheckout ?? null,
  } : null;
  const a = one(m?.participant1Data), b = one(m?.participant2Data);
  return a || b ? [a, b] : null;
}

/** Browser helper: find a ranking event in progress and its previous edition. */
export async function findLiveRaceEvent(today) {
  const json = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const list = async season => ((await json(`${API.tournaments}?seasonID=${season}&page.size=500`))?.data || []).map(d => ({ id: d.id, ...d.attributes }));
  const y = Number(today.slice(0, 4));
  const idx = (await Promise.all([y - 3, y - 2, y - 1, y, y + 1].map(list))).flat()
    .filter(t => isRankedEvent(t) && t.fixtureCount > 0 && !/test/i.test(t.name));
  const live = idx.find(t => t.startDate <= today && t.endDate >= today);
  if (!live) return null;
  // The PDC drops an event's money exactly 104 weeks after it was played. The
  // official list was last updated after the latest ranking event to finish
  // before this one; anything whose 104 weeks run out between then and the
  // end of this event comes off in the live race.
  const plus104 = d => new Date(Date.parse(d + 'T12:00:00Z') + 728 * 864e5).toISOString().slice(0, 10);
  const lastOfficial = idx.filter(t => t.endDate < live.startDate).map(t => t.endDate).sort().pop() || live.startDate;
  const dropMeta = idx.filter(t => plus104(t.endDate) > lastOfficial && plus104(t.endDate) <= live.endDate);
  const prev = (await Promise.all(dropMeta.map(m => json(API.tournaments + m.id)))).map(r => r?.data?.attributes).filter(Boolean);
  return { meta: live, prev, dropNames: dropMeta.map(m => m.name) };
}

/** The day 104 weeks after a date: when the PDC drops an event's money. */
export const plus104 = d => new Date(Date.parse(d + 'T12:00:00Z') + 728 * 864e5).toISOString().slice(0, 10);

/**
 * Ranking events whose money is not in the official list yet: those carried
 * over from the last run, plus any played since then. When the PDC has
 * republished its list (the official figures changed), events that had
 * finished are in it now; one still being played stays.
 * idx: ranked events (index rows); prevIds: pending ids from the last run;
 * since: the date of the last run.
 */
export function pendingEvents(idx, prevIds, { day, since, republished }) {
  const byId = new Map(idx.map(t => [t.id, t]));
  let pending = prevIds.map(id => byId.get(id)).filter(Boolean);
  if (republished) pending = pending.filter(t => t.endDate >= day);
  const from = republished || since > day ? day : since;
  for (const t of idx) if (t.fixtureCount > 0 && t.startDate <= day && t.endDate >= from && !pending.includes(t)) pending.push(t);
  return pending.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Events whose money comes off with the pending events: the PDC drops an
 * event's money exactly 104 weeks after it was played, and the official list
 * already reflects everything up to the last event it includes.
 * idx: ranked events (index rows); pending: index rows not yet in the list.
 */
export function eventsDropping(idx, pending, today) {
  if (!pending.length) return [];
  const ids = new Set(pending.map(t => t.id));
  const lastIncluded = idx.filter(t => !ids.has(t.id) && t.fixtureCount > 0 && t.endDate < today).map(t => t.endDate).sort().pop() || '0000';
  const upTo = pending.map(t => t.endDate).sort().pop();
  return idx.filter(t => t.fixtureCount > 0 && plus104(t.endDate) > lastIncluded && plus104(t.endDate) <= upTo);
}

/**
 * When each player's ranking money starts counting, where it is not the start
 * of the two-year window. Players who lose their Tour Card (or never had one)
 * and win it back start again from nothing, so older money is not in their
 * total. Candidates come from matching each player's official total against
 * their money since each season start (Q-School is in January); see acceptReset.
 * totals: Map<pid, [{ endDate, amount }]> for every ranked event in the window.
 * Returns { pid: { from, removed, err } }.
 */
export function resetCandidates(official, totals, seasonStarts) {
  const out = {};
  for (const p of official) {
    const ev = totals.get(p.id) || [];
    const from = d => ev.reduce((s, e) => s + (e.endDate >= d ? e.amount : 0), 0);
    const all = from('0000'), base = Math.abs(all - p.money);
    let best = null;
    for (const d of seasonStarts) {
      const removed = all - from(d), err = Math.abs(from(d) - p.money);
      if (removed >= 1000 && err < (best?.err ?? base) && err <= Math.max(1000, base * 0.25)) best = { from: d, removed, err };
    }
    if (best) out[p.id] = best;
  }
  return out;
}

/**
 * Whether a reset candidate is real: the player had no Tour Card in the season
 * before it or the season it starts (tourCardYears from the player feed), or
 * the evidence is strong (£20k+ explained to within £1,000; a card won back at
 * Q-School straight away can look unbroken in the feed).
 */
export const acceptReset = (c, tourCardYears = []) => {
  const y = Number(c.from.slice(0, 4)), years = tourCardYears.map(Number);
  return !years.includes(y - 1) || !years.includes(y) || (c.removed >= 20000 && c.err <= 1000);
};

/** Browser helper: the live race for the event in progress, or null. */
export async function loadLiveRace(today, found) {
  const json = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  found ??= await findLiveRaceEvent(today);
  if (!found) return null;
  const [rk, cur] = await Promise.all([json(`${API.rankings}2YEAR?page.size=500`), json(API.tournaments + found.meta.id)]);
  if (!rk || !cur) return null;
  const full = normaliseRankings(rk);
  return { found, full, event: { ...found.meta, ...cur.data.attributes }, race: liveRace(full, cur.data.attributes, found.prev) };
}

// ---------------------------------------------------------------------------
// Live layer: PDC's own Firestore, which pdc.tv reads from every visitor's
// browser with its public web key. Scores update as each leg is won and the
// stats (average, 180s, checkout %) as each visit lands, while the official
// feeds above only fill in after the match (stats often the next day). The
// official figures always win when both exist. If this ever stops answering,
// callers fall back to the official feeds alone.
// ---------------------------------------------------------------------------
export const LIVE_PROJECT = 'professional-darts-corporation';
const LIVE_DB = `projects/${LIVE_PROJECT}/databases/(default)/documents`;
const LIVE_URL = `https://firestore.googleapis.com/v1/${LIVE_DB}`;
export const LIVE_KEY = 'AIzaSyCjME19V2rot9OJqrt96Yigqcx3B0nYMgI';
const LIVE_FIELDS = ['status', 'legScore', 'setScore', 'stats', 'currentLeg', 'currentSet'];

const fsVal = v => v == null ? null
  : 'timestampValue' in v ? v.timestampValue
  : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? Number(v.doubleValue)
  : 'stringValue' in v ? v.stringValue
  : 'booleanValue' in v ? v.booleanValue
  : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsVal(x)]))
  : null;

const liveSide = s => s && s.average3Darts != null ? {
  avg: Number(Number(s.average3Darts).toFixed(2)), f9: null,
  t80: s.scores180s ?? 0, t140: s.scores140sPlus ?? null, t100: s.scores100sPlus ?? null,
  co: s.checkoutPercentage != null ? Number(s.checkoutPercentage) : null, hi: s.highestCheckout || null,
} : null;

/** One live match document, slimmed: { id, status: 'live'|'result', legs, sets, stats }. */
export function slimLive(doc) {
  if (!doc?.name || !doc.fields) return null;
  return slimLiveData(doc.name.split('/').pop(), Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fsVal(v)])));
}

/** The same, from plain document data (as pushed by the Firestore client). */
export function slimLiveData(id, f) {
  if (!f) return null;
  const a = liveSide(f.stats?.home), b = liveSide(f.stats?.away);
  return {
    id: String(id),
    status: f.status === 'O' ? 'live' : f.status === 'C' ? 'result' : 'upcoming',
    legs: [f.legScore?.home ?? 0, f.legScore?.away ?? 0],
    sets: [f.setScore?.home ?? 0, f.setScore?.away ?? 0],
    leg: f.currentLeg ?? null, set: f.currentSet ?? null,
    stats: a || b ? [a, b] : null,
  };
}

/** Matches in play right now in a tournament (one small query). */
export async function liveNow(tournamentId) {
  const res = await fetch(`${LIVE_URL}/tournaments/${tournamentId}:runQuery?key=${LIVE_KEY}`, {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'matches' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'O' } } },
    } }),
  });
  if (!res.ok) throw new Error(`live ${res.status}`);
  return (await res.json()).map(r => slimLive(r.document)).filter(Boolean);
}

/** Live documents for specific matches (one request), as a Map of fixture id to slim match. */
export async function liveMatches(tournamentId, ids) {
  const out = new Map();
  const list = [...new Set(ids.map(String))];
  for (let i = 0; i < list.length; i += 100) {
    const res = await fetch(`${LIVE_URL}:batchGet?key=${LIVE_KEY}`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents: list.slice(i, i + 100).map(id => `${LIVE_DB}/tournaments/${tournamentId}/matches/${id}`), mask: { fieldPaths: LIVE_FIELDS } }),
    });
    if (!res.ok) throw new Error(`live ${res.status}`);
    for (const r of await res.json()) { const m = slimLive(r.found); if (m) out.set(m.id, m); }
  }
  return out;
}

/** The score to show from a live match: sets in sets matches, legs otherwise. */
export const liveScore = (m, sets) => (sets ? m.sets : m.legs);

/**
 * Lay live data over a normalised tournament (mutates it). Live scores and
 * stats fill gaps only: an official result or official stats are never replaced.
 * Matches given live stats are flagged statsLive so the page can say so.
 */
export function applyLive(t, live) {
  if (!live?.size) return t;
  for (const s of t.stages) for (const f of s.fixtures) {
    const m = live.get(String(f.id));
    if (!m || m.status === 'upcoming') continue;
    // Both tallies: legs in the current set and sets (set play shows both).
    f.liveLegs = m.legs; f.liveSets = m.sets; f.liveSet = m.set; f.liveLeg = m.leg;
    if (f.status !== 'result') {
      const [a, b] = liveScore(m, s.sets);
      f.s1 = a; f.s2 = b; f.status = m.status;
      if (m.status === 'result') f.winner = a > b ? f.p1?.id ?? null : b > a ? f.p2?.id ?? null : null;
    }
    if (m.stats && (!f.stats || f.statsLive)) { f.stats = m.stats; f.statsLive = true; }
  }
  return t;
}

const listDocs = async path => {
  const res = await fetch(`${LIVE_URL}/${path}?pageSize=300&key=${LIVE_KEY}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`live ${res.status}`);
  return ((await res.json()).documents || []).map(d => ({ id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fsVal(v)])) }));
};

/** One leg's visits from the live data, in the official timeline's shape. */
/**
 * A leg from its live turn documents. How PDC's scorer writes them: when a
 * player steps up, a turn is added straight away (isComplete false,
 * scoringParticipant = the player throwing, dartsThrown counting up after each
 * dart); it gets its score and isComplete true after the visit. activeParticipant
 * is the *other* player (who throws next). So the thrower is the scorer of an
 * unfinished turn, or the next player after a finished one.
 */
export function legFromTurns(turns, set, leg) {
  const sorted = turns.slice().sort((a, b) => a.globalTurnIndex - b.globalTurnIndex);
  const visits = sorted.filter(x => x.isComplete !== false).map(x => ({
    order: x.globalTurnIndex, visitNumber: x.globalTurnIndex, isParticipant1: x.scoringParticipant === 0,
    // Only a finishing visit can use fewer than three darts. PDC's scorer sometimes
    // saves a 2 on an ordinary visit (a 180 'in two darts'), which threw the counts out.
    score: x.isBust ? 0 : x.turnScore ?? 0, remaining: x.score, numberOfDartsThrown: x.score === 0 || x.isCheckout ? (x.dartsThrown || 3) : 3,
    isBust: !!x.isBust, isCheckout: !!x.isCheckout,
  }));
  const last = sorted[sorted.length - 1];
  const inVisit = last && last.isComplete === false;
  const throwing = !last ? null : inVisit ? (last.scoringParticipant === 0 ? 0 : 1) : (last.activeParticipant === 0 ? 0 : 1);
  // When the last dart of this leg went in (ms), for spotting breaks.
  // PDC's turn time comes as an ISO string from the REST API and as a Firestore
  // Timestamp object from the push client: read either.
  const ms = x => (x == null ? 0 : typeof x === 'string' ? Date.parse(x) : typeof x.toMillis === 'function' ? x.toMillis() : x.seconds ? x.seconds * 1000 : Number(x)) || 0;
  const lastAt = sorted.reduce((t, x) => Math.max(t, ms(x.timestamp)), 0) || null;
  return { setNumber: set, legNumber: leg, visits, throwing, dartsIn: inVisit ? Math.min(3, last.dartsThrown || 0) : 0, lastAt };
}

/** A finished leg's final position: score left each side and who checked out, or null if not won yet. */
export function legResult(leg) {
  const v = (leg?.visits || []).slice().sort((a, b) => a.order - b.order);
  const fin = v.find(x => x.remaining === 0);
  if (!fin) return null;
  const left = p1 => { const m = v.filter(x => x.isParticipant1 === p1); return m.length ? m[m.length - 1].remaining : 501; };
  return { left: [left(true), left(false)], winner: fin.isParticipant1 ? 0 : 1, leg: leg.legNumber };
}

/** How long without a dart counts as a break. Across all 62 matches of the 2026 Grand Slam: normal changes of leg 12-18s typically, longest 48s; the 27 breaks (after every fifth leg in the knockout rounds) ran 4-5¾ minutes. 60s catches every break and leaves a safe margin over the longest normal change. */
export const BREAK_AFTER = 60_000;
/**
 * PDC's live data has no break flag, so: a leg with no darts in it yet, and the
 * last dart (end of the previous leg) more than BREAK_AFTER ago.
 * Takes a leg summary (legSummary) or a leg plus the previous leg's lastAt.
 */
export function onBreak(l, prevLastAt = null, now = shownNow()) {
  if (!l || (l.visits || []).length || l.dartsIn) return false;
  const last = l.lastAt || prevLastAt;
  return !!last && now - last > BREAK_AFTER;
}

async function liveLeg(tid, mid, set, leg) {
  return legFromTurns(await listDocs(`tournaments/${tid}/matches/${mid}/sets/${set}/legs/${leg}/turns`), set, leg);
}

/** What the tiles need from a leg: score left each side, who's throwing and how many darts are in. `prevFirst` = 0/1 who threw first last leg. */
export function legSummary(leg, m, prevFirst = null, prevLastAt = null, prevResult = null) {
  const left = p1 => { const v = leg.visits.filter(x => x.isParticipant1 === p1); return v.length ? v[v.length - 1].remaining : 501; };
  // No darts in this leg yet: the throw alternates, so whoever didn't start the last leg starts this one.
  let throwing = leg.throwing;
  if (throwing == null && prevFirst != null) throwing = prevFirst ? 0 : 1;
  return { set: m.set || 1, leg: m.leg, left: [left(true), left(false)], throwing, dartsIn: leg.dartsIn || 0, visits: leg.visits, lastAt: leg.lastAt || prevLastAt || null,
    // Until the new leg's first dart, the leg just won (so a checkout isn't instantly replaced by 501-501).
    held: !leg.visits.length && !leg.dartsIn ? prevResult : null };
}

/**
 * Every leg of a match from the live data, oldest first. Finished legs are kept
 * in `cache` (a Map) so each poll only re-reads the leg being played.
 */
export async function liveLegs(tid, mid, m, cache = new Map()) {
  if (!m || m.status === 'upcoming' || m.leg == null) return [];
  const sets = Math.max(1, m.set || 1);
  const want = [];
  for (let s = 1; s <= sets; s++) {
    if (s < sets) {
      const key = `set-${s}`;
      if (!cache.has(key)) cache.set(key, (await listDocs(`tournaments/${tid}/matches/${mid}/sets/${s}/legs`)).map(d => Number(d.id)).filter(Boolean).sort((a, b) => a - b));
      for (const l of cache.get(key)) want.push([s, l]);
    } else for (let l = 1; l <= m.leg; l++) want.push([s, l]);
  }
  const current = want[want.length - 1];
  return Promise.all(want.map(async ([s, l]) => {
    const key = `${s}-${l}`;
    const isCurrent = m.status === 'live' && s === current[0] && l === current[1];
    if (!isCurrent && cache.has(key)) return cache.get(key);
    const leg = await liveLeg(tid, mid, s, l);
    // Keep only legs that have been won: a leg read just before its checkout was
    // saved would otherwise stay "in play" for the rest of the match.
    if (!isCurrent && leg.visits.some(v => v.remaining === 0)) cache.set(key, leg);
    return leg;
  }));
}

/** The leg in play: what each player needs and who is throwing. */
export async function liveCurrentLeg(tid, m) {
  if (!m || m.status !== 'live' || !m.leg) return null;
  const leg = await liveLeg(tid, m.id, m.set || 1, m.leg);
  let prevFirst = null, prevLastAt = null, prevResult = null;
  // No darts yet in this leg: the previous leg says who starts and when the last dart went in.
  if ((leg.throwing == null || !leg.visits.length) && m.leg > 1) {
    const prev = await liveLeg(tid, m.id, m.set || 1, m.leg - 1).catch(() => null);
    if (prev?.visits[0]) prevFirst = prev.visits[0].isParticipant1 ? 0 : 1;
    prevLastAt = prev?.lastAt ?? null;
    prevResult = legResult(prev);
  }
  return legSummary(leg, m, prevFirst, prevLastAt, prevResult);
}

/** "First to 10 legs" / "First to 4 sets" for a stage ({ sets, bestOf, twoClear }). */
export function formatLabel(st) {
  if (!st?.bestOf) return '';
  const n = Math.floor(st.bestOf / 2) + 1;
  return `First to ${n} ${st.sets ? 'sets' : 'legs'}${st.twoClear ? ' (two clear)' : ''}`;
}

/** Short surname for tight spaces: the feed's last name ("van Gerwen"), else the name after the first word. */
export const surnameOf = p => p?.last || (p?.name || '').split(' ').slice(1).join(' ') || p?.name || '';

/** Short event names for the menu: "Grand Slam of Darts" -> "Grand Slam"; phone = the shortest form. */
const SHORT = [
  [/^grand slam/i, 'Grand Slam', 'Grand Slam'], [/^players championship finals/i, 'PC Finals', 'PC Finals'],
  [/^world championship/i, 'Worlds', 'Worlds'], [/matchplay/i, 'Matchplay', 'Matchplay'], [/grand prix/i, 'Grand Prix', 'Grand Prix'],
  [/^european championship/i, 'Euro Champs', 'Euro Champs'], [/^premier league/i, 'Premier League', 'Prem League'],
  [/^uk open/i, 'UK Open', 'UK Open'], [/^world cup/i, 'World Cup', 'World Cup'], [/world series of darts finals/i, 'WS Finals', 'WS Finals'],
  [/world masters$/i, 'World Masters', 'Masters'], [/masters$/i, null, 'Masters'],
];
export function shortEvent(name = '') {
  for (const [re, desk, phone] of SHORT) if (re.test(name)) return { desk: desk || name.replace(/ Darts Masters$/i, ' Masters'), phone };
  const desk = name.replace(/ (Darts|of Darts)\b/gi, '').trim();
  return { desk, phone: desk.length > 11 ? desk.split(' ')[0] : desk };
}
