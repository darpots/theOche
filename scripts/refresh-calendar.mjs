// Builds src/data/calendar.json: PDC events shown on Sky Sports, ITV or
// (European Tour) PDCTV, from two years ago (shown under "Show completed") to 15 months ahead.
import { appendFile } from 'node:fs/promises';
import { API, BROADCASTERS, cleanName, playerName, isPlaceholder } from '../src/lib/pdc.mjs';
import { getAll, writeJsonIfChanged, log } from './lib.mjs';

const OUT = new URL('../src/data/calendar.json', import.meta.url).pathname;

const now = new Date();
const year = now.getUTCFullYear();
const from = new Date(now); from.setUTCMonth(from.getUTCMonth() - 24);
const to = new Date(now); to.setUTCMonth(to.getUTCMonth() + 15);
const iso = d => d.toISOString().slice(0, 10);

const rows = [];
for (const season of [year - 2, year - 1, year, year + 1]) {
  rows.push(...(await getAll(API.tournaments, { seasonID: season }, 100)));
}
if (rows.length < 50) throw new Error(`Calendar looks incomplete (${rows.length} tournaments)`);

const unmapped = [];
const events = [];
const seen = new Set();
for (const r of rows) {
  const a = r.attributes;
  if (seen.has(r.id) || /test|qualifier/i.test(a.name)) continue;
  seen.add(r.id);
  if (a.endDate < iso(from) || a.startDate > iso(to)) continue;
  const broadcaster = BROADCASTERS[a.tournamentTypeID];
  if (!broadcaster) {
    if (a.isTelevised && ['2', '3'].includes(a.tournamentCategoryID)) unmapped.push(`${a.name} (type ${a.tournamentTypeID})`);
    continue;
  }
  const { name, tag } = cleanName(a.name);
  events.push({
    id: r.id,
    name, tag,
    start: a.startDate,
    end: a.endDate,
    venue: a.venue || null,
    city: a.city || null,
    broadcaster,
    ranked: !!a.isRanked,
    major: a.tournamentCategoryID === '2' && a.tournamentTypeID !== '3',
    winner: a.winner && !isPlaceholder(a.winner) ? { id: String(a.winner.participantID), name: playerName(a.winner) } : null,
    // Matches published so far: when above zero the draw and schedule are out.
    fixtures: a.fixtureCount || 0,
    image: a.tournamentListingImage || null,
    logo: a.tournamentLogo || null,
  });
}
events.sort((x, y) => x.start.localeCompare(y.start) || x.name.localeCompare(y.name));

if (unmapped.length) {
  const msg = `Televised PDC events with no broadcaster mapping (add to BROADCASTERS in src/lib/pdc.mjs):\n- ${unmapped.join('\n- ')}`;
  console.warn(msg);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Calendar\n${msg}\n`);
}

const changed = await writeJsonIfChanged(OUT, { updatedAt: new Date().toISOString(), events }, { stamp: 'updatedAt' });
log(`calendar: ${events.length} events (${changed ? 'updated' : 'unchanged'})`);
