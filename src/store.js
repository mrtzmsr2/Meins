// Persistent storage for stats + leaderboard via localStorage.
const KEY = 'mmeins.v3.store';

const defaults = () => ({
  stats: {
    games: 0,
    totalScore: 0,
    bestRound: 0,
    perfectGuesses: 0,
    totalGuesses: 0,
  },
  leaderboard: { classic: [], time: [], streak: [], duel: [] },
  settings: { difficulty: 'normal', name: '' },
});

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    cache = defaults();
  }
  // ensure shape
  cache.stats = { ...defaults().stats, ...cache.stats };
  cache.leaderboard = { ...defaults().leaderboard, ...cache.leaderboard };
  cache.settings = { ...defaults().settings, ...cache.settings };
  return cache;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
}

export const store = {
  get: () => read(),
  getStats: () => read().stats,
  getSettings: () => read().settings,
  getLeaderboard: (mode) => (read().leaderboard[mode] || []).slice().sort((a, b) => b.score - a.score),

  setSettings(patch) {
    const s = read();
    s.settings = { ...s.settings, ...patch };
    write();
  },

  recordGame({ mode, score, perfect = 0, guesses = 0, bestRound = 0 }) {
    const s = read();
    s.stats.games += 1;
    s.stats.totalScore += score;
    s.stats.perfectGuesses += perfect;
    s.stats.totalGuesses += guesses;
    if (bestRound > s.stats.bestRound) s.stats.bestRound = bestRound;

    const entry = { score, date: Date.now(), name: s.settings.name || 'Du' };
    const board = s.leaderboard[mode] || (s.leaderboard[mode] = []);
    board.push(entry);
    board.sort((a, b) => b.score - a.score);
    s.leaderboard[mode] = board.slice(0, 10);
    write();
    return { rank: s.leaderboard[mode].findIndex(e => e === entry) + 1 };
  },

  reset() {
    cache = defaults();
    write();
  },
};
