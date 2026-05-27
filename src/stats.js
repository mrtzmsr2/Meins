// MEINS! — Stats für die Trophäen-Seite (rein abgeleitet aus collection).
import * as collection from './collection.js';

/** XP pro Auto: 1 XP je angefangene 10.000 €. */
export function xpForCar(price) {
  return Math.floor(Math.max(0, Number(price) || 0) / 10000);
}

/** Level-Schwellen (kumulative XP). Index = Level-1. */
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 750, 1100, 1500, 2000, 2700, 3600];
const LEVEL_TITLES = [
  'Auto-Frischling',     // L1
  'Sammler',             // L2
  'Sp\u00fcrnase',       // L3
  'Profi-Sichter',       // L4
  'Auto-Connaisseur',    // L5
  'Garagen-Boss',        // L6
  'Gro\u00dfsammler',    // L7
  'Meistersammler',      // L8
  'PS-Legende',          // L9
  'Auto-Mogul',          // L10
  'Highway-Halbgott',    // L11
];

export function computeLevel(totalXp) {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  const cur = LEVEL_THRESHOLDS[level - 1] || 0;
  const next = LEVEL_THRESHOLDS[level] || null;
  const title = LEVEL_TITLES[level - 1] || LEVEL_TITLES[LEVEL_TITLES.length - 1];
  return {
    level,
    title,
    totalXp,
    currentLevelXp: cur,
    nextLevelXp: next,
    xpIntoLevel: totalXp - cur,
    xpForNextLevel: next ? next - cur : 0,
    progress: next ? (totalXp - cur) / (next - cur) : 1,
    isMax: next == null,
  };
}

/** Marken-Rang basierend auf Anzahl gesammelter Autos einer Marke. */
const BRAND_RANK_THRESHOLDS = [
  { count: 1,  label: 'Lehrling' },
  { count: 3,  label: 'Geselle' },
  { count: 7,  label: 'Meister' },
  { count: 15, label: 'Gro\u00dfmeister' },
];
export function brandRankFor(count) {
  let cur = null;
  for (const t of BRAND_RANK_THRESHOLDS) {
    if (count >= t.count) cur = t;
  }
  if (!cur) return null;
  return cur.label;
}

export function computeStats() {
  const items = collection.getAll();
  const totalCount = items.length;
  const totalValue = items.reduce((n, it) => n + (Number(it.price) || 0), 0);
  const brands = new Map();
  const dayMap = new Map();
  let topItem = null;

  for (const it of items) {
    const price = Number(it.price) || 0;
    if (!topItem || price > (Number(topItem.price) || 0)) topItem = it;

    const b = it.brand || 'Unbekannt';
    if (!brands.has(b)) brands.set(b, { brand: b, count: 0, value: 0 });
    const entry = brands.get(b);
    entry.count += 1;
    entry.value += price;

    const d = new Date(it.addedAt || 0);
    if (!isNaN(d)) {
      const key = d.toISOString().slice(0, 10);
      if (!dayMap.has(key)) dayMap.set(key, { date: key, count: 0, value: 0 });
      const dEntry = dayMap.get(key);
      dEntry.count += 1;
      dEntry.value += price;
    }
  }

  const favBrand = Array.from(brands.values()).sort((a, b) =>
    b.count - a.count || b.value - a.value
  )[0] || null;

  const richestDay = Array.from(dayMap.values()).sort((a, b) =>
    b.value - a.value
  )[0] || null;

  // Streak: aufeinanderfolgende Tage bis heute (rückwärts)
  const todayKey = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let cursor = new Date();
  // Tage normalisieren auf UTC-Datum
  for (let i = 0; i < 365; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (dayMap.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Erlaubte Lücke: heute selbst zählt nur, wenn etwas drin ist
      if (i === 0 && key === todayKey) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
  }

  // Achievements
  const achievements = [];
  achievements.push({ id: 'first', label: 'Erstes Auto', icon: '🏁', done: totalCount >= 1 });
  achievements.push({ id: 'five',  label: '5 Autos',     icon: '🥉', done: totalCount >= 5 });
  achievements.push({ id: 'ten',   label: '10 Autos',    icon: '🥈', done: totalCount >= 10 });
  achievements.push({ id: 'fifty', label: '50 Autos',    icon: '🥇', done: totalCount >= 50 });
  achievements.push({ id: 'milli', label: 'Erste Million €', icon: '💰', done: totalValue >= 1_000_000 });
  achievements.push({ id: 'tenmilli', label: '10 Millionen €', icon: '💎', done: totalValue >= 10_000_000 });
  achievements.push({ id: 'streak3', label: '3 Tage in Folge', icon: '🔥', done: streak >= 3 });
  achievements.push({ id: 'streak7', label: '7 Tage in Folge', icon: '🚀', done: streak >= 7 });

  // Level: XP aus allen gesammelten Autos.
  const totalXp = items.reduce((n, it) => n + xpForCar(it.price), 0);
  const levelInfo = computeLevel(totalXp);

  // Marken-Raenge: pro Marke die Anzahl + (falls erreicht) Rang.
  const brandRanks = Array.from(brands.values())
    .map(b => ({ brand: b.brand, count: b.count, value: b.value, rank: brandRankFor(b.count) }))
    .filter(b => b.rank)
    .sort((a, b) => b.count - a.count || b.value - a.value);

  return {
    totalCount,
    totalValue,
    brandCount: brands.size,
    topItem,
    favBrand,
    richestDay,
    streak,
    achievements,
    totalXp,
    levelInfo,
    brandRanks,
  };
}

/** Letzte N Tage als Timeline (heute zuerst), inklusive leerer Tage. */
export function recentDays(n = 7) {
  const items = collection.getAll();
  const dayMap = new Map();
  for (const it of items) {
    const d = new Date(it.addedAt || 0);
    if (isNaN(d)) continue;
    const key = d.toISOString().slice(0, 10);
    if (!dayMap.has(key)) dayMap.set(key, { date: key, items: [], count: 0, value: 0 });
    const e = dayMap.get(key);
    e.items.push(it);
    e.count += 1;
    e.value += Number(it.price) || 0;
  }
  const out = [];
  const cursor = new Date();
  for (let i = 0; i < n; i++) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(dayMap.get(key) || { date: key, items: [], count: 0, value: 0 });
    cursor.setDate(cursor.getDate() - 1);
  }
  return out;
}
