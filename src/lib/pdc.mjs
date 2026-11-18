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
export function liveRace(official, current, dropping) {
  // dropping: tournament attributes (or one) whose money comes off by the end
  // of the current event. A player's losses are summed across them.
  const gain = eventPrizes(current);
  const lose = new Map();
  for (const d of [].concat(dropping || [])) for (const [id, r] of eventPrizes(d)) {
    const l = lose.get(id) || { amount: 0, estimated: false };
    l.amount += r.amount; l.estimated ||= !!r.estimated;
    lose.set(id, l);
  }
  const list = official.map(p => {
    const g = gain.get(p.id), l = lose.get(p.id);
    const plus = g?.amount || 0, minus = l?.amount || 0;
    return { ...p, official: p.money, money: p.money - minus + plus, plus, minus, round: g?.round || null, alive: g ? g.alive : null, estimated: !!l?.estimated };
  });
  // Players who are not on the list yet but have earned money this event.
  for (const [id, g] of gain) if (g.amount && !official.some(p => p.id === id)) list.push({ id, name: g.name, money: g.amount, official: 0, plus: g.amount, minus: 0, round: g.round, alive: g.alive, pos: null });
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
