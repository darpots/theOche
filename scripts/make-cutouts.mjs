// Builds transparent player cut-outs for the homepage hero (macOS only: uses
// the built-in Vision subject-lifting via scripts/tools/cutout.swift).
// Source photos are the same Creative Commons images credited on /credits,
// fetched from Wikimedia Commons at a larger size. Run locally when portraits
// change:  node scripts/make-cutouts.mjs [key ...]
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { get, sleep, UA } from './lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = `${ROOT}public/cutouts/`;
const TMP = `${tmpdir()}/oche-cutouts/`;
const BIN = `${TMP}cutout`;
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });
if (!existsSync(BIN)) execFileSync('swiftc', ['-O', `${ROOT}scripts/tools/cutout.swift`, '-o', BIN]);

const portraits = JSON.parse(await readFile(`${ROOT}src/data/portraits.json`, 'utf8'));
const only = process.argv.slice(2);
const index = {};
for (const [key, p] of Object.entries(portraits)) {
  if (only.length && !only.includes(key)) continue;
  try {
    const file = decodeURIComponent(p.source.split('/wiki/')[1]);
    const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(file)}&prop=imageinfo&iiprop=url&iiurlwidth=1400&format=json`;
    const info = Object.values((await get(api)).query.pages)[0].imageinfo[0];
    const res = await fetch(info.thumburl || info.url, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`image ${res.status}`);
    const src = `${TMP}${key}.jpg`, png = `${TMP}${key}.png`;
    await writeFile(src, Buffer.from(await res.arrayBuffer()));
    execFileSync(BIN, [src, png]);
    const img = sharp(png).trim({ threshold: 1 });
    const meta = await img.metadata();
    await sharp(png).trim({ threshold: 1 }).resize({ height: 900, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toFile(`${OUT}${key}.webp`);
    index[key] = `/cutouts/${key}.webp`;
    console.log('ok', key, meta.width, meta.height);
    await rm(src); await rm(png);
  } catch (e) { console.warn('skip', key, e.message); }
  await sleep(300);
}
const idxPath = `${ROOT}src/data/cutouts.json`;
const prev = existsSync(idxPath) ? JSON.parse(await readFile(idxPath, 'utf8')) : {};
await writeFile(idxPath, JSON.stringify({ ...prev, ...index }, null, 1) + '\n');
