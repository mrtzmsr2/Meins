// Multiplayer view & game engine for MMEINS v3.
// Host runs the authoritative state and broadcasts; peers send their actions.
import { CARS, TIERS_BY_DIFFICULTY } from './data/cars.js';
import { store } from './store.js';
import {
  fmtEUR, fmtNum, pickRandom, scoreGuess, ratingFor,
  logScale, logScaleInverse, clamp,
} from './util.js';
import { createHost, joinHost, makeRoomCode } from './multiplayer.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const tpl = (id) => document.getElementById(id).content.cloneNode(true);

let session = null; // { isHost, host?, peer?, state, rerender, app }

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// =========================================================================
// PUBLIC: open the multiplayer entry view
// =========================================================================
export function openMultiplayer(app, onExit) {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-mp-lobby'));
  $('#mp-back').addEventListener('click', onExit);
  $('#mp-create').addEventListener('click', () => createRoomFlow(app, onExit));
  $('#mp-join').addEventListener('click', () => joinRoomFlow(app, onExit));
}

// =========================================================================
// CREATE ROOM (host)
// =========================================================================
async function createRoomFlow(app, onExit) {
  const name = (store.getSettings().name || prompt('Dein Name?', 'Rundenmeister') || 'Host').slice(0, 20);
  store.setSettings({ name });

  const code = makeRoomCode();
  app.innerHTML = '';
  const root = tpl('tpl-mp-room');
  app.appendChild(root);
  $('#mp-code').textContent = code;
  const stage = $('#mp-stage');
  stage.innerHTML = `<div class="mp-status">Verbinde mit Signaling-Server…</div>`;

  let host;
  try {
    host = await createHost(code, {
      onPeerJoin: (peerId) => { renderLobby(); host.broadcast({ type: 'state', state: pubLobbyState() }); },
      onPeerLeave: (peerId) => {
        if (session?.state) {
          delete session.state.players[peerId];
          delete session.state.guesses?.[peerId];
        }
        renderLobby();
        host.broadcast({ type: 'state', state: pubLobbyState() });
      },
      onMessage: (peerId, msg) => handleHostMessage(peerId, msg),
      onError: (err) => console.warn('host error', err),
    });
  } catch (e) {
    stage.innerHTML = `<div class="mp-status" style="color:var(--bad);">${escapeHtml(e.message || 'Verbindung fehlgeschlagen')}</div>`;
    return;
  }

  session = {
    isHost: true,
    host,
    app,
    onExit,
    state: {
      mode: 'classic',
      phase: 'lobby', // 'lobby' | 'guess' | 'reveal' | 'duel' | 'duel-reveal' | 'final'
      round: 0,
      maxRounds: 10,
      players: {
        [host.peer.id]: { id: host.peer.id, name, score: 0, isHost: true },
      },
      guesses: {},     // peerId -> guess number / duel side
      car: null,
      duelPair: null,
      history: [],     // host-only: array of { car, results: [{playerId,name,guess,points}] }
    },
  };

  $('#mp-leave').addEventListener('click', () => leaveSession());
  $('#mp-share').addEventListener('click', () => copyShare(code));

  // Mode selector (host only)
  $$('#mp-mode-seg button').forEach(b => {
    b.addEventListener('click', () => {
      $$('#mp-mode-seg button').forEach(x => x.classList.toggle('active', x === b));
      session.state.mode = b.dataset.mpMode;
    });
  });
  $('#mp-start').addEventListener('click', () => hostStartGame());

  renderLobby();
}

function copyShare(code) {
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const text = `MMEINS! Multiplayer – Raum-Code: ${code}\n${url}`;
  if (navigator.share) {
    navigator.share({ title: 'MMEINS!', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Code kopiert')).catch(() => toast(code));
  } else {
    toast(`Code: ${code}`);
  }
}

// =========================================================================
// JOIN ROOM (peer)
// =========================================================================
async function joinRoomFlow(app, onExit) {
  const initial = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
  app.innerHTML = '';
  const root = tpl('tpl-mp-room');
  app.appendChild(root);
  $('#mp-code').textContent = initial || '____';
  $('#mp-host-controls').hidden = true;

  const stage = $('#mp-stage');
  stage.innerHTML = `
    <div class="mp-status">Gib den 4-stelligen Raum-Code ein:</div>
    <input class="mp-input" id="mp-code-input" maxlength="4" placeholder="ABCD" value="${escapeHtml(initial)}" autocomplete="off" />
    <button class="primary" id="mp-join-go">Beitreten</button>
  `;
  $('#mp-leave').addEventListener('click', onExit);
  const input = $('#mp-code-input');
  input.focus();
  input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#mp-join-go').addEventListener('click', () => connectAsPeer(input.value, app, onExit));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectAsPeer(input.value, app, onExit); });
}

async function connectAsPeer(code, app, onExit) {
  if (!code || code.length < 4) { toast('Code unvollständig'); return; }
  const name = (store.getSettings().name || prompt('Dein Name?', '') || 'Spieler').slice(0, 20) || 'Spieler';
  store.setSettings({ name });

  const stage = $('#mp-stage');
  stage.innerHTML = `<div class="mp-status">Verbinde mit Raum ${escapeHtml(code)}…</div>`;
  let peer;
  try {
    peer = await joinHost(code, {
      name,
      onMessage: (msg) => handlePeerMessage(msg),
      onClose: () => { toast('Verbindung beendet.'); leaveSession(); },
      onError: (err) => console.warn('peer error', err),
    });
  } catch (e) {
    stage.innerHTML = `
      <div class="mp-status" style="color:var(--bad);">${escapeHtml(e.message || 'Verbindung fehlgeschlagen')}</div>
      <button class="secondary" id="mp-retry">Zurück</button>
    `;
    $('#mp-retry').addEventListener('click', () => joinRoomFlow(app, onExit));
    return;
  }

  $('#mp-code').textContent = code.toUpperCase();
  $('#mp-leave').addEventListener('click', () => leaveSession());

  session = {
    isHost: false,
    peer,
    app,
    onExit,
    state: { mode: 'classic', phase: 'lobby', players: {}, round: 0, maxRounds: 10, car: null, duelPair: null },
    myId: peer.peer.id,
    myName: name,
  };
  renderForPeer();
}

// =========================================================================
// HOST: handle incoming messages from peers
// =========================================================================
function handleHostMessage(peerId, msg) {
  if (!session?.isHost) return;
  const s = session.state;

  switch (msg.type) {
    case 'name': {
      if (!s.players[peerId]) s.players[peerId] = { id: peerId, name: msg.name, score: 0, isHost: false };
      else s.players[peerId].name = msg.name;
      renderLobby();
      session.host.broadcast({ type: 'state', state: pubLobbyState() });
      break;
    }
    case 'guess': {
      if (s.phase !== 'guess') return;
      s.guesses[peerId] = Number(msg.value);
      renderHostRound();
      session.host.broadcast({ type: 'progress', submitted: Object.keys(s.guesses) });
      maybeAutoReveal();
      break;
    }
    case 'duelPick': {
      if (s.phase !== 'duel') return;
      s.guesses[peerId] = msg.side; // 'a' | 'b'
      renderHostRound();
      session.host.broadcast({ type: 'progress', submitted: Object.keys(s.guesses) });
      maybeAutoReveal();
      break;
    }
  }
}

function maybeAutoReveal() {
  const s = session.state;
  const submittedCount = Object.keys(s.guesses).length;
  // include host if the host also guessed via UI
  const expected = Object.keys(s.players).length;
  if (submittedCount >= expected) hostRevealRound();
}

// =========================================================================
// HOST: game flow
// =========================================================================
function hostStartGame() {
  const s = session.state;
  s.round = 0;
  s.history = [];
  // reset scores
  for (const p of Object.values(s.players)) p.score = 0;
  hostNextRound();
}

function hostNextRound() {
  const s = session.state;
  s.round += 1;
  s.guesses = {};

  if (s.round > s.maxRounds) return hostShowFinal();

  const usedIds = new Set(s.history.map(h => h.car?.id).filter(Boolean));
  const pool = CARS.filter(c => TIERS_BY_DIFFICULTY[store.getSettings().difficulty || 'normal'].includes(c.tier));

  if (s.mode === 'classic') {
    const [car] = pickRandom(pool, 1, usedIds);
    s.car = car;
    s.duelPair = null;
    s.phase = 'guess';
  } else {
    // duel
    const [a, b] = pickRandom(pool, 2, usedIds);
    s.car = null;
    s.duelPair = { a, b };
    s.phase = 'duel';
  }

  session.host.broadcast({ type: 'state', state: pubGameState() });
  renderHostRound();
}

function hostRevealRound() {
  const s = session.state;
  const results = [];

  if (s.mode === 'classic') {
    const actual = s.car.price;
    for (const p of Object.values(s.players)) {
      const g = s.guesses[p.id];
      const points = (g != null) ? scoreGuess(actual, g) : 0;
      p.score += points;
      results.push({ playerId: p.id, name: p.name, guess: g ?? null, points });
    }
    s.history.push({ car: s.car, results });
    s.phase = 'reveal';
  } else {
    const { a, b } = s.duelPair;
    const correctSide = a.price >= b.price ? 'a' : 'b';
    for (const p of Object.values(s.players)) {
      const pick = s.guesses[p.id];
      const correct = pick === correctSide;
      const points = correct ? 500 : 0;
      p.score += points;
      results.push({ playerId: p.id, name: p.name, guess: pick ?? null, points, correct });
    }
    s.history.push({ duelPair: s.duelPair, correctSide, results });
    s.phase = 'duel-reveal';
  }

  session.host.broadcast({ type: 'state', state: pubGameState() });
  renderHostRound();
}

function hostShowFinal() {
  const s = session.state;
  s.phase = 'final';
  session.host.broadcast({ type: 'state', state: pubGameState() });
  renderHostRound();
}

// =========================================================================
// HOST: build a public state snapshot to broadcast
// =========================================================================
function pubLobbyState() {
  const s = session.state;
  return {
    phase: 'lobby',
    mode: s.mode,
    maxRounds: s.maxRounds,
    players: Object.values(s.players).map(p => ({ id: p.id, name: p.name, score: p.score, isHost: !!p.isHost })),
  };
}
function pubGameState() {
  const s = session.state;
  const base = pubLobbyState();
  base.phase = s.phase;
  base.round = s.round;
  base.car = s.car ? sanitizeCar(s.car, s.phase !== 'guess') : null;
  base.duelPair = s.duelPair ? {
    a: sanitizeCar(s.duelPair.a, s.phase !== 'duel'),
    b: sanitizeCar(s.duelPair.b, s.phase !== 'duel'),
  } : null;
  base.submitted = Object.keys(s.guesses);
  if (s.phase === 'reveal' || s.phase === 'duel-reveal' || s.phase === 'final') {
    base.lastResults = s.history[s.history.length - 1] || null;
  }
  return base;
}
function sanitizeCar(car, includePrice) {
  // Hide price during the guess phase
  const out = { id: car.id, brand: car.brand, model: car.model, year: car.year, hp: car.hp, category: car.category, emoji: car.emoji };
  if (includePrice) out.price = car.price;
  return out;
}

// =========================================================================
// PEER: handle incoming state from host
// =========================================================================
function handlePeerMessage(msg) {
  if (!session || session.isHost) return;
  if (msg.type === 'state') {
    Object.assign(session.state, msg.state);
    renderForPeer();
  } else if (msg.type === 'progress') {
    session.state.submitted = msg.submitted;
    renderForPeer();
  }
}

// =========================================================================
// HOST UI
// =========================================================================
function renderLobby() {
  if (!session?.isHost) return;
  $('#mp-host-controls').hidden = false;
  const role = $('#mp-role'); role.className = 'mp-role host'; role.textContent = '👑 Du bist Rundenmeister';
  renderPlayerList();
  $('#mp-stage').innerHTML = `<div class="mp-status">Warte auf Mitspieler. Teile den Code <strong>${escapeHtml(session.host.roomCode)}</strong>.</div>`;
}

function renderPlayerList() {
  const list = $('#mp-players');
  list.innerHTML = '';
  const s = session.state;
  const players = session.isHost
    ? Object.values(s.players)
    : (s.players || []);
  if (!players.length) { list.innerHTML = '<div class="empty">Noch keine Mitspieler.</div>'; return; }

  const submitted = new Set(
    session.isHost ? Object.keys(s.guesses || {}) : (s.submitted || [])
  );

  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'mp-player';
    if (submitted.has(p.id)) row.classList.add('ready');
    if (!session.isHost && p.id === session.myId) row.classList.add('you');
    if (session.isHost && p.id === session.host.peer.id) row.classList.add('you');
    row.innerHTML = `
      <div class="dot"></div>
      <div>${escapeHtml(p.name)}</div>
      <div class="role-tag ${p.isHost ? 'host' : ''}">${p.isHost ? '👑 Master' : 'Spieler'}</div>
      <div class="pts">${fmtNum(p.score || 0)}</div>
    `;
    list.appendChild(row);
  });
}

function renderHostRound() {
  if (!session?.isHost) return;
  const s = session.state;
  $('#mp-host-controls').hidden = s.phase !== 'lobby';
  renderPlayerList();
  const stage = $('#mp-stage');

  if (s.phase === 'guess') {
    stage.innerHTML = '';
    stage.appendChild(carCardEl(s.car));
    stage.appendChild(submittedChips(s));
    // Host's own guess input
    stage.appendChild(buildGuessInput((value) => {
      s.guesses[session.host.peer.id] = value;
      renderHostRound();
      session.host.broadcast({ type: 'progress', submitted: Object.keys(s.guesses) });
      maybeAutoReveal();
    }, s.guesses[session.host.peer.id] != null));
    const reveal = document.createElement('button');
    reveal.className = 'secondary';
    reveal.textContent = `Sofort aufdecken (${Object.keys(s.guesses).length}/${Object.keys(s.players).length})`;
    reveal.addEventListener('click', () => hostRevealRound());
    stage.appendChild(reveal);
    return;
  }
  if (s.phase === 'duel') {
    stage.innerHTML = '';
    const head = document.createElement('div'); head.className = 'mp-status'; head.textContent = 'Welches Auto ist teurer?';
    stage.appendChild(head);
    stage.appendChild(duelGrid(s.duelPair, (side) => {
      s.guesses[session.host.peer.id] = side;
      renderHostRound();
      session.host.broadcast({ type: 'progress', submitted: Object.keys(s.guesses) });
      maybeAutoReveal();
    }, s.guesses[session.host.peer.id]));
    stage.appendChild(submittedChips(s));
    const reveal = document.createElement('button');
    reveal.className = 'secondary';
    reveal.textContent = `Sofort aufdecken (${Object.keys(s.guesses).length}/${Object.keys(s.players).length})`;
    reveal.addEventListener('click', () => hostRevealRound());
    stage.appendChild(reveal);
    return;
  }
  if (s.phase === 'reveal' || s.phase === 'duel-reveal') {
    stage.innerHTML = '';
    stage.appendChild(buildRevealEl(s));
    const next = document.createElement('button'); next.className = 'primary';
    next.textContent = s.round >= s.maxRounds ? 'Endstand' : 'Nächste Runde';
    next.addEventListener('click', () => s.round >= s.maxRounds ? hostShowFinal() : hostNextRound());
    stage.appendChild(next);
    return;
  }
  if (s.phase === 'final') {
    stage.innerHTML = '';
    stage.appendChild(buildFinalEl(s));
    const again = document.createElement('button'); again.className = 'primary'; again.textContent = 'Nochmal spielen';
    again.addEventListener('click', () => { session.state.phase = 'lobby'; renderLobby(); session.host.broadcast({ type: 'state', state: pubLobbyState() }); });
    stage.appendChild(again);
    return;
  }
}

// =========================================================================
// PEER UI
// =========================================================================
function renderForPeer() {
  if (!session || session.isHost) return;
  const s = session.state;

  // Role pill
  const role = $('#mp-role');
  if (role) { role.className = 'mp-role'; role.textContent = '🎮 Spieler'; }
  $('#mp-host-controls').hidden = true;
  renderPlayerList();
  const stage = $('#mp-stage');

  if (s.phase === 'lobby') {
    stage.innerHTML = `<div class="mp-status">Warte auf Start durch den Rundenmeister…</div>`;
    return;
  }
  if (s.phase === 'guess' && s.car) {
    stage.innerHTML = '';
    stage.appendChild(carCardEl(s.car));
    const already = (s.submitted || []).includes(session.myId);
    if (already) {
      const note = document.createElement('div'); note.className = 'mp-status'; note.textContent = 'Tipp abgegeben. Warte auf andere Spieler…';
      stage.appendChild(note);
    } else {
      stage.appendChild(buildGuessInput((value) => {
        session.peer.send({ type: 'guess', value });
        // optimistic
        s.submitted = [...(s.submitted || []), session.myId];
        renderForPeer();
      }, false));
    }
    stage.appendChild(submittedChipsForPeer(s));
    return;
  }
  if (s.phase === 'duel' && s.duelPair) {
    stage.innerHTML = '';
    const head = document.createElement('div'); head.className = 'mp-status'; head.textContent = 'Welches Auto ist teurer?';
    stage.appendChild(head);
    const already = (s.submitted || []).includes(session.myId);
    stage.appendChild(duelGrid(s.duelPair, (side) => {
      if (already) return;
      session.peer.send({ type: 'duelPick', side });
      s.submitted = [...(s.submitted || []), session.myId];
      renderForPeer();
    }, null, already));
    if (already) {
      const n = document.createElement('div'); n.className = 'mp-status'; n.textContent = 'Wahl getroffen. Warte auf andere…';
      stage.appendChild(n);
    }
    stage.appendChild(submittedChipsForPeer(s));
    return;
  }
  if (s.phase === 'reveal' || s.phase === 'duel-reveal') {
    stage.innerHTML = '';
    stage.appendChild(buildRevealEl(s));
    const note = document.createElement('div'); note.className = 'mp-status'; note.textContent = 'Warte auf den Rundenmeister…';
    stage.appendChild(note);
    return;
  }
  if (s.phase === 'final') {
    stage.innerHTML = '';
    stage.appendChild(buildFinalEl(s));
    const note = document.createElement('div'); note.className = 'mp-status'; note.textContent = 'Spiel beendet.';
    stage.appendChild(note);
    return;
  }
}

// =========================================================================
// Reusable UI bits
// =========================================================================
function carCardEl(car) {
  const node = tpl('tpl-card');
  $('[data-name]', node).textContent = `${car.brand} ${car.model}`;
  $('[data-img]', node).textContent = car.emoji || '🚗';
  const tags = $('[data-tags]', node);
  [car.year, car.category, `${fmtNum(car.hp)} PS`].forEach(t => {
    const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tags.appendChild(s);
  });
  return node.firstElementChild;
}

function buildGuessInput(onSubmit, alreadySubmitted) {
  const block = document.createElement('div');
  block.className = 'guess-block';
  const minP = 10000, maxP = 150000000;
  const initial = 0.35;
  block.innerHTML = `
    <div class="guess-label">Was kostet dieses Auto?</div>
    <div class="guess-value" id="guess-val"></div>
    <input class="guess-slider" type="range" min="0" max="1000" value="${initial * 1000}" step="1" />
    <div class="guess-quick">
      <button data-step="-0.1">−10%</button>
      <button data-step="-0.01">−1%</button>
      <button data-step="0.01">+1%</button>
      <button data-step="0.1">+10%</button>
    </div>
    <button class="primary" id="btn-guess">${alreadySubmitted ? 'Schon getippt' : 'Tipp abgeben'}</button>
  `;
  const slider = $('input', block);
  const valEl = $('#guess-val', block);
  const update = () => {
    const t = clamp(slider.value / 1000, 0, 1);
    const price = roundNice(logScale(minP, maxP, t));
    valEl.textContent = fmtEUR(price);
    valEl.dataset.value = String(price);
  };
  slider.addEventListener('input', update);
  $$('.guess-quick button', block).forEach(b => {
    b.addEventListener('click', () => {
      const t = clamp(parseFloat(slider.value) / 1000 + parseFloat(b.dataset.step), 0, 1);
      slider.value = t * 1000; update();
    });
  });
  $('#btn-guess', block).addEventListener('click', () => {
    if (alreadySubmitted) return;
    const v = parseFloat(valEl.dataset.value);
    onSubmit(v);
  });
  if (alreadySubmitted) $('#btn-guess', block).disabled = true;
  update();
  return block;
}

function roundNice(n) {
  if (n < 1000) return Math.round(n / 100) * 100;
  if (n < 10000) return Math.round(n / 500) * 500;
  if (n < 100000) return Math.round(n / 1000) * 1000;
  if (n < 1000000) return Math.round(n / 5000) * 5000;
  if (n < 10000000) return Math.round(n / 50000) * 50000;
  return Math.round(n / 500000) * 500000;
}

function duelGrid(pair, onPick, mySide, locked) {
  const grid = document.createElement('div'); grid.className = 'duel-grid';
  const a = carCardEl(pair.a); const b = carCardEl(pair.b);
  const vs = document.createElement('div'); vs.className = 'duel-vs'; vs.textContent = 'VS';
  if (mySide === 'a') a.classList.add('correct');
  if (mySide === 'b') b.classList.add('correct');
  if (!locked) {
    a.addEventListener('click', () => onPick('a'));
    b.addEventListener('click', () => onPick('b'));
  } else {
    a.style.cursor = 'default'; b.style.cursor = 'default';
  }
  grid.append(a, vs, b);
  return grid;
}

function submittedChips(s) {
  const wrap = document.createElement('div'); wrap.className = 'mp-submitted-list';
  Object.values(s.players).forEach(p => {
    const c = document.createElement('span');
    c.className = 'chip' + (s.guesses[p.id] != null ? ' done' : '');
    c.textContent = `${s.guesses[p.id] != null ? '✓' : '…'} ${p.name}`;
    wrap.appendChild(c);
  });
  return wrap;
}

function submittedChipsForPeer(s) {
  const wrap = document.createElement('div'); wrap.className = 'mp-submitted-list';
  const submitted = new Set(s.submitted || []);
  (s.players || []).forEach(p => {
    const c = document.createElement('span');
    c.className = 'chip' + (submitted.has(p.id) ? ' done' : '');
    c.textContent = `${submitted.has(p.id) ? '✓' : '…'} ${p.name}`;
    wrap.appendChild(c);
  });
  return wrap;
}

function buildRevealEl(s) {
  const wrap = document.createElement('div'); wrap.className = 'reveal';
  const last = s.lastResults || s.history?.[s.history.length - 1];
  if (!last) { wrap.textContent = '…'; return wrap; }

  if (last.car) {
    wrap.innerHTML = `
      <div class="points-pop">${escapeHtml(last.car.brand)} ${escapeHtml(last.car.model)}</div>
      <div class="reveal-row"><span class="k">Tatsächlich</span><span class="v">${fmtEUR(last.car.price)}</span></div>
    `;
    const sorted = [...last.results].sort((a, b) => (b.points || 0) - (a.points || 0));
    sorted.forEach(r => {
      const r2 = ratingFor(r.points || 0);
      const row = document.createElement('div'); row.className = 'reveal-row';
      row.innerHTML = `<span class="k">${r2.emoji} ${escapeHtml(r.name)} <span style="color:var(--text-dim);">${r.guess != null ? fmtEUR(r.guess) : '—'}</span></span><span class="v">+${fmtNum(r.points || 0)}</span>`;
      wrap.appendChild(row);
    });
  } else if (last.duelPair) {
    const winner = last.correctSide === 'a' ? last.duelPair.a : last.duelPair.b;
    wrap.innerHTML = `
      <div class="points-pop">${escapeHtml(winner.brand)} ${escapeHtml(winner.model)} ist teurer</div>
      <div class="reveal-row"><span class="k">${escapeHtml(last.duelPair.a.brand)} ${escapeHtml(last.duelPair.a.model)}</span><span class="v">${fmtEUR(last.duelPair.a.price)}</span></div>
      <div class="reveal-row"><span class="k">${escapeHtml(last.duelPair.b.brand)} ${escapeHtml(last.duelPair.b.model)}</span><span class="v">${fmtEUR(last.duelPair.b.price)}</span></div>
    `;
    last.results.forEach(r => {
      const row = document.createElement('div'); row.className = 'reveal-row';
      row.innerHTML = `<span class="k">${r.correct ? '✓' : '✗'} ${escapeHtml(r.name)}</span><span class="v">+${fmtNum(r.points || 0)}</span>`;
      wrap.appendChild(row);
    });
  }
  return wrap;
}

function buildFinalEl(s) {
  const wrap = document.createElement('div'); wrap.className = 'reveal';
  wrap.innerHTML = `<div class="points-pop">🏆 Endstand</div>`;
  const players = session.isHost ? Object.values(s.players) : (s.players || []);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  sorted.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'reveal-row';
    const medal = ['🥇','🥈','🥉'][i] || `#${i + 1}`;
    row.innerHTML = `<span class="k">${medal} ${escapeHtml(p.name)}</span><span class="v">${fmtNum(p.score)}</span>`;
    wrap.appendChild(row);
  });
  return wrap;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// =========================================================================
// Lifecycle
// =========================================================================
function leaveSession() {
  if (!session) return;
  if (session.isHost) session.host.destroy();
  else session.peer.destroy();
  const onExit = session.onExit;
  session = null;
  onExit?.();
}

// auto-join via ?room=XXXX is handled in main.js
