// MEINS! v4 — main entry, routing, all views.
import { fmtEUR, escapeHtml } from './util.js';
import { store } from './store.js';
import { createHost, joinHost, makeRoomCode } from './multiplayer.js';
import {
  newGame, newGameFromPlayers, setSlot, clearSlot, ranking, progress, totalForPlayer,
  isInCooldown, cooldownRemainingMs,
  clampSlotCount, clampCooldownSec,
  MIN_SLOT_COUNT, MAX_SLOT_COUNT, MIN_COOLDOWN_SEC, MAX_COOLDOWN_SEC,
} from './game.js';
import { openCarSearch } from './car-search.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const tpl = (id) => document.getElementById(id).content.cloneNode(true);
const app = $('#app');

let mp = null;
let game = null;
let cooldownTickHandle = null;

function toast(msg, ms = 1800) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ============================================================
// SETTINGS UI
// ============================================================
function renderSettingsBlock(host) {
  const s = store.getSettings();
  let slotCount = clampSlotCount(s.slotCount ?? 3);
  let cooldownSec = clampCooldownSec(s.cooldownSec ?? 30);

  host.innerHTML = `
    <div class="settings-title">Spiel-Einstellungen</div>
    <div class="settings-row">
      <div>
        <label>Anzahl Slots pro Spieler</label>
        <span class="hint">Wie viele Autos jeder Spieler einträgt</span>
      </div>
      <div class="stepper" data-key="slot">
        <button type="button" data-step="-1" aria-label="weniger">−</button>
        <div class="value" id="set-slot-val">${slotCount}</div>
        <button type="button" data-step="1" aria-label="mehr">+</button>
      </div>
    </div>
    <div class="settings-slider">
      <div class="settings-slider-head">
        <div>
          <label for="set-cool-range">Cooldown nach Löschen</label>
          <span class="hint">Wartezeit, bevor wieder eingetragen werden darf</span>
        </div>
        <div class="value" id="set-cool-val">${cooldownSec}s</div>
      </div>
      <input type="range" id="set-cool-range" class="slider"
             min="${MIN_COOLDOWN_SEC}" max="${MAX_COOLDOWN_SEC}" step="5" value="${cooldownSec}" />
    </div>
  `;

  const slotVal = $('#set-slot-val', host);
  const coolVal = $('#set-cool-val', host);
  const coolRange = $('#set-cool-range', host);
  const updateDisabled = () => {
    host.querySelectorAll('.stepper[data-key="slot"] button').forEach(b => {
      const step = parseInt(b.dataset.step, 10);
      b.disabled = (step < 0 && slotCount <= MIN_SLOT_COUNT) || (step > 0 && slotCount >= MAX_SLOT_COUNT);
    });
  };
  host.querySelectorAll('.stepper[data-key="slot"] button').forEach(b => {
    b.addEventListener('click', () => {
      slotCount = clampSlotCount(slotCount + parseInt(b.dataset.step, 10));
      slotVal.textContent = slotCount;
      store.setSettings({ slotCount });
      updateDisabled();
    });
  });
  coolRange.addEventListener('input', () => {
    cooldownSec = clampCooldownSec(coolRange.value);
    coolVal.textContent = `${cooldownSec}s`;
    store.setSettings({ cooldownSec });
  });
  updateDisabled();

  return { get values() { return { slotCount, cooldownSec }; } };
}

// ============================================================
// HOME
// ============================================================
function renderHome() {
  cleanupSession();
  app.innerHTML = '';
  app.appendChild(tpl('tpl-home'));

  const last = store.getLastGroup();
  if (last && last.players?.length >= 2) {
    const btn = $('#btn-rematch');
    btn.hidden = false;
    btn.textContent = `↻ Letzte Gruppe (${last.players.map(p => p.name).join(', ')})`;
    btn.addEventListener('click', () => {
      startSingleGame(last.players.map(p => p.name));
    });
  }
  $('#btn-new-game').addEventListener('click', renderSetup);
}

// ============================================================
// SETUP
// ============================================================
function renderSetup() {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-setup'));
  $('#setup-back').addEventListener('click', renderHome);

  const single = $('#setup-single');
  const multi = $('#setup-multi');
  const showSingle = () => { single.hidden = false; multi.hidden = true; };
  const showMulti = () => { single.hidden = true; multi.hidden = false; };
  $('#switch-to-multi').addEventListener('click', showMulti);
  $('#switch-to-single').addEventListener('click', showSingle);

  // Single-device setup
  const players = [];
  const list = $('#single-players');
  const startBtn = $('#single-start');
  const nameInput = $('#single-name');
  const settingsApi = renderSettingsBlock($('#single-settings'));

  const refreshList = () => {
    list.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <div class="name">${escapeHtml(p.name)}</div>
        <button class="remove" aria-label="Entfernen" data-i="${i}">✕</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.remove').forEach(b => {
      b.addEventListener('click', () => {
        players.splice(parseInt(b.dataset.i, 10), 1); refreshList();
      });
    });
    startBtn.disabled = players.length < 2;
  };
  $('#single-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = nameInput.value.trim();
    if (!v) return;
    if (players.some(p => p.name.toLowerCase() === v.toLowerCase())) {
      toast('Name bereits vergeben'); return;
    }
    if (players.length >= 8) { toast('Maximal 8 Spieler'); return; }
    players.push({ name: v.slice(0, 20) });
    nameInput.value = '';
    nameInput.focus();
    refreshList();
  });
  startBtn.addEventListener('click', () => startSingleGame(players.map(p => p.name), settingsApi.values));

  // Multi-device setup
  const myName = $('#multi-name');
  myName.value = store.getSettings().name || '';
  myName.addEventListener('change', () => store.setSettings({ name: myName.value.trim() }));

  $('#multi-create').addEventListener('click', async () => {
    const n = myName.value.trim();
    if (!n) { myName.focus(); toast('Bitte deinen Namen eingeben'); return; }
    store.setSettings({ name: n });
    await flowCreateRoom(n);
  });
  $('#multi-join').addEventListener('click', () => {
    const n = myName.value.trim();
    if (!n) { myName.focus(); toast('Bitte deinen Namen eingeben'); return; }
    store.setSettings({ name: n });
    flowJoinRoom(n);
  });
}

// ============================================================
// SINGLE-DEVICE GAME
// ============================================================
function startSingleGame(names, opts = null) {
  if (names.length < 2) { toast('Mindestens 2 Spieler'); return; }
  const settings = opts || store.getSettings();
  game = newGame('single', names, null, {
    slotCount: settings.slotCount,
    cooldownSec: settings.cooldownSec,
  });
  store.setLastGroup({ mode: 'single', players: names.map(n => ({ name: n })) });
  renderGame();
}

function renderGame() {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-game'));
  $('#game-leave').addEventListener('click', () => {
    if (confirm('Spiel beenden?')) renderHome();
  });
  refreshGameView();
}

function refreshGameView() {
  if (!game) return;

  const pr = progress(game);
  $('#game-progress').textContent = `${pr.filled}/${pr.total}`;

  const sorted = ranking(game);
  const leader = sorted[0];
  $('#game-leader').innerHTML = leader && leader.total > 0
    ? `Aktuell vorn: <strong>${escapeHtml(leader.name)}</strong> · ${fmtEUR(leader.total)}`
    : '';

  const grid = $('#players-grid');
  grid.innerHTML = '';
  game.players.forEach(p => grid.appendChild(buildPlayerCard(p)));

  $('#game-tip').textContent = game.status === 'done'
    ? 'Alle Slots voll — gleich kommt die Auswertung.'
    : (game.mode === 'single'
        ? 'Tippt einen Slot zum Eintragen. ✕ auf einem Auto zum Löschen (Cooldown!).'
        : 'Ruft "Meins!" → tippt einen freien Slot bei dir. ✕ zum Löschen (Cooldown!).');

  startCooldownTickIfNeeded();

  if (game.status === 'done') {
    setTimeout(() => renderSummary(game), 500);
  }
}

function startCooldownTickIfNeeded() {
  const anyCooldown = game?.players?.some(p => isInCooldown(p));
  if (!anyCooldown) {
    if (cooldownTickHandle) { clearInterval(cooldownTickHandle); cooldownTickHandle = null; }
    return;
  }
  if (cooldownTickHandle) return;
  cooldownTickHandle = setInterval(() => {
    if (!game) { clearInterval(cooldownTickHandle); cooldownTickHandle = null; return; }
    const stillCooling = game.players.some(p => isInCooldown(p));
    if (app.querySelector('.view-game')) {
      const grid = $('#players-grid');
      if (grid) {
        grid.innerHTML = '';
        game.players.forEach(p => grid.appendChild(buildPlayerCard(p)));
      }
    }
    if (!stillCooling) { clearInterval(cooldownTickHandle); cooldownTickHandle = null; }
  }, 250);
}

function buildPlayerCard(player) {
  const card = document.createElement('div');
  card.className = 'player-card';
  const isYou = (mp && !mp.isHost && mp.myId === player.id) || (mp && mp.isHost && mp.host.peer.id === player.id);
  if (isYou) card.classList.add('you');
  if (player.slots.every(s => s != null)) card.classList.add('complete');

  const total = totalForPlayer(player);
  const cooldownMs = cooldownRemainingMs(player);
  const cooldownBadge = cooldownMs > 0
    ? `<span class="cooldown-badge" title="Cooldown nach Löschen">⏱ ${Math.ceil(cooldownMs / 1000)}s</span>`
    : '';

  card.innerHTML = `
    <div class="player-card-head">
      <div class="player-card-name">
        ${player.isHost ? '<span class="crown">👑</span>' : ''}${escapeHtml(player.name)}${isYou ? ' <span style="color:var(--text-dim);font-size:12px;font-weight:500;">(du)</span>' : ''}${cooldownBadge}
      </div>
      <div class="player-card-total">${fmtEUR(total)}</div>
    </div>
    <div class="slots-row" style="--slot-cols:${game.slotCount}"></div>
  `;
  const slotsRow = $('.slots-row', card);
  player.slots.forEach((slot, idx) => slotsRow.appendChild(buildSlot(player, idx, slot)));
  return card;
}

function buildSlot(player, idx, car) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'slot';
  const editable = canEditSlot(player);
  const cooling = isInCooldown(player);

  if (car) {
    el.classList.add('filled');
    el.innerHTML = `
      <div class="slot-emoji">${car.emoji || '🚗'}</div>
      <div class="slot-name">${escapeHtml(car.brand)} ${escapeHtml(car.model)}</div>
      <div class="slot-price">${fmtEUR(car.price)}</div>
    `;
    if (editable) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'slot-delete';
      del.title = 'Auto löschen (Cooldown!)';
      del.setAttribute('aria-label', 'Auto löschen');
      del.textContent = '✕';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const cdSec = game?.cooldownSec || 0;
        const msg = cdSec > 0
          ? `${player.name}: "${car.brand} ${car.model}" löschen?\nDanach ${cdSec}s Cooldown.`
          : `${player.name}: "${car.brand} ${car.model}" löschen?`;
        if (confirm(msg)) handleClearSlot(player.id, idx);
      });
      el.appendChild(del);
    }
    return el;
  }

  if (!editable) {
    el.classList.add('locked');
    el.innerHTML = `<div class="slot-plus">·</div><div>Slot ${idx + 1}</div>`;
    el.disabled = true;
    return el;
  }
  if (cooling) {
    const sec = Math.ceil(cooldownRemainingMs(player) / 1000);
    el.classList.add('cooldown');
    el.innerHTML = `<div class="slot-meins">⏱ ${sec}s</div><div class="slot-plus">Cooldown</div>`;
    el.disabled = true;
    return el;
  }
  el.innerHTML = `
    <div class="slot-meins">MEINS!</div>
    <div class="slot-plus">+</div>
  `;
  el.addEventListener('click', async () => {
    const c = await openCarSearch(`Auto für ${player.name} eintragen`);
    if (!c) return;
    handleAddCar(player.id, idx, c);
  });
  return el;
}

function canEditSlot(player) {
  if (!game) return false;
  if (game.mode === 'single') return true;
  if (mp?.isHost) return mp.host.peer.id === player.id;
  return mp?.myId === player.id;
}

function handleAddCar(playerId, slotIdx, car) {
  if (!game) return;
  if (mp && !mp.isHost) {
    mp.peer.send({ type: 'addCar', playerId, slotIdx, car });
    return;
  }
  const res = setSlot(game, playerId, slotIdx, car);
  if (!res.ok && res.reason === 'cooldown') {
    toast('Noch im Cooldown — warte kurz.'); return;
  }
  if (mp?.isHost) mp.host.broadcast({ type: 'state', state: gameToWire(game) });
  refreshGameView();
}

function handleClearSlot(playerId, slotIdx) {
  if (!game) return;
  if (mp && !mp.isHost) {
    mp.peer.send({ type: 'removeCar', playerId, slotIdx });
    return;
  }
  const res = clearSlot(game, playerId, slotIdx);
  if (!res.ok) return;
  if (mp?.isHost) mp.host.broadcast({ type: 'state', state: gameToWire(game) });
  refreshGameView();
}

// ============================================================
// SUMMARY
// ============================================================
function renderSummary(state) {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-summary'));
  const sorted = ranking(state);
  const winner = sorted[0];
  $('#summary-winner').textContent = winner ? winner.name : '–';
  $('#summary-sub').textContent = `${fmtEUR(winner?.total || 0)} · ${state.players.length} Spieler · ${state.slotCount * state.players.length} Autos`;

  const list = $('#summary-ranking');
  sorted.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (i === 0 ? ' first' : '');
    const cars = p.slots.filter(Boolean).map(c => `${c.brand} ${c.model}`).join(' · ');
    const medal = ['🥇','🥈','🥉'][i] || `#${i + 1}`;
    row.innerHTML = `
      <div class="rank-medal">${medal}</div>
      <div>
        <div class="rank-name">${escapeHtml(p.name)}</div>
        <div class="rank-cars">${escapeHtml(cars)}</div>
      </div>
      <div class="rank-total">${fmtEUR(p.total)}</div>
    `;
    list.appendChild(row);
  });

  $('#summary-rematch').addEventListener('click', () => {
    if (mp?.isHost) {
      const players = game.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }));
      const s = store.getSettings();
      game = newGameFromPlayers('multi', players, mp.host.peer.id, {
        slotCount: s.slotCount, cooldownSec: s.cooldownSec,
      });
      mp.host.broadcast({ type: 'state', state: gameToWire(game) });
      renderGame();
    } else if (mp && !mp.isHost) {
      toast('Nur der Rundenmeister kann ein neues Spiel starten.');
    } else {
      startSingleGame(state.players.map(p => p.name));
    }
  });
  $('#summary-home').addEventListener('click', renderHome);
}

// ============================================================
// MULTIPLAYER
// ============================================================
async function flowCreateRoom(name) {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-room'));
  $('#room-back').addEventListener('click', () => { cleanupSession(); renderSetup(); });
  const code = makeRoomCode();
  $('#room-code').textContent = code;
  setStatus('Verbinde mit Signaling-Server…');

  let host;
  try {
    host = await createHost(code, {
      onPeerJoin: () => mpRefreshLobby(),
      onPeerLeave: (peerId) => {
        if (game) game.players = game.players.filter(p => p.id !== peerId);
        mpRefreshLobby();
      },
      onMessage: (peerId, msg) => mpHandleHostMsg(peerId, msg),
      onError: (err) => console.warn('host error', err),
    });
  } catch (e) {
    setStatus(e.message || 'Verbindung fehlgeschlagen', true);
    return;
  }
  mp = {
    isHost: true, host,
    players: [{ id: host.peer.id, name, isHost: true }],
  };
  mpRenderRoom();
}

function flowJoinRoom(name) {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-room'));
  $('#room-back').addEventListener('click', () => { cleanupSession(); renderSetup(); });
  $('#room-code').textContent = '____';
  $('#room-share').hidden = true;
  $('#room-join-input').hidden = false;
  setStatus(null);

  const input = $('#room-code-input');
  const param = new URLSearchParams(location.search).get('room');
  if (param) input.value = param.toUpperCase().slice(0, 4);
  input.focus();
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  const go = async () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) { toast('Code unvollständig'); return; }
    setStatus(`Verbinde mit Raum ${code}…`);
    try {
      const peer = await joinHost(code, {
        name,
        onMessage: (msg) => mpHandlePeerMsg(msg),
        onClose: () => { toast('Verbindung beendet'); renderHome(); },
        onError: (err) => console.warn('peer error', err),
      });
      mp = { isHost: false, peer, myId: peer.peer.id, myName: name };
      $('#room-code').textContent = code;
      $('#room-share').hidden = false;
      $('#room-share').addEventListener('click', () => copyShare(code));
      $('#room-join-input').hidden = true;
      setStatus(null);
      const role = $('#room-role'); role.className = 'mp-role'; role.textContent = '🎮 Spieler';
    } catch (e) {
      setStatus(e.message || 'Verbindung fehlgeschlagen', true);
    }
  };
  $('#room-go').addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

function mpRenderRoom() {
  const role = $('#room-role'); role.className = 'mp-role host'; role.textContent = '👑 Du bist Rundenmeister';
  $('#room-host-controls').hidden = false;
  $('#room-share').addEventListener('click', () => copyShare(mp.host.roomCode));
  $('#room-start').addEventListener('click', () => mpStartGame());
  renderSettingsBlock($('#room-settings'));
  mpRefreshLobby();
  setStatus(`Warte auf Mitspieler. Teile den Code: ${mp.host.roomCode}`);
}

function mpRefreshLobby() {
  if (!mp?.isHost) return;
  const peerNames = mp.host.listPeers();
  const me = mp.players.find(p => p.isHost) || { id: mp.host.peer.id, name: store.getSettings().name || 'Host', isHost: true };
  mp.players = [me, ...peerNames.map(p => ({ id: p.id, name: p.name, isHost: false }))];

  const list = $('#room-players');
  list.innerHTML = '';
  mp.players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row';
    if (p.id === mp.host.peer.id) row.classList.add('you');
    row.innerHTML = `
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="role-tag ${p.isHost ? 'host' : ''}">${p.isHost ? '👑 Rundenmeister' : 'Spieler'}</div>
    `;
    list.appendChild(row);
  });
  $('#room-start').disabled = mp.players.length < 2;
  mp.host.broadcast({ type: 'lobby', players: mp.players });
}

function mpStartGame() {
  if (mp.players.length < 2) { toast('Mindestens 2 Spieler'); return; }
  const s = store.getSettings();
  game = newGameFromPlayers('multi', mp.players, mp.host.peer.id, {
    slotCount: s.slotCount, cooldownSec: s.cooldownSec,
  });
  store.setLastGroup({ mode: 'multi', players: mp.players.map(p => ({ name: p.name })) });
  mp.host.broadcast({ type: 'state', state: gameToWire(game) });
  renderGame();
}

function mpHandleHostMsg(peerId, msg) {
  if (!mp?.isHost) return;
  if (msg.type === 'addCar') {
    if (!game) return;
    if (peerId !== msg.playerId) return;
    const res = setSlot(game, msg.playerId, msg.slotIdx, msg.car);
    if (!res.ok && res.reason === 'cooldown') {
      mp.host.sendTo(peerId, { type: 'denied', reason: 'cooldown' });
      return;
    }
    mp.host.broadcast({ type: 'state', state: gameToWire(game) });
    refreshGameView();
  }
  if (msg.type === 'removeCar') {
    if (!game) return;
    if (peerId !== msg.playerId) return;
    const res = clearSlot(game, msg.playerId, msg.slotIdx);
    if (!res.ok) return;
    mp.host.broadcast({ type: 'state', state: gameToWire(game) });
    refreshGameView();
  }
  if (msg.type === 'name') {
    mpRefreshLobby();
  }
}

function mpHandlePeerMsg(msg) {
  if (!mp || mp.isHost) return;
  if (msg.type === 'lobby') {
    const list = $('#room-players');
    if (!list) return;
    list.innerHTML = '';
    msg.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      if (p.id === mp.myId) row.classList.add('you');
      row.innerHTML = `
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="role-tag ${p.isHost ? 'host' : ''}">${p.isHost ? '👑 Rundenmeister' : 'Spieler'}</div>
      `;
      list.appendChild(row);
    });
    setStatus('Warte auf Spielstart durch den Rundenmeister…');
  }
  if (msg.type === 'state') {
    game = wireToGame(msg.state);
    if (!app.querySelector('.view-game')) renderGame();
    else refreshGameView();
  }
  if (msg.type === 'denied') {
    if (msg.reason === 'cooldown') toast('Noch im Cooldown — warte kurz.');
  }
}

function gameToWire(g) {
  return {
    mode: g.mode, status: g.status, hostId: g.hostId,
    slotCount: g.slotCount, cooldownSec: g.cooldownSec,
    players: g.players.map(p => ({
      id: p.id, name: p.name, isHost: !!p.isHost,
      slots: p.slots.slice(), cooldownUntil: p.cooldownUntil || 0,
    })),
  };
}
function wireToGame(w) {
  return {
    mode: w.mode, status: w.status, hostId: w.hostId,
    slotCount: clampSlotCount(w.slotCount),
    cooldownSec: clampCooldownSec(w.cooldownSec),
    players: w.players.map(p => ({
      id: p.id, name: p.name, isHost: !!p.isHost,
      slots: p.slots.slice(), cooldownUntil: p.cooldownUntil || 0,
    })),
  };
}

// ============================================================
// helpers
// ============================================================
function setStatus(text, isError = false) {
  const el = $('#room-status');
  if (!el) return;
  if (!text) { el.hidden = true; el.textContent = ''; el.classList.remove('error'); return; }
  el.hidden = false; el.textContent = text;
  el.classList.toggle('error', !!isError);
}

function copyShare(code) {
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const text = `MEINS! – Raum-Code: ${code}\n${url}`;
  if (navigator.share) {
    navigator.share({ title: 'MEINS!', text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Code kopiert')).catch(() => toast(`Code: ${code}`));
  } else {
    toast(`Code: ${code}`);
  }
}

function cleanupSession() {
  if (mp) {
    if (mp.isHost) mp.host.destroy();
    else mp.peer.destroy();
    mp = null;
  }
  game = null;
  if (cooldownTickHandle) { clearInterval(cooldownTickHandle); cooldownTickHandle = null; }
}

// Brand → home
$('#brand-home').addEventListener('click', () => {
  if (game && game.status === 'playing') {
    if (!confirm('Spiel verlassen?')) return;
  }
  renderHome();
});

// Auto-join on ?room=XXXX
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-setup'));
  $('#setup-single').hidden = true;
  $('#setup-multi').hidden = false;
  $('#setup-back').addEventListener('click', renderHome);
  const myName = $('#multi-name');
  myName.value = store.getSettings().name || '';
  $('#multi-create').addEventListener('click', async () => {
    const n = myName.value.trim() || 'Host';
    store.setSettings({ name: n });
    await flowCreateRoom(n);
  });
  $('#multi-join').addEventListener('click', () => {
    const n = myName.value.trim();
    if (!n) { myName.focus(); toast('Bitte deinen Namen eingeben'); return; }
    store.setSettings({ name: n });
    flowJoinRoom(n);
  });
  if (myName.value.trim()) flowJoinRoom(myName.value.trim());
} else {
  renderHome();
}
