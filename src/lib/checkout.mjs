// Checkout routes: the usual way to finish a score of 2–170 in three darts or
// fewer, ending on a double (or the bull). Built once from every combination,
// preferring fewest darts, then a balance of favourite doubles (D20, D16,
// D18…) and big set-up trebles (T20, T19…), so the familiar pro routes come
// out: 170 T20 T20 Bull, 141 T20 T19 D12, 120 T20 20 D20, 100 T20 D20.

const darts = [];
for (let n = 20; n >= 1; n--) {
  darts.push({ label: `T${n}`, v: n * 3, rank: (20 - n) * 2 });
  darts.push({ label: `${n}`, v: n, rank: 6 + (20 - n) * 0.3 + (n < 5 ? 8 : 0) }); // any single is an easy set-up dart (1–4 aren't aimed at)
}
darts.push({ label: '25', v: 25, rank: 30 }, { label: 'Bull', v: 50, rank: 31 });
for (let n = 20; n >= 1; n--) darts.push({ label: `D${n}`, v: n * 2, rank: 40 + (20 - n) });

const DOUBLE_PREF = [20, 16, 18, 12, 10, 8, 19, 17, 15, 14, 13, 11, 9, 7, 6, 5, 4, 3, 2, 1];
const finishers = [...DOUBLE_PREF.map((n, i) => ({ label: `D${n}`, v: n * 2, rank: i })), { label: 'Bull', v: 50, rank: 8 }];

const best = new Map();
const consider = (route, cost) => {
  const total = route.reduce((s, d) => s + d.v, 0);
  const cur = best.get(total);
  if (!cur || cost < cur.cost) best.set(total, { route: route.map(d => d.label), cost });
};
for (const f of finishers) {
  consider([f], 1000 + f.rank);
  for (const a of darts) {
    consider([a, f], 2000 + f.rank * 3 + a.rank);
    // Three-dart routes open on a treble where possible, so a hit leaves a two-dart finish.
    const opener = a.label.startsWith('T') ? 0 : 20;
    for (const b of darts) consider([a, b, f], 3000 + f.rank * 3 + a.rank + b.rank + opener);
  }
}

/** The route for a score, e.g. ['T20', '20', 'D20'], or null when there's no three-dart finish. */
export function checkout(n) {
  return n >= 2 && n <= 170 ? best.get(n)?.route || null : null;
}
