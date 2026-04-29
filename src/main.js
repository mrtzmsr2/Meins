// MMEINS v3 main entry — wires up views, modes, modals.
import { CARS, TIERS_BY_DIFFICULTY } from './data/cars.js';
import { store } from './store.js';
import {
  fmtEUR, fmtNum, pickRandom, scoreGuess, ratingFor,
  logScale, logScaleInverse, clamp, relTime,
} from './util.js';
import { openMultiplayer } from './multiplayer-view.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const tpl = (id) => document.getElementById(id).content.cloneNode(true);
const app = $('#app');

// ---------- helpers ----------
function carPool(difficulty) {
  const tiers = new Set(TIERS_BY_DIFFICULTY[difficulty] || TIERS_BY_DIFFICULTY.normal);
  return CARS.filter(c => tiers.has(c.tier));
}

function renderCarCard(car) {
  const node = tpl('tpl-card');
  $('[data-name]', node).textContent = `${car.brand} ${car.model}`;
  $('[data-img]', node).textContent = car.emoji;
  const tags = $('[data-tags]', node);
  [
    car.year, car.category, `${fmtNum(car.hp)} PS`,
  ].forEach(t => {
    const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tags.appendChild(s);
  });
  return node.firstElementChild;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function openModal(title, bodyEl) {
  const root = $('#modal-root');
  root.hidden = false;
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<button class="icon-btn modal-close" aria-label="Schließen">✕</button><h2></h2>`;
  $('h2', modal).textContent = title;
  modal.appendChild(bodyEl);
  root.append(backdrop, modal);
  const close = () => { root.hidden = true; root.innerHTML = ''; };
  backdrop.addEventListener('click', close);
  $('.modal-close', modal).addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

// ---------- HOME ----------
function renderHome() {
  app.innerHTML = '';
  const node = tpl('tpl-home');
  app.appendChild(node);

  // Stats strip
  const stats = store.getStats();
  const strip = $('#home-stats');
  const accuracy = stats.totalGuesses ? Math.round((stats.perfectGuesses / stats.totalGuesses) * 100) : 0;
  const items = [
    { k: 'Spiele', v: fmtNum(stats.games) },
    { k: 'Gesamt-Punkte', v: fmtNum(stats.totalScore) },
    { k: 'Beste Runde', v: fmtNum(stats.bestRound) },
    { k: 'Volltreffer', v: `${accuracy}%` },
  ];
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'stat-pill';
    el.innerHTML = `<div class="v">${it.v}</div><div class="k">${it.k}</div>`;
    strip.appendChild(el);
  });

  // Difficulty
  const settings = store.getSettings();
  const seg = $('#difficulty-seg');
  $$('button', seg).forEach(b => {
    b.classList.toggle('active', b.dataset.diff === settings.difficulty);
    b.setAttribute('aria-selected', b.dataset.diff === settings.difficulty ? 'true' : 'false');
    b.addEventListener('click', () => {
      store.setSettings({ difficulty: b.dataset.diff });
      $$('button', seg).forEach(x => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      });
    });
  });

  // Mode cards
  $$('.mode-card', app).forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (mode === 'multi') openMultiplayer(app, renderHome);
      else startGame(mode);
    });
  });
}

// ---------- GAME ENGINE ----------
function startGame(mode) {
  const difficulty = store.getSettings().difficulty;
  const pool = carPool(difficulty);
  if (pool.length < 4) { toast('Datenbank zu klein'); return; }

  app.innerHTML = '';
  app.appendChild(tpl('tpl-game'));

  const state = {
    mode, difficulty, pool,
    used: new Set(),
    round: 0,
    maxRounds: mode === 'classic' ? 10 : Infinity,
    score: 0,
    streak: 0,
    misses: 0,
    bestRound: 0,
    perfect: 0,
    guesses: 0,
    history: [],
    timeLeft: mode === 'time' ? 60 : null,
    timerId: null,
  };

  $('#btn-quit').addEventListener('click', () => {
    if (confirm('Spiel abbrechen?')) endGame(state);
  });

  // HUD label per mode
  const extraLabel = $('#hud-extra-label');
  if (mode === 'time') extraLabel.textContent = 'Zeit';
  else if (mode === 'streak') extraLabel.textContent = 'Leben';
  else if (mode === 'duel') extraLabel.textContent = 'Streak';
  else extraLabel.textContent = 'Streak';

  if (mode === 'time') {
    state.timerId = setInterval(() => {
      state.timeLeft -= 1;
      $('#hud-extra-value').textContent = state.timeLeft;
      if (state.timeLeft <= 0) endGame(state);
    }, 1000);
  }

  nextRound(state);
}

function updateHud(state) {
  $('#hud-round').textContent = state.maxRounds === Infinity ? state.round : `${state.round}/${state.maxRounds}`;
  $('#hud-score').textContent = fmtNum(state.score);
  const v = $('#hud-extra-value');
  if (state.mode === 'time') v.textContent = state.timeLeft;
  else if (state.mode === 'streak') v.textContent = '❤️'.repeat(Math.max(0, 3 - state.misses));
  else v.textContent = state.streak;
}

function nextRound(state) {
  state.round += 1;
  if (state.round > state.maxRounds) return endGame(state);

  const stage = $('#game-stage');
  stage.innerHTML = '';
  updateHud(state);

  if (state.mode === 'duel') return renderDuelRound(state, stage);
  return renderGuessRound(state, stage);
}

// --- Guess round (classic / time / streak) ---
function renderGuessRound(state, stage) {
  const [car] = pickRandom(state.pool, 1, state.used);
  if (!car) return endGame(state);
  state.used.add(car.id);

  stage.appendChild(renderCarCard(car));

  // Guess block
  const block = document.createElement('div');
  block.className = 'guess-block';

  const minP = 10000, maxP = 150000000;
  const initial = 0.35;
  block.innerHTML = `
    <div class="guess-label">Was kostet dieses Auto (Neupreis / letzter bekannter Wert)?</div>
    <div class="guess-value" id="guess-val"></div>
    <input class="guess-slider" type="range" min="0" max="1000" value="${initial * 1000}" step="1" />
    <div class="guess-quick">
      <button data-step="-0.1">−10%</button>
      <button data-step="-0.01">−1%</button>
      <button data-step="0.01">+1%</button>
      <button data-step="0.1">+10%</button>
    </div>
    <button class="primary" id="btn-guess">Tippen</button>
  `;
  stage.appendChild(block);

  const slider = $('input', block);
  const valEl = $('#guess-val', block);
  const update = () => {
    const t = clamp(slider.value / 1000, 0, 1);
    const price = logScale(minP, maxP, t);
    valEl.textContent = fmtEUR(roundNice(price));
    valEl.dataset.value = String(roundNice(price));
  };
  slider.addEventListener('input', update);
  update();

  $$('.guess-quick button', block).forEach(b => {
    b.addEventListener('click', () => {
      const t = clamp(parseFloat(slider.value) / 1000 + parseFloat(b.dataset.step), 0, 1);
      slider.value = t * 1000;
      update();
    });
  });

  $('#btn-guess', block).addEventListener('click', () => {
    const guess = parseFloat(valEl.dataset.value);
    submitGuess(state, car, guess, stage);
  });
}

function roundNice(n) {
  if (n < 1000) return Math.round(n / 100) * 100;
  if (n < 10000) return Math.round(n / 500) * 500;
  if (n < 100000) return Math.round(n / 1000) * 1000;
  if (n < 1000000) return Math.round(n / 5000) * 5000;
  if (n < 10000000) return Math.round(n / 50000) * 50000;
  return Math.round(n / 500000) * 500000;
}

function submitGuess(state, car, guess, stage) {
  const points = scoreGuess(car.price, guess);
  state.score += points;
  state.guesses += 1;
  if (points >= 1100) state.perfect += 1;
  if (points > state.bestRound) state.bestRound = points;
  if (points >= 500) state.streak += 1; else state.streak = 0;

  const ratio = Math.abs(car.price - guess) / Math.max(car.price, 1);
  const isHit = ratio <= 0.25;
  if (state.mode === 'streak' && !isHit) state.misses += 1;

  state.history.push({ car, guess, points });

  // Reveal panel
  const reveal = document.createElement('div');
  reveal.className = 'reveal';
  const r = ratingFor(points);
  reveal.innerHTML = `
    <div class="points-pop">+${fmtNum(points)} ${r.emoji} <span style="-webkit-text-fill-color:initial;color:var(--text-dim);font-size:14px;font-weight:600;">${r.label}</span></div>
    <div class="reveal-row"><span class="k">Tatsächlich</span><span class="v">${fmtEUR(car.price)}</span></div>
    <div class="reveal-row"><span class="k">Dein Tipp</span><span class="v">${fmtEUR(guess)}</span></div>
    <div class="reveal-row"><span class="k">Differenz</span><span class="v">${(ratio * 100).toFixed(1)}%</span></div>
    <div class="reveal-bar">
      <div class="actual" style="left:0%;width:${barPct(car.price)}%"></div>
      <div class="your" style="left:0%;width:${barPct(guess)}%"></div>
    </div>
    <button class="primary" id="btn-next">${shouldEnd(state) ? 'Auswertung' : 'Weiter'}</button>
  `;
  stage.appendChild(reveal);
  updateHud(state);

  $('#btn-next', reveal).addEventListener('click', () => {
    if (shouldEnd(state)) endGame(state);
    else nextRound(state);
  });
}

function barPct(price) {
  const t = logScaleInverse(10000, 150000000, price);
  return clamp(t * 100, 1, 100);
}

function shouldEnd(state) {
  if (state.mode === 'classic') return state.round >= state.maxRounds;
  if (state.mode === 'streak') return state.misses >= 3;
  if (state.mode === 'time') return state.timeLeft <= 0;
  return false;
}

// --- Duel round ---
function renderDuelRound(state, stage) {
  const [a, b] = pickRandom(state.pool, 2, state.used);
  if (!a || !b) return endGame(state);
  // Don't add to used so we keep variety; only avoid the very last pair
  const grid = document.createElement('div');
  grid.className = 'duel-grid';
  const cardA = renderCarCard(a);
  const cardB = renderCarCard(b);
  const vs = document.createElement('div');
  vs.className = 'duel-vs'; vs.textContent = 'VS';
  grid.append(cardA, vs, cardB);
  stage.appendChild(grid);

  const handle = (chosen, other, chosenEl, otherEl) => {
    const correct = chosen.price >= other.price;
    chosenEl.classList.add(correct ? 'correct' : 'wrong');
    otherEl.classList.add(correct ? 'wrong' : 'correct');
    const points = correct ? 500 + state.streak * 100 : 0;
    state.score += points;
    state.guesses += 1;
    if (correct) { state.streak += 1; if (points > state.bestRound) state.bestRound = points; }
    else { state.streak = 0; state.misses += 1; }
    state.history.push({ car: chosen, guess: chosen.price, points, dueled: other });

    const reveal = document.createElement('div');
    reveal.className = 'reveal';
    reveal.innerHTML = `
      <div class="points-pop">${correct ? '✓ +' + fmtNum(points) : '✗ Daneben'}</div>
      <div class="reveal-row"><span class="k">${a.brand} ${a.model}</span><span class="v">${fmtEUR(a.price)}</span></div>
      <div class="reveal-row"><span class="k">${b.brand} ${b.model}</span><span class="v">${fmtEUR(b.price)}</span></div>
      <button class="primary" id="btn-next">${state.misses >= 3 && state.mode === 'streak' ? 'Auswertung' : 'Weiter'}</button>
    `;
    stage.appendChild(reveal);
    updateHud(state);
    $('#btn-next', reveal).addEventListener('click', () => {
      if (state.mode === 'duel' && state.misses >= 3) return endGame(state);
      nextRound(state);
    });
  };

  cardA.addEventListener('click', () => handle(a, b, cardA, cardB));
  cardB.addEventListener('click', () => handle(b, a, cardB, cardA));

  // Duel mode default: 3 lives
  if (state.maxRounds === Infinity && state.mode === 'duel') {
    $('#hud-extra-label').textContent = 'Leben';
    $('#hud-extra-value').textContent = '❤️'.repeat(Math.max(0, 3 - state.misses));
  }
}

// ---------- END / SUMMARY ----------
function endGame(state) {
  if (state.timerId) clearInterval(state.timerId);

  const result = store.recordGame({
    mode: state.mode,
    score: state.score,
    perfect: state.perfect,
    guesses: state.guesses,
    bestRound: state.bestRound,
  });

  app.innerHTML = '';
  app.appendChild(tpl('tpl-summary'));
  $('#summary-score').textContent = fmtNum(state.score);
  const subParts = [];
  if (result.rank > 0 && result.rank <= 10) subParts.push(`🏆 Platz ${result.rank} in der Bestenliste`);
  subParts.push(`${state.guesses} Tipps · ${state.perfect} Volltreffer`);
  $('#summary-sub').textContent = subParts.join(' · ');

  const list = $('#summary-list');
  state.history.forEach(({ car, guess, points }) => {
    const r = ratingFor(points);
    const row = document.createElement('div');
    row.className = `summary-item ${r.cls}`;
    const delta = car.price ? `${(((guess - car.price) / car.price) * 100).toFixed(0)}%` : '–';
    row.innerHTML = `
      <div><strong>${car.brand} ${car.model}</strong><br><span style="color:var(--text-dim);font-size:12px;">${fmtEUR(car.price)}</span></div>
      <div class="delta">${delta}</div>
      <div class="pts">+${fmtNum(points)}</div>
    `;
    list.appendChild(row);
  });

  $('#btn-replay').addEventListener('click', () => startGame(state.mode));
  $('#btn-home').addEventListener('click', renderHome);
}

// ---------- NAV: Stats / Leaderboard / Settings ----------
function showStats() {
  const s = store.getStats();
  const acc = s.totalGuesses ? Math.round((s.perfectGuesses / s.totalGuesses) * 100) : 0;
  const wrap = document.createElement('div');
  wrap.className = 'stats-strip';
  wrap.style.gridTemplateColumns = '1fr 1fr';
  [
    ['Spiele gespielt', fmtNum(s.games)],
    ['Punkte gesamt', fmtNum(s.totalScore)],
    ['Beste Runde', fmtNum(s.bestRound)],
    ['Tipps gesamt', fmtNum(s.totalGuesses)],
    ['Volltreffer', fmtNum(s.perfectGuesses)],
    ['Trefferquote', `${acc}%`],
  ].forEach(([k, v]) => {
    const el = document.createElement('div');
    el.className = 'stat-pill';
    el.innerHTML = `<div class="v">${v}</div><div class="k">${k}</div>`;
    wrap.appendChild(el);
  });
  openModal('Statistiken', wrap);
}

function showLeaderboard() {
  const wrap = document.createElement('div');
  const modes = [
    ['classic', '🏁 Klassisch'],
    ['time', '⏱️ Zeitrennen'],
    ['streak', '🔥 Streak'],
    ['duel', '⚔️ Duell'],
  ];
  modes.forEach(([key, label]) => {
    const h = document.createElement('h3'); h.textContent = label; h.style.margin = '14px 0 8px';
    wrap.appendChild(h);
    const list = store.getLeaderboard(key);
    if (!list.length) {
      const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Noch keine Einträge.';
      wrap.appendChild(e); return;
    }
    const ul = document.createElement('div'); ul.className = 'lb-list';
    list.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `
        <div class="rank">#${i + 1}</div>
        <div>${escapeHtml(entry.name || 'Du')}</div>
        <div class="pts">${fmtNum(entry.score)}</div>
        <div style="color:var(--text-dim);font-size:12px;">${relTime(entry.date)}</div>
      `;
      ul.appendChild(row);
    });
    wrap.appendChild(ul);
  });
  openModal('Bestenliste', wrap);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function showSettings() {
  const s = store.getSettings();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <label style="display:flex;flex-direction:column;gap:6px;">
        <span style="color:var(--text-dim);font-size:13px;">Dein Name</span>
        <input id="set-name" type="text" maxlength="20" value="${escapeHtml(s.name || '')}" placeholder="z. B. Moritz" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:10px;font:inherit;" />
      </label>
      <div>
        <div style="color:var(--text-dim);font-size:13px;margin-bottom:6px;">Datenbank</div>
        <div style="font-size:14px;">${CARS.length} Autos · von ${fmtEUR(Math.min(...CARS.map(c=>c.price)))} bis ${fmtEUR(Math.max(...CARS.map(c=>c.price)))}</div>
      </div>
      <button class="secondary" id="set-reset" style="margin-top:6px;">Alle Daten zurücksetzen</button>
    </div>
  `;
  openModal('Einstellungen', wrap);
  $('#set-name', wrap).addEventListener('change', (e) => {
    store.setSettings({ name: e.target.value.trim() });
    toast('Gespeichert');
  });
  $('#set-reset', wrap).addEventListener('click', () => {
    if (confirm('Alle Statistiken & Bestenlisten löschen?')) {
      store.reset();
      toast('Zurückgesetzt');
      $('#modal-root').hidden = true; $('#modal-root').innerHTML = '';
      renderHome();
    }
  });
}

$('#nav-stats').addEventListener('click', showStats);
$('#nav-leaderboard').addEventListener('click', showLeaderboard);
$('#nav-settings').addEventListener('click', showSettings);
$('#db-badge').textContent = `v3.0 · ${CARS.length} Autos`;

// Auto-join multiplayer when opened via shared link (?room=XXXX)
const _roomParam = new URLSearchParams(location.search).get('room');
if (_roomParam) {
  openMultiplayer(app, renderHome);
} else {
  renderHome();
}
