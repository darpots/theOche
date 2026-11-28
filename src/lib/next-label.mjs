import { ukTime } from './format.mjs';

/**
 * The volt tile's label. While the feature tile is itself showing the next match
 * ("Next up"), this tile says "Also at" for a match on another board at the same
 * time, or "After that" for a later one; otherwise it is "Next up".
 * feature: { f, mode } of the feature tile, or null.
 */
export function nextTileLabel(f, feature) {
  const time = ukTime(f.time, f.date);
  if (feature?.mode === 'next' && feature.f && feature.f !== f) {
    const same = time && f.date === feature.f.date && ukTime(feature.f.time, feature.f.date) === time;
    return same ? `Also at ${time}` : `After that · ${time || 'TBC'}`;
  }
  return `Next up · ${time || 'TBC'}`;
}

