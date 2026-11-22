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

export const BROADCASTER_INFO = {
  sky: { label: 'Sky Sports', short: 'Sky', logo: '/brand/sky-sports.svg' },
  itv: { label: 'ITV', short: 'ITV', logo: '/brand/itv.svg' },
  pdctv: { label: 'PDCTV', short: 'PDCTV', logo: '/brand/pdctv.png' },
};

/** Broadcaster logo badge (HTML string), shared by build-time pages and browser scripts. */
export function tvBadge(b) {
  const info = BROADCASTER_INFO[b];
  if (!info) return '';
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
    id: String(d.id),
    name, tag,
    fullName: a.name,
    start: a.startDate,
    end: a.endDate,
    venue: a.venue || null,
    city: a.city || null,
    typeId: a.type?.tournamentTypeID ?? a.tournamentTypeID ?? null,
    broadcaster: BROADCASTERS[a.type?.tournamentTypeID ?? a.tournamentTypeID] || null,
    logo: a.tournamentLogo || null,
    image: a.tournamentPromoImage || a.tournamentListingImage || null,
    winner: a.winner && !isPlaceholder(a.winner) ? { id: String(a.winner.participantID), name: playerName(a.winner) } : null,
    stages,
  };
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

// The feed gives each stage's prize for losing there, but not the winner's
// prize. Known winner prizes are listed; anything else is estimated from the
// runner-up prize with the usual ratio for that kind of event.
const WINNER_PRIZE = {
  '2024 Grand Slam of Darts': 150000,
  '2025 Grand Slam of Darts': 150000,
  '2024 World Championship': 500000,
  '2025 World Championship': 500000,
  '2026 World Championship': 1000000,
  '2024 World Matchplay': 800000,
  '2025 World Matchplay': 800000,
  '2024 World Grand Prix': 120000,
  '2024 European Championship': 120000,
  '2024 Players Championship Finals': 120000,
  '2024 UK Open': 110000,
};
const WINNER_RATIO = { '29': 1.5, '14': 2.5 };

const stageOrder = s => (Number(s.cupRound) > 0 ? Number(s.cupRound) : 99); // lower = later round; groups first

/**
 * Prize money per player from a tournament payload's attributes.
 * Completed rounds count in full; for an event in progress a player still in it
 * is credited with the prize for the furthest round they are guaranteed.
 * Returns Map<pid, { amount, round, alive }>.
 */
export function eventPrizes(a) {
  const stages = [...(a.stages || [])].sort((x, y) => stageOrder(y) - stageOrder(x));
  const byCup = new Map(stages.map(s => [stageOrder(s), s]));
  const out = new Map();
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
          if (won && ord === 1) {
            const runnerUp = comp;
            rec.amount = WINNER_PRIZE[a.name] ?? Math.round(runnerUp * (WINNER_RATIO[a.type?.tournamentTypeID ?? a.tournamentTypeID] ?? 2));
            rec.round = 'Winner'; rec.estimated = !(a.name in WINNER_PRIZE);
          } else if (won && ord < 99 && !out.has('__next') && byCup.has(ord - 1)) {
            // Won this round, next round not drawn yet: guaranteed the next round's prize.
            const next = byCup.get(ord - 1);
            if (!(next.fixtures || []).some(x => [x.participant1, x.participant2].some(q => String(q?.participantID) === id))) {
              rec.amount = Math.max(rec.amount, Number(next.compensationValue) || 0); rec.round = next.stage?.name || rec.round;
            }
          }
        }
        out.set(id, rec);
      }
    }
  }
  // Once the knockout draw has players in it, anyone whose best round is a
  // group or league stage has been knocked out.
  const koDrawn = stages.some(st => stageOrder(st) < 99 && (st.fixtures || []).some(f => !isPlaceholder(f.participant1) || !isPlaceholder(f.participant2)));
  if (koDrawn) for (const rec of out.values()) if (rec.order === 99) rec.alive = false;
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
export function expiringMap(dropping) {
  const lose = new Map();
  for (const d of [].concat(dropping || [])) for (const [id, r] of eventPrizes(d)) {
    if (!r.amount) continue;
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

/** The live race from a precomputed expiring map (a Map, or a plain object from JSON). */
export function liveRaceWith(official, current, expiring) {
  const lose = expiring instanceof Map ? expiring : new Map(Object.entries(expiring || {}));
  const gain = eventPrizes(current);
  const list = official.map(p => {
    const g = gain.get(p.id), l = lose.get(p.id);
    const plus = g?.amount || 0, minus = l?.amount || 0;
    return { ...p, official: p.money, money: p.money - minus + plus, plus, minus, expiring: l?.events || [], round: g?.round || null, alive: g ? g.alive : null, estimated: !!l?.estimated };
  });
  // Players who are not on the list yet but have earned money this event.
  for (const [id, g] of gain) if (g.amount && !official.some(p => p.id === id)) list.push({ id, name: g.name, money: g.amount, official: 0, plus: g.amount, minus: 0, expiring: [], round: g.round, alive: g.alive, pos: null });
  list.sort((x, y) => y.money - x.money || (x.pos ?? 1e9) - (y.pos ?? 1e9));
  let rank = 0, last = null;
  list.forEach((p, i) => { if (p.money !== last) { rank = i + 1; last = p.money; } p.live = rank; p.move = p.pos ? p.pos - rank : null; });
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
    .filter(t => RANKED_TYPES.includes(t.tournamentTypeID) && t.fixtureCount > 0 && !/test/i.test(t.name));
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
  const lastAt = sorted.reduce((t, x) => Math.max(t, Date.parse(x.timestamp) || 0), 0) || null;
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

/** How long without a dart counts as a break. Real gaps between legs: 9–36s; the breaks after every fifth leg: 4–6 minutes. */
export const BREAK_AFTER = 90_000;
/**
 * PDC's live data has no break flag, so: a leg with no darts in it yet, and the
 * last dart (end of the previous leg) more than BREAK_AFTER ago.
 * Takes a leg summary (legSummary) or a leg plus the previous leg's lastAt.
 */
export function onBreak(l, prevLastAt = null, now = Date.now()) {
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
