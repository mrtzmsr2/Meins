export const fmtEUR = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const fmtNum = (n) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function pickRandom(arr, n, exclude = new Set()) {
  const pool = arr.filter(x => !exclude.has(x.id));
  const out = [];
  const used = new Set();
  while (out.length < n && used.size < pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(pool[i]);
  }
  return out;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function relTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

// Score model: distance ratio → 0..1000 points, with a bonus for very accurate guesses.
export function scoreGuess(actual, guess) {
  const a = Math.max(actual, 1);
  const ratio = Math.abs(actual - guess) / a;
  // exponential decay; 0% off = 1000, 5% off ≈ 778, 20% off = 449, 50% off ≈ 200, 100% off ≈ 100
  const base = Math.round(1000 * Math.exp(-ratio * 5));
  // Perfect-ish bonus
  const bonus = ratio < 0.02 ? 250 : ratio < 0.05 ? 100 : ratio < 0.1 ? 40 : 0;
  return Math.min(1500, base + bonus);
}

export function ratingFor(points) {
  if (points >= 1100) return { label: 'Volltreffer!', cls: 'good', emoji: '🎯' };
  if (points >= 800)  return { label: 'Stark!',       cls: 'good', emoji: '🔥' };
  if (points >= 500)  return { label: 'Solide.',      cls: 'mid',  emoji: '👍' };
  if (points >= 250)  return { label: 'Schief.',      cls: 'mid',  emoji: '😬' };
  return                   { label: 'Daneben.',     cls: 'bad',  emoji: '💸' };
}

export function logScale(min, max, t /* 0..1 */) {
  const lmin = Math.log(min), lmax = Math.log(max);
  return Math.exp(lmin + (lmax - lmin) * t);
}
export function logScaleInverse(min, max, value) {
  const lmin = Math.log(min), lmax = Math.log(max);
  return (Math.log(Math.max(min, value)) - lmin) / (lmax - lmin);
}
