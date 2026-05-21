// Kleine Sound-Engine ohne externe Assets (Web Audio API).
// Generiert Toene programmgesteuert. Erzeugt erst beim ersten User-Click
// einen AudioContext (wegen Browser-Autoplay-Policy).

let ctx = null;
let muted = false;

function ensureCtx() {
  if (muted) return null;
  if (ctx) return ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  } catch { ctx = null; }
  return ctx;
}

function tone({ freq = 440, duration = 0.18, type = 'sine', vol = 0.18, attack = 0.005, release = 0.05, slideTo = null }) {
  const ac = ensureCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + release + 0.05);
}

function chord(freqs, opts = {}) {
  freqs.forEach((f, i) => setTimeout(() => tone({ freq: f, ...opts }), i * (opts.spread || 25)));
}

export const sounds = {
  isMuted() { return muted; },
  setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('meins.muted', muted ? '1' : '0'); } catch {}
  },
  load() {
    try { muted = localStorage.getItem('meins.muted') === '1'; } catch {}
  },

  // Auto erfolgreich eingetragen — froehliche Fanfare
  claim() {
    chord([660, 880, 1320], { duration: 0.16, type: 'triangle', vol: 0.2, spread: 40 });
  },
  // Teures Auto (>500.000) — Kassen-Klingel
  jackpot() {
    [880, 1175, 1480, 1760].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.12, type: 'sine', vol: 0.22 }), i * 70));
  },
  // Auto geloescht
  remove() {
    tone({ freq: 280, duration: 0.18, type: 'sawtooth', vol: 0.18, slideTo: 140 });
  },
  // Cooldown-Block / Fehler
  blocked() {
    tone({ freq: 200, duration: 0.10, type: 'square', vol: 0.15 });
    setTimeout(() => tone({ freq: 160, duration: 0.10, type: 'square', vol: 0.15 }), 80);
  },
  // Spielende Gewinner-Fanfare
  win() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ freq: f, duration: 0.22, type: 'triangle', vol: 0.22 }), i * 130));
  },
  // dezenter UI-Tap
  tap() {
    tone({ freq: 740, duration: 0.05, type: 'sine', vol: 0.08 });
  },
};

// Haptik (Vibrations-API) — nur Mobile.
export const haptic = {
  light() { try { navigator.vibrate?.(15); } catch {} },
  medium() { try { navigator.vibrate?.(30); } catch {} },
  success() { try { navigator.vibrate?.([20, 40, 20]); } catch {} },
  error() { try { navigator.vibrate?.([60, 40, 60]); } catch {} },
};
