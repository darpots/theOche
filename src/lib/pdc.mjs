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
/** Emoji flag (sub-national UK flags use tag sequences). */
export function flag(code) {
  if (!code) return '';
  if (code.startsWith('GB-')) {
    const sub = code.slice(3).toLowerCase();
    return '\u{1F3F4}' + [...('gb' + sub)].map(c => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join('') + '\u{E007F}';
  }
  if (code.length !== 2) return '';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

export const keyName = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
