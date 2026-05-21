// Persistente langfristige Sammlung — nur Einträge MIT Foto.
// Metadaten in localStorage, Bilder in IndexedDB (siehe photos.js).
import { addPhoto, deletePhoto } from './photos.js';
import { CARS } from './data/cars.js';

const KEY = 'meins.collection.v1';
const SETTINGS_KEY = 'meins.collection.settings';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { showPhotos: true };
  } catch { return { showPhotos: true }; }
}
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  return s;
}

/**
 * Add an entry to the collection. Photo is REQUIRED (proof rule).
 * @param {{brand:string, model:string, price:number, dataUrl:string, playerName?:string}} entry
 */
export async function addEntry(entry) {
  if (!entry?.dataUrl) throw new Error('Foto erforderlich');
  const photoId = await addPhoto(entry.dataUrl);
  const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const items = read();
  items.unshift({
    id,
    brand: String(entry.brand || ''),
    model: String(entry.model || ''),
    price: Number(entry.price) || 0,
    photoId,
    playerName: entry.playerName || null,
    addedAt: Date.now(),
  });
  // Soft-Limit
  const trimmed = items.slice(0, 500);
  write(trimmed);
  return id;
}

export function getAll() {
  return read().slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export async function removeEntry(id) {
  const items = read();
  const idx = items.findIndex(it => it.id === id);
  if (idx === -1) return;
  const it = items[idx];
  items.splice(idx, 1);
  write(items);
  if (it.photoId != null) {
    try { await deletePhoto(it.photoId); } catch {}
  }
}

export function stats() {
  const items = read();
  const total = items.reduce((n, it) => n + (Number(it.price) || 0), 0);
  const brands = new Set(items.map(it => it.brand));
  return {
    count: items.length,
    total,
    max: items.reduce((m, it) => Math.max(m, Number(it.price) || 0), 0),
    brandCount: brands.size,
  };
}

/** Gruppiert die Sammlung nach Marken inkl. Fortschritts-Statistik
 *  (wie viele der in CARS vorhandenen Modelle pro Marke schon gesammelt sind). */
export function byBrand() {
  const items = read();

  // Gesamtanzahl bekannter Modelle pro Marke aus CARS
  const totalPerBrand = new Map();
  for (const c of CARS) {
    const set = totalPerBrand.get(c.brand) || new Set();
    set.add(c.model);
    totalPerBrand.set(c.brand, set);
  }

  const groups = new Map();
  for (const it of items) {
    const key = it.brand || 'Unbekannt';
    if (!groups.has(key)) {
      groups.set(key, { brand: key, items: [], uniqueModels: new Set(), value: 0, max: 0 });
    }
    const g = groups.get(key);
    g.items.push(it);
    g.uniqueModels.add(String(it.model || '').toLowerCase());
    g.value += Number(it.price) || 0;
    g.max = Math.max(g.max, Number(it.price) || 0);
  }

  const out = Array.from(groups.values()).map(g => {
    const totalModels = (totalPerBrand.get(g.brand) || new Set()).size;
    const ownedModels = g.uniqueModels.size;
    return {
      brand: g.brand,
      items: g.items.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)),
      count: g.items.length,
      uniqueCount: ownedModels,
      totalModels,
      progress: totalModels > 0 ? Math.min(1, ownedModels / totalModels) : 0,
      value: g.value,
      max: g.max,
      complete: totalModels > 0 && ownedModels >= totalModels,
    };
  });

  // Sortierung: vollstaendige Marken zuerst, dann nach Anzahl, dann Wert
  out.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return b.value - a.value;
  });
  return out;
}
