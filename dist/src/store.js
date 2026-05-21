// Persistent storage: last group, custom cars (added manually), settings.
const KEY = 'meins.v4.store';

const defaults = () => ({
  lastGroup: null,           // { mode: 'single'|'multi', players: [{name, avatar?}] }
  customCars: [],            // user-added cars added via manual entry
  settings: { name: '', slotCount: 3, cooldownSec: 30 },
  savedGame: null,           // persistierter Single-Device-Spielstand
  groups: [],                // benannte gespeicherte Gruppen [{id,name,players:[{name,avatar}],createdAt}]
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
  if (!Array.isArray(cache.groups)) cache.groups = [];
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

  // Benannte Gruppen
  getGroups: () => read().groups.slice().sort((a, b) => (b.usedAt || b.createdAt || 0) - (a.usedAt || a.createdAt || 0)),
  saveGroup(name, players) {
    const s = read();
    const trimmed = String(name || '').trim().slice(0, 30);
    if (!trimmed || !Array.isArray(players) || players.length < 2) return null;
    const id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const grp = {
      id,
      name: trimmed,
      players: players.map(p => ({ name: String(p.name || '').slice(0, 20), avatar: p.avatar || null })),
      createdAt: Date.now(),
      usedAt: Date.now(),
    };
    // Replace if same name exists
    s.groups = s.groups.filter(g => g.name.toLowerCase() !== trimmed.toLowerCase());
    s.groups.unshift(grp);
    s.groups = s.groups.slice(0, 30);
    write();
    return grp;
  },
  touchGroup(id) {
    const s = read();
    const g = s.groups.find(g => g.id === id);
    if (g) { g.usedAt = Date.now(); write(); }
  },
  deleteGroup(id) {
    const s = read();
    s.groups = s.groups.filter(g => g.id !== id);
    write();
  },
};
