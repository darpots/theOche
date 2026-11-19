// Calendar backgrounds: one Creative Commons photo per event venue, from
// Wikimedia Commons. Searches by venue name (sponsor names dropped), falling
// back to the venue's Commons category; free licences only (no NC/ND),
// landscape and at least 1200px wide. Saves public/venues/<key>.jpg plus 600px
// WebP, and credits in src/data/venue-photos.json. Review picks by eye after
// running (scripts write a contact sheet with --sheet=path).
// Usage: node scripts/find-venue-photos.mjs [--only=key,key] [--sheet=file.jpg]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { sleep, UA } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1];
const only = (arg('only') || '').split(',').filter(Boolean);
const calendar = JSON.parse(await readFile(`${ROOT}src/data/calendar.json`, 'utf8'));
const out = existsSync(`${ROOT}src/data/venue-photos.json`) ? JSON.parse(await readFile(`${ROOT}src/data/venue-photos.json`, 'utf8')) : {};
await mkdir(`${ROOT}public/venues`, { recursive: true });

export const venueKey = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Search terms: the venue without sponsor prefixes, plus the city.
const SPONSOR = /^(utilita|wt energiesysteme|merkur|mvm|afas|ostermann|mattioli|ovo|uber|m&s bank|first direct|p & j|ao|motorpoint|spark|win|pva)\s+/i;
const terms = (venue, city) => {
  const v = venue.split(',')[0].trim();
  const bare = v.replace(SPONSOR, '');
  const c = (city || '').split(',')[0];
  return [...new Set([`${v} ${c}`, `${bare} ${c}`, v, bare])].filter(t => t.length > 3);
};

async function api(q) {
  for (let k = 0; k < 6; k++) {
    const t = await (await fetch(`https://commons.wikimedia.org/w/api.php?format=json&maxlag=5&${q}`, { headers: { 'user-agent': UA } })).text();
    if (t.startsWith('{')) { await sleep(350); return JSON.parse(t); }
    await sleep(4000 * (k + 1));
  }
  return {};
}
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function find(venue, city) {
  for (const q of terms(venue, city)) {
    const s = await api(`action=query&list=search&srnamespace=6&srlimit=25&srsearch=${encodeURIComponent(q)}`);
    const titles = (s.query?.search || []).map(x => x.title).filter(t => /\.jpe?g$/i.test(t));
    if (!titles.length) continue;
    const d = await api(`action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1400&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist`);
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const cands = Object.values(d.query?.pages || {}).map(p => ({ p, ii: p.imageinfo?.[0] })).filter(({ ii }) => ii && ii.width >= 1200 && ii.width > ii.height * 1.15)
      .map(({ p, ii }) => ({ title: p.title, thumb: ii.thumburl, url: ii.descriptionurl, license: strip(ii.extmetadata?.LicenseShortName?.value), licenseUrl: strip(ii.extmetadata?.LicenseUrl?.value), artist: strip(ii.extmetadata?.Artist?.value) }))
      .filter(c => /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i.test(c.license) && !/\bNC\b|ND/.test(c.license))
      // Prefer titles that name the venue, and outside or wide shots.
      .map(c => ({ ...c, score: words.filter(w => c.title.toLowerCase().includes(w)).length * 3 + (/exterior|outside|front|arena|hall|halle|building|night|panorama/i.test(c.title) ? 1 : 0) - (/map|logo|plan|seat|ticket/i.test(c.title) ? 9 : 0) }))
      .sort((a, b) => b.score - a.score);
    if (cands.length && cands[0].score >= 3) return cands[0];
  }
  return null;
}

const venues = new Map();
for (const e of calendar.events) if (e.venue) venues.set(venueKey(e.venue), { venue: e.venue, city: e.city });
let found = 0;
for (const [key, { venue, city }] of venues) {
  // Already done, or rejected on review (stored as null): skip.
  if (only.length ? !only.includes(key) : key in out) continue;
  const c = await find(venue, city);
  if (!c) { console.log(`  none   ${venue}`); continue; }
  try {
    const res = await fetch(c.thumb, { headers: { 'user-agent': UA } });
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(`${ROOT}public/venues/${key}.jpg`);
    await sharp(buf).resize({ width: 700, withoutEnlargement: true }).webp({ quality: 72 }).toFile(`${ROOT}public/venues/${key}-600.webp`);
    out[key] = { venue, file: c.title, credit: `${c.artist || 'Unknown'}${/wikimedia commons/i.test(c.artist) ? '' : ', Wikimedia Commons'}`, license: c.license, licenseUrl: c.licenseUrl, source: c.url };
    found++;
    console.log(`  found  ${venue}: ${c.title} (${c.license})`);
  } catch (e) { console.log(`  skip   ${venue}: ${e.message}`); }
  await sleep(500);
}
await writeFile(`${ROOT}src/data/venue-photos.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`${found} venue photos found, ${Object.values(out).filter(Boolean).length} in total`);
const sheet = arg('sheet');
if (sheet) {
  const keys = Object.keys(out).filter(k => out[k]);
  const tiles = await Promise.all(keys.map(k => sharp(`${ROOT}public/venues/${k}-600.webp`).resize(240, 135, { fit: 'cover' }).toBuffer()));
  await sharp({ create: { width: 8 * 244, height: Math.ceil(keys.length / 8) * 139, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 8) * 244, top: Math.floor(i / 8) * 139 }))).jpeg().toFile(sheet);
  console.log(keys.map((k, i) => `${i}:${k}`).join('  '));
}
