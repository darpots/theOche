// Finds Creative Commons photos on Wikimedia Commons for ranked players (and
// the current tournament's field) who don't have one yet, and adds them to
// src/data/portraits.json with full credits. Prefers the player's own Commons
// category (so it's the right person), recent photos, and portrait framing.
// Then run make-cutouts.mjs and make-photos.mjs for the new keys (Mac).
// Usage: node scripts/find-portraits.mjs [--dry]
import { readFile, writeFile } from 'node:fs/promises';
import { keyName } from '../src/lib/pdc.mjs';
import { sleep, UA } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const dry = process.argv.includes('--dry');
const portraits = JSON.parse(await readFile(`${ROOT}src/data/portraits.json`, 'utf8'));
const rankings = JSON.parse(await readFile(`${ROOT}src/data/rankings.json`, 'utf8'));
const tour = JSON.parse(await readFile(`${ROOT}src/data/tournament.json`, 'utf8'));

const names = new Map();
for (const p of rankings.players.filter(p => p.pos <= 128)) names.set(keyName(p.name), p.name);
for (const s of tour.tournament.stages) for (const f of s.fixtures) for (const p of [f.p1, f.p2]) if (p) names.set(keyName(p.name), p.name);
const missing = [...names].filter(([k]) => !portraits[k]);
console.log(`${missing.length} players without a photo`);

async function api(q) {
  for (let k = 0; k < 6; k++) {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?format=json&maxlag=5&${q}`, { headers: { 'user-agent': UA } });
    const t = await r.text();
    if (t.startsWith('{')) { await sleep(400); return JSON.parse(t); }
    await sleep(4000 * (k + 1));
  }
  throw new Error('Commons API unavailable');
}
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const FREE = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i;

async function infos(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 40) {
    const d = await api(`action=query&titles=${encodeURIComponent(titles.slice(i, i + 40).join('|'))}&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|DateTimeOriginal|ObjectName`);
    for (const p of Object.values(d.query?.pages || {})) {
      const ii = p.imageinfo?.[0]; if (!ii || !/jpeg|png/.test(ii.mime)) continue;
      const m = ii.extmetadata || {};
      out.push({ title: p.title, w: ii.width, h: ii.height, url: ii.descriptionurl, license: strip(m.LicenseShortName?.value), licenseUrl: strip(m.LicenseUrl?.value), artist: strip(m.Artist?.value), date: strip(m.DateTimeOriginal?.value) });
    }
  }
  return out;
}

async function wikidataImage(name) {
  // A Wikidata person who is a darts player (occupation, sport or description), with an image.
  const j = async u => { for (let k = 0; k < 5; k++) { const r = await fetch(u, { headers: { 'user-agent': UA } }); const t = await r.text(); if (t.startsWith('{')) return JSON.parse(t); await sleep(3000 * (k + 1)); } return {}; };
  const s = await j(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=${encodeURIComponent(name)}`);
  const ids = (s.search || []).map(x => x.id);
  if (!ids.length) return null;
  const e = await j(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|descriptions&languages=en&ids=${ids.join('|')}`);
  for (const id of ids) {
    const it = e.entities?.[id]; if (!it) continue;
    const occ = (it.claims?.P106 || []).map(c => c.mainsnak?.datavalue?.value?.id);
    const sport = (it.claims?.P641 || []).map(c => c.mainsnak?.datavalue?.value?.id);
    const darts = occ.includes('Q13382460') || sport.includes('Q190115') || /dart/i.test(it.descriptions?.en?.value || '');
    if (!darts) continue;
    const img = it.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    return img ? `File:${img}` : null;
  }
  return null;
}

async function dartsTitles(name) {
  // Commons files whose title names the player, filed under a darts category,
  // that aren't match or group photos.
  const d = await api(`action=query&list=search&srnamespace=6&srlimit=30&srsearch=${encodeURIComponent(`intitle:"${name}"`)}`);
  const titles = (d.query?.search || []).map(x => x.title).filter(t => !/ (v|vs|and|&|-) /i.test(t.replace(/\(cropped\)/i, '')) && !/team|wcod|world cup/i.test(t));
  if (!titles.length) return [];
  const c = await api(`action=query&prop=categories&cllimit=500&titles=${encodeURIComponent(titles.join('|'))}`);
  return Object.values(c.query?.pages || {}).filter(p => (p.categories || []).some(x => /dart|pdc/i.test(x.title))).map(p => p.title);
}

const found = {};
for (const [key, name] of missing) {
  const titles = [];
  const wd = await wikidataImage(name);
  if (wd) titles.push(wd);
  titles.push(...(await dartsTitles(name)));
  const cands = (await infos([...new Set(titles)])).filter(c => FREE.test(c.license) && c.w >= 500);
  if (!cands.length) { console.log('  none     ', name); continue; }
  const year = c => Number((c.date.match(/(20\d\d)/) || c.title.match(/(20\d\d)/) || [0, 0])[1]);
  const score = c => (c.title === wd ? 50 : 0) + year(c) * 10 + (/cropped/i.test(c.title) ? 8 : 0) + (c.h >= c.w * 0.9 ? 6 : 0) + Math.min(5, c.w / 1000);
  cands.sort((a, b) => score(b) - score(a));
  const c = cands[0];
  found[key] = { name, image: `/portraits/player-${key}.jpg`, credit: `${c.artist || 'Unknown'}, Wikimedia Commons`, license: c.license, licenseUrl: c.licenseUrl, source: c.url };
  console.log(`  ${(c.title === wd ? 'wikidata' : 'commons').padEnd(9)} ${name}: ${c.title} (${c.license})`);
}
console.log(`found ${Object.keys(found).length}/${missing.length}`);
if (!dry && Object.keys(found).length) {
  await writeFile(`${ROOT}src/data/portraits.json`, JSON.stringify({ ...portraits, ...found }, null, 1) + '\n');
  await writeFile(`${ROOT}data/new-portraits.json`, JSON.stringify(Object.keys(found)) + '\n');
}
