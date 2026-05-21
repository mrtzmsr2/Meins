// Persistent storage: last group, custom cars (added manually), settings.
const KEY = 'meins.v4.store';

const defaults = () => ({
  lastGroup: null,           // { mode: 'single'|'multi', players: [{name}] }
  customCars: [],            // user-added cars added via manual entry
  settings: { name: '', slotCount: 3, cooldownSec: 30 },
  savedGame: null,           // persistierter Single-Device-Spielstand
});

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch { cache = defaults(); }
  cache.settings = { ...defaults().settings, ...cache.settings };
  if (!Array.isArray(cache.customCars)) cache.customCars = [];
  return cache;
}
function write() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} }

export const store = {
  get: () => read(),
  getSettings: () => read().settings,
  setSettings(patch) { const s = read(); s.settings = { ...s.settings, ...patch }; write(); },

  getCustomCars: () => read().customCars.slice(),
  addCustomCar(car) {
    const s = read();
    // dedupe by brand+model+price
    const key = `${(car.brand || '').toLowerCase()}|${(car.model || '').toLowerCase()}`;
    s.customCars = s.customCars.filter(c => `${(c.brand || '').toLowerCase()}|${(c.model || '').toLowerCase()}` !== key);
    s.customCars.unshift({ ...car, custom: true, addedAt: Date.now() });
    s.customCars = s.customCars.slice(0, 200);
    write();
  },

  getLastGroup: () => read().lastGroup,
  setLastGroup(group) { const s = read(); s.lastGroup = group; write(); },
  clearLastGroup() { const s = read(); s.lastGroup = null; write(); },

  // Persistenter Spielstand (nur Single-Device)
  getSavedGame: () => read().savedGame,
  setSavedGame(game) {
    const s = read();
    s.savedGame = game ? { ...game, savedAt: Date.now() } : null;
    write();
  },
  clearSavedGame() { const s = read(); s.savedGame = null; write(); },
};
