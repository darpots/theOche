// Chooses the cover for a news story. Photos are licensed Wikimedia Commons
// images (credits on /credits); "panel" covers put player cut-outs on a brand
// colour (used for variety, and for players with no licensed photo):
//  - the story's `image` field wins: a key from news-library.json, or 'player'
//  - otherwise a player's photo when the headline is about that player
//    (two photos side by side when it names both players in a match)
//  - otherwise a topical darts photo picked from the event or story
import library from '../data/news-library.json';
import portraits from '../data/portraits.json';
import faces from '../data/photo-faces.json';
import { keyName } from './pdc.mjs';
import { cutout } from './images.mjs';

type Lib = Record<string, { alt: string; focus: string }>;
const LIB = library as Lib;
const FACES = faces as Record<string, { x: number; y: number; h: number }>;
const PORTRAITS = portraits as Record<string, { name: string }>;

export interface CoverImage { src: string; alt: string; focus: string; cut?: boolean; srcset?: string; tone?: string }

const TONES = ['ink', 'red', 'volt', 'green', 'sky'];
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const cutFor = (name: string, tone: string): CoverImage | null => {
  const c = cutout(name);
  return c ? { src: c.src, srcset: c.srcset, alt: name, focus: 'center bottom', cut: true, tone } : null;
};

const photoFor = (name: string): CoverImage | null => {
  const k = keyName(name);
  const f = FACES[k];
  if (!PORTRAITS[k] || !f) return null;
  // object-position at the face centre keeps the face in frame at any crop.
  return { src: `/photos/${k}.jpg`, alt: name, focus: `${(f.x * 100).toFixed(1)}% ${Math.max(0, f.y * 100 - 4).toFixed(1)}%` };
};
const libImage = (key: string): CoverImage => ({ src: `/news-img/${key}.jpg`, alt: LIB[key].alt, focus: LIB[key].focus });

const GENERIC = ['darts-in-board', 'treble-twenty', 'board-close', 'walk-on', 'crowd-signs', 'dartboard'];
function topical(seed: string, tags: string[]): CoverImage {
  const t = tags.join(' ');
  if (/premier league/i.test(t)) return libImage('premier-league-trophy');
  if (/world championship/i.test(t)) return libImage('ally-pally-crowd');
  if (/matchplay/i.test(t)) return libImage('winter-gardens');
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return libImage(GENERIC[h % GENERIC.length]);
}

export function chooseCover(story: { slug: string; headline: string; tags: string[]; players: string[]; image?: string; kind?: string }): CoverImage[] {
  if (story.image && LIB[story.image]) return [libImage(story.image)];
  const lead = story.players.slice(0, 2);
  const surname = (n: string) => n.split(' ').slice(1).join(' ') || n;
  const inHeadline = (n: string) => new RegExp(`\\b${surname(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(story.headline);
  const forcePlayer = story.image === 'player' || story.kind === 'recap';
  const names = lead.filter(inHeadline);
  if (!names.length && forcePlayer && lead.length) names.push(lead[0]);
  if (!names.length) return [topical(story.slug, story.tags)];
  // Mix photos and colour panels so the same headshot doesn't fill the page:
  // about one story in three gets a panel, and so does anyone without a photo.
  const h = hash(story.slug), tone = TONES[h % TONES.length];
  const photos = names.map(photoFor);
  const panel = h % 3 === 0 || photos.some(p => !p);
  if (panel) {
    const cuts = names.map(n => cutFor(n, tone)).filter(Boolean) as CoverImage[];
    if (cuts.length === names.length) return cuts;
  }
  const ok = photos.filter(Boolean) as CoverImage[];
  if (ok.length) return ok;
  return [topical(story.slug, story.tags)];
}
