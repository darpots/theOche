// Builds src/data/calendar.json: PDC events shown on Sky Sports, ITV or
// (European Tour) PDCTV, from two years ago (shown under "Show completed") to 15 months ahead.
import { appendFile, writeFile } from 'node:fs/promises';
import { API, BROADCASTERS, broadcasterFor, eventWinner, cleanName, playerName, isPlaceholder, isMajor } from '../src/lib/pdc.mjs';
import { getAll, writeJsonIfChanged, log } from './lib.mjs';

const OUT = new URL('../src/data/calendar.json', import.meta.url).pathname;
const ROOT = new URL('../', import.meta.url).pathname;

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
  const broadcaster = broadcasterFor(a);
  if (!broadcaster) continue;
  // A televised type the map doesn't know yet: shown with a guessed channel, and flagged.
  if (!BROADCASTERS[a.tournamentTypeID]) unmapped.push(`${a.name} (type ${a.tournamentTypeID}, shown as ${broadcaster})`);
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
    major: isMajor(name),
    // Only once the event is over: the feed can name a winner before the final.
    winner: eventWinner(a),
    // Matches published so far: when above zero the draw and schedule are out.
    fixtures: a.fixtureCount || 0,
    image: a.tournamentListingImage || null,
    logo: a.tournamentLogo || null,
  });
}
events.sort((x, y) => x.start.localeCompare(y.start) || x.name.localeCompare(y.name));

if (unmapped.length) {
  const msg = `Televised PDC events with no broadcaster mapping, shown with a guessed channel (confirm in BROADCASTERS in src/lib/pdc.mjs):\n- ${[...new Set(unmapped)].join('\n- ')}`;
  // For the workflow: it opens (or updates) a GitHub issue with this list.
  await writeFile(`${ROOT}.unmapped-broadcasters.txt`, msg + '\n');
  console.warn(msg);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Calendar\n${msg}\n`);
}

const changed = await writeJsonIfChanged(OUT, { updatedAt: new Date().toISOString(), events }, { stamp: 'updatedAt' });
log(`calendar: ${events.length} events (${changed ? 'updated' : 'unchanged'})`);
