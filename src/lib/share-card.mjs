// "Share result": draws a 1200×630 result card for a finished match in the browser
// (canvas, the site's fonts and colours) and hands it to the phone's share sheet,
// or downloads it where sharing files isn't supported.
// The button carries the details: data-share-card plus data-n1/n2, s1/s2, a1/a2, ev, stg, id.

const loadFont = async () => { try { await Promise.all([document.fonts.load('120px Anton'), document.fonts.load('800 40px "Bricolage Grotesque Variable"'), document.fonts.load('700 26px "Inter Variable"')]); } catch { /* fall back */ } };

export async function drawCard(d) {
  await loadFont();
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d');
  // Ink ground with the two player colours glowing from the sides.
  g.fillStyle = '#0b0c10'; g.fillRect(0, 0, 1200, 630);
  for (const [x, col] of [[0, 'rgba(43,75,255,.45)'], [1200, 'rgba(232,54,45,.45)']]) {
    const r = g.createRadialGradient(x, 630, 0, x, 630, 700);
    r.addColorStop(0, col); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 1200, 630);
  }
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#c8ff2e'; g.font = '700 26px "Inter Variable", system-ui, sans-serif';
  g.fillText(`${d.ev}${d.stg ? ' · ' + d.stg : ''}`.toUpperCase(), 64, 92);
  // Score in the middle.
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '260px Anton, Impact, sans-serif';
  g.fillText(`${d.s1}–${d.s2}`, 600, 390);
  // Names under each side, the winner in volt.
  const fit = (t, max, size) => { let s = size; do { g.font = `800 ${s}px "Bricolage Grotesque Variable", system-ui, sans-serif`; s -= 2; } while (g.measureText(t).width > max && s > 20); };
  for (const [i, x, align] of [[0, 64, 'left'], [1, 1136, 'right']]) {
    const won = i === 0 ? +d.s1 > +d.s2 : +d.s2 > +d.s1;
    g.textAlign = align; fit(d[`n${i + 1}`], 500, 52);
    g.fillStyle = won ? '#c8ff2e' : '#fff';
    g.fillText(d[`n${i + 1}`], x, 500);
    if (d[`a${i + 1}`]) { g.font = '700 30px "Inter Variable", system-ui, sans-serif'; g.fillStyle = '#b9bdc9'; g.fillText(`${d[`a${i + 1}`]} average`, x, 548); }
  }
  // Brand.
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '800 34px "Bricolage Grotesque Variable", system-ui, sans-serif';
  g.fillText('The Oche', 1136, 92);
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}

export function wireShareCards() {
  if (window.__ocheShareWired) return;
  window.__ocheShareWired = true;
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-share-card]');
    if (!b) return;
    const d = b.dataset;
    const blob = await drawCard(d);
    const file = new File([blob], `${d.n1}-v-${d.n2}.png`.replace(/\s+/g, '-').toLowerCase(), { type: 'image/png' });
    const text = `${d.n1} ${d.s1}–${d.s2} ${d.n2} · ${d.ev}`;
    const url = `${location.origin}/match?id=${d.id}`;
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, url }); return; }
    } catch { return; /* cancelled */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}
