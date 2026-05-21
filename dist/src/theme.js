// Hell/Dunkel-Modus. Persistiert in localStorage 'meins.theme' = 'dark' | 'light' | 'system'.
const KEY = 'meins.theme';

function read() {
  try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; }
}
function write(v) { try { localStorage.setItem(KEY, v); } catch {} }

function effective(mode) {
  if (mode === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

export function applyTheme(mode = read()) {
  const eff = effective(mode);
  document.documentElement.setAttribute('data-theme', eff);
  // theme-color meta updaten
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', eff === 'light' ? '#fafafa' : '#05070b');
}

export const theme = {
  get: () => read(),
  getEffective: () => effective(read()),
  set(mode) { write(mode); applyTheme(mode); },
  toggle() {
    const cur = read();
    const next = effective(cur) === 'light' ? 'dark' : 'light';
    this.set(next);
    return next;
  },
};

// Bei System-Änderung anpassen, falls Modus 'system'
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
    if (read() === 'system') applyTheme('system');
  });
}
