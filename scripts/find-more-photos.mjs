// Extra Creative Commons photos for the players the news covers most, so
// their stories don't all share one picture. For each player: their Commons
// category (from Wikidata) and files named after them, filed under darts;
// free licences only; one clear face (macOS Vision, scripts/tools/faces.swift);
// different events preferred. Saves up to `--per` (default 3) per player as
// public/photos/<key>-<n>.jpg and records credits and face positions in
// src/data/extra-photos.json. Run make-image-sizes.mjs afterwards. Mac only.
// Usage: node scripts/find-more-photos.mjs [--players=16] [--per=3] [--dry]
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { keyName } from '../src/lib/pdc.mjs';
import { sleep, UA } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const arg = (n, d) => Number((process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1]) || d;
const N_PLAYERS = arg('players', 16), PER = arg('per', 3), dry = process.argv.includes('--dry');
const TMP = `${tmpdir()}/oche-more/`;
const FACES = `${tmpdir()}/oche-photos/faces`;
await mkdir(TMP, { recursive: true });
if (!existsSync(FACES)) { await mkdir(`${tmpdir()}/oche-photos`, { recursive: true }); execFileSync('swiftc', ['-O', `${ROOT}scripts/tools/faces.swift`, '-o', FACES]); }

const portraits = JSON.parse(await readFile(`${ROOT}src/data/portraits.json`, 'utf8'));
const extra = existsSync(`${ROOT}src/data/extra-photos.json`) ? JSON.parse(await readFile(`${ROOT}src/data/extra-photos.json`, 'utf8')) : {};

// Who the news covers most (lead players of each story), plus the world's top 10.
const counts = new Map();
for (const f of await readdir(`${ROOT}src/content/news`)) {
  const s = JSON.parse(await readFile(`${ROOT}src/content/news/${f}`, 'utf8'));
  for (const n of (s.players || []).slice(0, 2)) counts.set(n, (counts.get(n) || 0) + 1);
}
const rankings = JSON.parse(await readFile(`${ROOT}src/data/rankings.json`, 'utf8'));
for (const p of rankings.players.slice(0, 10)) counts.set(p.name, (counts.get(p.name) || 0) + 2);
const players = [...counts].sort((a, b) => b[1] - a[1]).map(([n]) => n).filter(n => portraits[keyName(n)]).slice(0, N_PLAYERS);

async function api(host, q) {
  for (let k = 0; k < 6; k++) {
    const r = await fetch(`https://${host}/w/api.php?format=json&maxlag=5&${q}`, { headers: { 'user-agent': UA } });
    const t = await r.text();
    if (t.startsWith('{')) { await sleep(350); return JSON.parse(t); }
    await sleep(4000 * (k + 1));
  }
  throw new Error('API unavailable');
}
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const FREE = /^(CC BY(-SA)? [\d.]+|CC0|Public domain)/i;

async function category(name) {
  const s = await api('www.wikidata.org', `action=wbsearchentities&language=en&type=item&limit=6&search=${encodeURIComponent(name)}`);
  const ids = (s.search || []).map(x => x.id);
  if (!ids.length) return null;
  const e = await api('www.wikidata.org', `action=wbgetentities&props=claims|descriptions&languages=en&ids=${ids.join('|')}`);
  for (const id of ids) {
    const it = e.entities?.[id];
    if (!it || !/dart/i.test(it.descriptions?.en?.value || '') && !(it.claims?.P641 || []).some(c => c.mainsnak?.datavalue?.value?.id === 'Q190115')) continue;
    const cat = it.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
    if (cat) return `Category:${cat}`;
  }
  return null;
}

async function candidates(name) {
  const titles = new Set();
  const cat = await category(name);
  if (cat) {
    const d = await api('commons.wikimedia.org', `action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmtype=file&cmlimit=200`);
    for (const m of d.query?.categorymembers || []) titles.add(m.title);
  }
  const s = await api('commons.wikimedia.org', `action=query&list=search&srnamespace=6&srlimit=40&srsearch=${encodeURIComponent(`intitle:"${name}" darts`)}`);
  for (const m of s.query?.search || []) titles.add(m.title);
  // Solo shots only: no "X v Y", teams or doubles.
  // Pictures of two people ("A, B" after the last " - ", "A en B"), and non-darts occasions, are skipped.
  const multi = t => { const subj = t.replace(/\.jpe?g$/i, '').split(' - ').slice(1).join(' - '); return /,/.test(subj.split(' - ')[0] || ''); };
  const list = [...titles].filter(t => !/ (v|vs|and|&|en|und) /i.test(t.replace(/\(cropped\)/i, '').split(' - ')[0].replace(/ \d+-\d+ .*/, '')) && !multi(t) && !/team|world cup|wcod|pairs|doubles|trophy ceremony|prime minister|downing street/i.test(t));
  const out = [];
  for (let i = 0; i < list.length; i += 40) {
    const d = await api('commons.wikimedia.org', `action=query&titles=${encodeURIComponent(list.slice(i, i + 40).join('|'))}&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=1200&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|DateTimeOriginal`);
    for (const p of Object.values(d.query?.pages || {})) {
      const ii = p.imageinfo?.[0]; if (!ii || !/jpeg/.test(ii.mime) || ii.width < 1000) continue;
      const m = ii.extmetadata || {};
      const lic = strip(m.LicenseShortName?.value);
      if (!FREE.test(lic) || /\bNC\b|ND/.test(lic)) continue;
      out.push({ title: p.title, thumb: ii.thumburl, url: ii.descriptionurl, w: ii.width, h: ii.height, license: lic, licenseUrl: strip(m.LicenseUrl?.value), artist: strip(m.Artist?.value), date: strip(m.DateTimeOriginal?.value) });
    }
  }
  return out;
}

const day = c => (c.date.match(/\d{4}[-:]\d\d[-:]\d\d/) || c.title.match(/\d{4}-\d\d-\d\d/) || [''])[0].replace(/:/g, '-');
let added = 0;
for (const name of players) {
  const key = keyName(name);
  const have = extra[key] || [];
  if (have.length >= PER) { console.log(`  ok        ${name} (${have.length})`); continue; }
  const used = new Set([portraits[key]?.source, ...have.map(x => x.source)]);
  // When a file is captioned "Match - Subject", the subject must be this player.
  const subjectOk = c => { const parts = c.title.replace(/\.jpe?g$/i, '').split(' - '); return parts.length < 2 || !/\d+-\d+/.test(parts[0]) || parts[1].toLowerCase().includes(name.split(' ').slice(-1)[0].toLowerCase()); };
  let cands = (await candidates(name)).filter(c => !used.has(c.url) && subjectOk(c));
  // Newest first, one per day/event, so the set spans different nights.
  cands.sort((a, b) => day(b).localeCompare(day(a)));
  const seenDay = new Set([...have.map(x => x.day)]);
  const picked = [...have];
  for (const c of cands) {
    if (picked.length >= PER) break;
    const d = day(c) || c.title.replace(/ ?\(cropped\)/i, '');
    if (seenDay.has(d)) continue;
    const n = picked.length + 2;
    const file = `${TMP}${key}-${n}.jpg`;
    try {
      const res = await fetch(c.thumb, { headers: { 'user-agent': UA } });
      if (!res.ok) continue;
      await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(file);
    } catch { continue; }
    const [, x, y, h] = execFileSync(FACES, [file], { encoding: 'utf8' }).trim().split('\t');
    // One clear face, big enough to read and not hard against an edge.
    if (x === undefined || x === '-' || +h < 0.11 || +x < 0.12 || +x > 0.88) continue;
    picked.push({ file: `/photos/${key}-${n}.jpg`, tmp: file, face: { x: +x, y: +y, h: +h }, day: d, credit: `${c.artist || 'Unknown'}, Wikimedia Commons`, license: c.license, licenseUrl: c.licenseUrl, source: c.url, title: c.title });
    if (d) seenDay.add(d);
    await sleep(500);
  }
  const fresh = picked.slice(have.length);
  console.log(`  +${fresh.length}        ${name}${fresh.map(f => `\n             ${f.title} (${f.license})`).join('')}`);
  if (!dry) {
    for (const f of fresh) { await sharp(f.tmp).toFile(`${ROOT}public${f.file}`); delete f.tmp; }
    if (picked.length) extra[key] = picked.map(({ tmp, ...rest }) => rest);
    added += fresh.length;
  }
}
if (!dry) await writeFile(`${ROOT}src/data/extra-photos.json`, JSON.stringify(extra, null, 1) + '\n');
console.log(`${added} photos added for ${players.length} players`);
