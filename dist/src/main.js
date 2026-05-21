// MEINS! v4 — main entry, routing, all views.
import { fmtEUR, escapeHtml } from './util.js';
import { store } from './store.js';
import { createHost, joinHost, makeRoomCode } from './multiplayer.js';
import {
  newGame, newGameFromPlayers, setSlot, clearSlot, ranking, progress, totalForPlayer,
  isInCooldown, cooldownRemainingMs, nextCooldownSec,
  clampSlotCount, clampCooldownSec,
  MIN_SLOT_COUNT, MAX_SLOT_COUNT, MIN_COOLDOWN_SEC, MAX_COOLDOWN_SEC,
} from './game.js';
import { openCarSearch } from './car-search.js';
import { brandBadgeHTML } from './brands.js';
import { sounds, haptic } from './sounds.js';
import { AVATAR_POOL, nextAvatar, avatarHTML } from './avatars.js';
import { theme, applyTheme } from './theme.js';
import { pickAndCompressPhoto } from './photo-capture.js';
import * as collection from './collection.js';
import { getPhoto, getPhotos } from './photos.js';
import { TEXT, CONFIRM } from './messages.js';
import { customConfirm, spawnConfetti, cooldownRingHTML } from './ui.js';
import * as stats from './stats.js';

sounds.load();
applyTheme();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const tpl = (id) => document.getElementById(id).content.cloneNode(true);
const app = $('#app');

let mp = null;
let game = null;
let cooldownTickHandle = null;
let justAddedKey = null; // "playerId:slotIdx" — für Eintrag-Animation
let gameStartedAt = 0;

function toast(msg, ms = 1800) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  announce(msg);
  setTimeout(() => el.remove(), ms);
}

function announce(msg) {
  const r = document.getElementById('aria-live');
  if (!r) return;
  r.textContent = '';
  // Kurzer Reset, damit Screenreader die Änderung wahrnimmt
  setTimeout(() => { r.textContent = msg; }, 30);
}

// Single-Device-Spielstand speichern/laden
function persistGame() {
  if (!game) return;
  if (game.mode !== 'single') return;        // nur Einzelgerät
  if (game.status !== 'playing') return;     // fertige Spiele nicht weiterspeichern
  try { store.setSavedGame({ ...game, startedAt: gameStartedAt || Date.now() }); } catch {}
}
function clearPersistedGame() {
  try { store.clearSavedGame(); } catch {}
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
    <div class="settings-slider">
      <div class="settings-slider-head">
        <div>
          <label for="set-slot-range">Anzahl Slots pro Spieler</label>
          <span class="hint">Wie viele Autos jeder Spieler einträgt</span>
        </div>
        <div class="value" id="set-slot-val">${slotCount}</div>
      </div>
      <input type="range" id="set-slot-range" class="slider"
             min="${MIN_SLOT_COUNT}" max="${MAX_SLOT_COUNT}" step="1" value="${slotCount}" />
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
  const slotRange = $('#set-slot-range', host);
  const coolVal = $('#set-cool-val', host);
  const coolRange = $('#set-cool-range', host);

  slotRange.addEventListener('input', () => {
    slotCount = clampSlotCount(slotRange.value);
    slotVal.textContent = slotCount;
    store.setSettings({ slotCount });
  });
  coolRange.addEventListener('input', () => {
    cooldownSec = clampCooldownSec(coolRange.value);
    coolVal.textContent = `${cooldownSec}s`;
    store.setSettings({ cooldownSec });
  });

  return { get values() { return { slotCount, cooldownSec }; } };
}

// ============================================================
// HOME
// ============================================================
function renderHome() {
  cleanupSession();
  app.innerHTML = '';
  app.appendChild(tpl('tpl-home'));

  // Laufendes Spiel fortsetzen?
  const saved = store.getSavedGame();
  if (saved && saved.status === 'playing' && Array.isArray(saved.players) && saved.players.length >= 2) {
    const homeActions = $('.home-actions');
    if (homeActions) {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'primary big';
      resumeBtn.id = 'btn-resume';
      const names = saved.players.map(p => p.name).join(', ');
      const pr = saved.players.reduce((n, p) => n + (p.slots || []).filter(s => s != null).length, 0);
      const total = saved.players.length * (saved.slotCount || 3);
      resumeBtn.innerHTML = `▶ Spiel fortsetzen <span style="font-weight:500;opacity:.75;font-size:13px;display:block;margin-top:2px;">${escapeHtml(names)} · ${pr}/${total} Slots</span>`;
      resumeBtn.addEventListener('click', () => {
        game = {
          mode: saved.mode || 'single',
          status: saved.status,
          players: saved.players.map(p => ({
            id: p.id, name: p.name, isHost: !!p.isHost,
            avatar: p.avatar || null,
            slots: Array.isArray(p.slots) ? p.slots.slice() : [],
            cooldownUntil: p.cooldownUntil || 0,
          })),
          hostId: saved.hostId || null,
          slotCount: saved.slotCount,
          cooldownSec: saved.cooldownSec,
        };
        gameStartedAt = saved.startedAt || Date.now();
        renderGame();
      });
      // Discard-Link
      const discardBtn = document.createElement('button');
      discardBtn.className = 'ghost-link';
      discardBtn.style.marginTop = '4px';
      discardBtn.textContent = '✕ Gespeichertes Spiel verwerfen';
      discardBtn.addEventListener('click', async () => {
        if (await customConfirm(CONFIRM.resumeDelete)) {
          clearPersistedGame();
          renderHome();
        }
      });
      homeActions.prepend(resumeBtn);
      homeActions.appendChild(discardBtn);
    }
  }

  const last = store.getLastGroup();
  if (last && last.players?.length >= 2) {
    const btn = $('#btn-rematch');
    btn.hidden = false;
    btn.textContent = `↻ Letzte Gruppe (${last.players.map(p => p.name).join(', ')})`;
    btn.addEventListener('click', () => {
      startSingleGame(last.players.map(p => ({ name: p.name, avatar: p.avatar || null })));
    });
  }
  $('#btn-new-game').addEventListener('click', renderSetup);

  const collBtn = $('#btn-collection');
  collBtn?.addEventListener('click', renderCollection);
  $('#btn-trophies')?.addEventListener('click', renderTrophies);
  $('#btn-history')?.addEventListener('click', renderHistory);

  // Gespeicherte Gruppen
  const groups = store.getGroups();
  const groupsHost = $('#home-groups');
  const groupsList = $('#groups-list');
  if (groups.length > 0 && groupsHost && groupsList) {
    groupsHost.hidden = false;
    groupsList.innerHTML = '';
    groups.forEach(g => {
      const card = document.createElement('div');
      card.className = 'group-card';
      const avatars = g.players.map(p => `<span class="group-card-avatar">${p.avatar || '🚗'}</span>`).join('');
      card.innerHTML = `
        <button type="button" class="group-card-main" aria-label="Gruppe ${escapeHtml(g.name)} starten">
          <div class="group-card-name">${escapeHtml(g.name)}</div>
          <div class="group-card-players">${avatars}<span class="group-card-count">${g.players.length} Spieler</span></div>
        </button>
        <button type="button" class="group-card-del" aria-label="Gruppe ${escapeHtml(g.name)} löschen" title="Gruppe löschen">✕</button>
      `;
      card.querySelector('.group-card-main').addEventListener('click', () => {
        store.touchGroup(g.id);
        startSingleGame(g.players.map(p => ({ name: p.name, avatar: p.avatar || null })));
      });
      card.querySelector('.group-card-del').addEventListener('click', async () => {
        if (await customConfirm(CONFIRM.groupDelete(g.name))) {
          store.deleteGroup(g.id);
          renderHome();
        }
      });
      groupsList.appendChild(card);
    });
  }
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
  const saveGroupBtn = $('#single-save-group');
  const settingsApi = renderSettingsBlock($('#single-settings'));

  const refreshList = () => {
    list.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <button type="button" class="avatar-btn" data-i="${i}" aria-label="Avatar wechseln">${avatarHTML(p.avatar, 'md')}</button>
        <div class="name">${escapeHtml(p.name)}</div>
        <button class="remove" aria-label="${escapeHtml(p.name)} entfernen" data-i="${i}">✕</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.remove').forEach(b => {
      b.addEventListener('click', () => {
        players.splice(parseInt(b.dataset.i, 10), 1); refreshList();
      });
    });
    list.querySelectorAll('.avatar-btn').forEach(b => {
      b.addEventListener('click', () => {
        const i = parseInt(b.dataset.i, 10);
        cycleAvatar(players, i);
        refreshList();
      });
    });
    startBtn.disabled = players.length < 2;
    if (saveGroupBtn) saveGroupBtn.hidden = players.length < 2;
  };
  $('#single-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = nameInput.value.trim();
    if (!v) return;
    if (players.some(p => p.name.toLowerCase() === v.toLowerCase())) {
      toast(TEXT.nameTaken()); return;
    }
    if (players.length >= 8) { toast(TEXT.maxPlayers()); return; }
    players.push({ name: v.slice(0, 20), avatar: nextAvatar(players.map(p => p.avatar)) });
    nameInput.value = '';
    nameInput.focus();
    refreshList();
  });
  startBtn.addEventListener('click', () => startSingleGame(players.slice(), settingsApi.values));

  saveGroupBtn?.addEventListener('click', () => {
    if (players.length < 2) return;
    const name = prompt('Name der Gruppe?', players.map(p => p.name).join(' & ').slice(0, 30));
    if (!name) return;
    const g = store.saveGroup(name, players);
    if (g) { toast(TEXT.groupSaved(g.name)); haptic.success(); }
  });

  // Multi-device setup
  const myName = $('#multi-name');
  myName.value = store.getSettings().name || '';
  myName.addEventListener('change', () => store.setSettings({ name: myName.value.trim() }));

  $('#multi-create').addEventListener('click', async () => {
    const n = myName.value.trim();
    if (!n) { myName.focus(); toast(TEXT.needName()); return; }
    store.setSettings({ name: n });
    await flowCreateRoom(n);
  });
  $('#multi-join').addEventListener('click', () => {
    const n = myName.value.trim();
    if (!n) { myName.focus(); toast(TEXT.needName()); return; }
    store.setSettings({ name: n });
    flowJoinRoom(n);
  });
}

// ============================================================
// SINGLE-DEVICE GAME
// ============================================================
function cycleAvatar(players, i) {
  const cur = players[i].avatar;
  const used = new Set(players.map((p, j) => j !== i ? p.avatar : null).filter(Boolean));
  const idx = AVATAR_POOL.indexOf(cur);
  for (let k = 1; k <= AVATAR_POOL.length; k++) {
    const cand = AVATAR_POOL[(idx + k) % AVATAR_POOL.length];
    if (!used.has(cand)) { players[i].avatar = cand; return; }
  }
  players[i].avatar = AVATAR_POOL[(idx + 1) % AVATAR_POOL.length];
}

function startSingleGame(playersInput, opts = null) {
  // playersInput kann Array<string> oder Array<{name,avatar}> sein.
  const arr = (playersInput || []).map(p => typeof p === 'string' ? { name: p, avatar: null } : p);
  if (arr.length < 2) { toast(TEXT.minPlayers()); return; }
  // Avatare auffüllen
  arr.forEach((p, i) => {
    if (!p.avatar) p.avatar = nextAvatar(arr.slice(0, i).map(q => q.avatar));
  });
  const settings = opts || store.getSettings();
  game = newGame('single', arr, null, {
    slotCount: settings.slotCount,
    cooldownSec: settings.cooldownSec,
  });
  store.setLastGroup({ mode: 'single', players: arr.map(p => ({ name: p.name, avatar: p.avatar })) });
  clearPersistedGame();
  gameStartedAt = Date.now();
  persistGame();
  renderGame();
}

function renderGame() {
  app.innerHTML = '';
  app.appendChild(tpl('tpl-game'));
  $('#game-leave').addEventListener('click', () => {
    (async () => { if (await customConfirm(CONFIRM.endGame)) renderHome(); })();
  });
  // Im Multiplayer-Hostmodus: Code-Banner einblenden, damit Mitspieler jederzeit beitreten koennen
  if (game?.mode === 'multi' && mp?.isHost && mp.host?.roomCode) {
    const view = app.querySelector('.view-game');
    const banner = document.createElement('div');
    banner.className = 'mp-code-banner';
    banner.innerHTML = `
      <div class="mp-code-banner-label">Beitritts-Code</div>
      <div class="mp-code-banner-code">${escapeHtml(mp.host.roomCode)}</div>
      <button class="icon-btn mp-code-banner-share" id="mp-code-share" title="Code teilen" aria-label="Code teilen">📋</button>
    `;
    view.insertBefore(banner, view.firstChild.nextSibling);
    banner.querySelector('#mp-code-share').addEventListener('click', () => copyShare(mp.host.roomCode));
  }
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

  // Live-Mini-Ranking
  const mini = $('#game-mini-rank');
  if (mini) {
    if (sorted.some(p => p.total > 0)) {
      mini.hidden = false;
      mini.innerHTML = sorted.map((p, i) => `
        <div class="mini-rank-row${i === 0 ? ' lead' : ''}">
          <span class="mini-rank-pos">${i + 1}.</span>
          ${avatarHTML(p.avatar, 'sm')}
          <span class="mini-rank-name">${escapeHtml(p.name)}</span>
          <span class="mini-rank-total">${fmtEUR(p.total)}</span>
        </div>
      `).join('');
    } else {
      mini.hidden = true;
    }
  }

  const grid = $('#players-grid');
  grid.innerHTML = '';
  game.players.forEach(p => grid.appendChild(buildPlayerCard(p)));

  $('#game-tip').textContent = game.status === 'done'
    ? 'Alle Slots voll — gleich kommt die Auswertung.'
    : (game.mode === 'single'
        ? 'Tippt einen Slot zum Eintragen. ✕ auf einem Auto zum Löschen (Cooldown!).'
        : 'Ruft "Meins!" → tippt einen freien Slot bei dir. ✕ zum Löschen (Cooldown!).');

  startCooldownTickIfNeeded();

  // Eintrag-Animation: nach Render einmal triggern
  if (justAddedKey) {
    const sel = `.slot[data-key="${justAddedKey}"]`;
    requestAnimationFrame(() => {
      const el = grid.querySelector(sel);
      if (el) {
        el.classList.add('slot-pop');
        setTimeout(() => el.classList.remove('slot-pop'), 600);
      }
    });
    justAddedKey = null;
  }

  if (game.status === 'done') {
    clearPersistedGame();
    sounds.win();
    haptic.success();
    setTimeout(() => renderSummary(game), 700);
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
    // Surgisch: nur den Sekunden-Text in den vorhandenen Cooldown-Ringen updaten,
    // damit CSS-Animationen (Ring + MEINS-Atmen) nicht jedes Mal resetten.
    if (app.querySelector('.view-game')) {
      game.players.forEach(p => {
        const remMs = cooldownRemainingMs(p);
        const sec = Math.ceil(remMs / 1000);
        document.querySelectorAll(`.slot.cooldown[data-key^="${p.id}:"] .cd-ring-text`)
          .forEach(el => { el.textContent = `${sec}s`; });
        // wenn Cooldown abgelaufen, Spieler-Karte komplett neu rendern
        if (remMs <= 0) {
          const grid = $('#players-grid');
          if (grid) {
            const cards = grid.querySelectorAll('.player-card');
            cards.forEach(c => {
              const slots = c.querySelectorAll('.slot.cooldown');
              if (slots.length && slots[0].dataset.key.startsWith(p.id + ':')) {
                const newCard = buildPlayerCard(p);
                c.replaceWith(newCard);
              }
            });
          }
        }
      });
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
  const streak = player.deleteStreak || 0;
  const streakHtml = (cooldownMs > 0 && streak > 1)
    ? `<span class="cooldown-streak" title="Mehrfach-Löschen-Strafe">×${streak}</span>` : '';
  const cooldownBadge = cooldownMs > 0
    ? `<span class="cooldown-badge" title="Cooldown nach Löschen">⏱ ${Math.ceil(cooldownMs / 1000)}s${streakHtml}</span>`
    : '';

  card.innerHTML = `
    <div class="player-card-head">
      <div class="player-card-name">
        ${avatarHTML(player.avatar, 'md')}${player.isHost ? '<span class="crown">👑</span>' : ''}<span class="player-card-name-text">${escapeHtml(player.name)}</span>${isYou ? ' <span style="color:var(--text-dim);font-size:12px;font-weight:500;">(du)</span>' : ''}${cooldownBadge}
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
  el.dataset.key = `${player.id}:${idx}`;
  const editable = canEditSlot(player);
  const cooling = isInCooldown(player);

  if (car) {
    el.classList.add('filled');
    el.innerHTML = `
      <div class="slot-logo">${brandBadgeHTML(car.brand, 'lg')}</div>
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
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        const cdSec = game ? nextCooldownSec(game, player) : 0;
        const baseSec = game?.cooldownSec || 0;
        const factor = baseSec > 0 ? Math.max(1, Math.round(cdSec / baseSec)) : 1;
        const ok = await customConfirm(CONFIRM.slotDelete({
          playerName: player.name, brand: car.brand, model: car.model,
          cooldownSec: cdSec, factor,
        }));
        if (ok) handleClearSlot(player.id, idx);
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
    const remainingMs = cooldownRemainingMs(player);
    const totalMs = (game?.cooldownSec || 0) * 1000 * (player.deleteStreak || 1);
    el.classList.add('cooldown');
    el.innerHTML = cooldownRingHTML(remainingMs, totalMs) + '<div class="slot-plus">Cooldown</div>';
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
    sounds.blocked(); haptic.error();
    toast(TEXT.cooldown()); return;
  }
  if (mp?.isHost) mp.host.broadcast({ type: 'state', state: gameToWire(game) });
  justAddedKey = `${playerId}:${slotIdx}`;
  if (Number(car?.price) >= 500000) sounds.jackpot();
  else sounds.claim();
  haptic.medium();
  persistGame();
  refreshGameView();
  // Konfetti & Toast aus dem gerade gefuellten Slot
  requestAnimationFrame(() => {
    const slotEl = document.querySelector(`.slot[data-key="${playerId}:${slotIdx}"]`);
    if (slotEl) spawnConfetti(slotEl);
  });
  toast(TEXT.caught(), 1200);

  // Optionales Beweis-Foto -> Sammlung (nur Single-Device)
  if (game.mode === 'single') {
    const player = game.players.find(p => p.id === playerId);
    askPhotoAndCollect(car, player?.name).catch(e => console.warn('[photo]', e));
  }
}

async function askPhotoAndCollect(car, playerName) {
  const want = await openPhotoPrompt();
  if (!want) return;
  const dataUrl = await pickAndCompressPhoto();
  if (!dataUrl) { toast(TEXT.photoMissing()); return; }
  try {
    await collection.addEntry({
      brand: car.brand, model: car.model, price: car.price,
      dataUrl, playerName: playerName || null,
    });
    toast(TEXT.collectionAdded());
    haptic.success();
  } catch (e) {
    console.warn('[collection]', e);
    toast(TEXT.saveError());
  }
}

function openPhotoPrompt() {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    if (!root) return resolve(false);
    root.innerHTML = '';
    root.hidden = false;
    const node = tpl('tpl-photo-prompt');
    root.appendChild(node);
    const close = (val) => {
      root.hidden = true;
      root.innerHTML = '';
      resolve(val);
    };
    root.querySelector('[data-act="take"]').addEventListener('click', () => close(true));
    root.querySelector('[data-act="skip"]').addEventListener('click', () => close(false));
    // Klick aufs Backdrop schliesst
    const backdrop = root.querySelector('.photo-prompt');
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
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
  sounds.remove();
  haptic.light();
  persistGame();
  refreshGameView();
  toast(TEXT.removed(), 1200);
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

  // Statistik-Box: teuerstes/billigstes Auto + Spielzeit
  const allCars = [];
  state.players.forEach(p => p.slots.forEach(c => { if (c) allCars.push({ ...c, owner: p.name }); }));
  const stats = $('#summary-stats');
  if (stats && allCars.length > 0) {
    const sortedByPrice = [...allCars].sort((a, b) => b.price - a.price);
    const top = sortedByPrice[0];
    const bot = sortedByPrice[sortedByPrice.length - 1];
    const duration = gameStartedAt ? Math.max(0, Date.now() - gameStartedAt) : 0;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    const durTxt = duration > 0
      ? (minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`)
      : '–';
    stats.hidden = false;
    stats.innerHTML = `
      <div class="stat-row"><span class="stat-label">Teuerstes Auto</span><span class="stat-value">${escapeHtml(top.brand)} ${escapeHtml(top.model)} · ${fmtEUR(top.price)} <span class="stat-sub">(${escapeHtml(top.owner)})</span></span></div>
      <div class="stat-row"><span class="stat-label">Günstigstes Auto</span><span class="stat-value">${escapeHtml(bot.brand)} ${escapeHtml(bot.model)} · ${fmtEUR(bot.price)} <span class="stat-sub">(${escapeHtml(bot.owner)})</span></span></div>
      <div class="stat-row"><span class="stat-label">Spielzeit</span><span class="stat-value">${durTxt}</span></div>
      <div class="stat-row"><span class="stat-label">Autos gesamt</span><span class="stat-value">${allCars.length}</span></div>
    `;
  }

  const list = $('#summary-ranking');
  sorted.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (i === 0 ? ' first' : '');
    const cars = p.slots.filter(Boolean).map(c => `${c.brand} ${c.model}`).join(' · ');
    const medal = ['🥇','🥈','🥉'][i] || `#${i + 1}`;
    row.innerHTML = `
      <div class="rank-medal">${medal}</div>
      <div>
        <div class="rank-name">${avatarHTML(p.avatar, 'sm')} ${escapeHtml(p.name)}</div>
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
      toast(TEXT.hostOnly());
    } else {
      startSingleGame(state.players.map(p => p.name));
    }
  });
  $('#summary-home').addEventListener('click', renderHome);
}

// ============================================================
// COLLECTION (langfristig, fotopflichtig)
// ============================================================
async function renderCollection() {
  cleanupSession();
  app.innerHTML = '';
  app.appendChild(tpl('tpl-collection'));
  $('#coll-back').addEventListener('click', renderHome);

  const settings = collection.getSettings();
  let activeTab = settings.tab === 'all' ? 'all' : 'brands';
  const showCb = $('#coll-show-photos');
  showCb.checked = !!settings.showPhotos;

  const tabs = $$('.coll-tab');
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      tabs.forEach(x => {
        const on = x.dataset.tab === activeTab;
        x.classList.toggle('active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      collection.setSettings({ tab: activeTab });
      draw();
    });
    if (t.dataset.tab === activeTab) {
      t.classList.add('active');
      t.setAttribute('aria-selected', 'true');
    } else {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    }
  });

  showCb.addEventListener('change', () => {
    collection.setSettings({ showPhotos: showCb.checked });
    draw();
  });

  const body = $('#coll-body');
  const empty = $('#coll-empty');

  let photoMap = {};

  async function ensurePhotos(items) {
    if (!showCb.checked) return;
    const need = items.map(it => it.photoId).filter(id => !(id in photoMap));
    if (!need.length) return;
    try {
      const map = await getPhotos(need);
      photoMap = { ...photoMap, ...map };
    } catch {}
  }

  function statHtml(items, brandCount) {
    if (items.length === 0) return '';
    const total = items.reduce((n, it) => n + (Number(it.price) || 0), 0);
    return `
      <span class="coll-stat"><span class="coll-stat-num">${items.length}</span> Autos</span>
      <span class="coll-stat"><span class="coll-stat-num">${brandCount}</span> Marken</span>
      <span class="coll-stat"><span class="coll-stat-num">${fmtEUR(total)}</span> Gesamtwert</span>
    `;
  }

  function buildEntryCard(it) {
    const card = document.createElement('div');
    card.className = 'coll-card';
    const showPhotos = showCb.checked;
    const photo = showPhotos && photoMap[it.photoId];
    const photoHtml = showPhotos
      ? (photo
          ? `<div class="coll-photo"><img src="${photo}" alt="${escapeHtml(it.brand)} ${escapeHtml(it.model)}" loading="lazy" /></div>`
          : `<div class="coll-photo coll-photo--missing">Foto fehlt</div>`)
      : '';
    const date = new Date(it.addedAt || 0).toLocaleDateString('de-DE');
    card.innerHTML = `
      ${photoHtml}
      <div class="coll-meta">
        <div class="coll-name">${escapeHtml(it.brand)} ${escapeHtml(it.model)}</div>
        <div class="coll-price">${fmtEUR(it.price)}</div>
        <div class="coll-date">${date}${it.playerName ? ` · ${escapeHtml(it.playerName)}` : ''}</div>
      </div>
      <button type="button" class="coll-del" aria-label="Aus Sammlung entfernen" data-id="${it.id}">✕</button>
    `;
    return card;
  }

  function wireDeleteButtons(scope) {
    scope.querySelectorAll('.coll-del').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!(await customConfirm(CONFIRM.collectionDelete))) return;
        await collection.removeEntry(b.dataset.id);
        renderCollection();
      });
    });
  }

  async function draw() {
    const items = collection.getAll();
    const groups = collection.byBrand();
    $('#coll-stats').innerHTML = statHtml(items, groups.length);

    if (items.length === 0) {
      body.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    body.innerHTML = '';

    if (activeTab === 'brands') {
      await ensurePhotos(items);
      const grid = document.createElement('div');
      grid.className = 'coll-disc-grid';
      groups.forEach(g => {
        const wrap = document.createElement('div');
        wrap.className = 'coll-disc-wrap';

        const disc = document.createElement('button');
        disc.type = 'button';
        disc.className = 'coll-disc' + (g.complete ? ' coll-disc--complete' : '');
        disc.setAttribute('aria-expanded', 'false');
        const pct = Math.round(g.progress * 100);
        // SVG-Ring: r=45, C=2*PI*r=282.74
        const C = 282.74;
        const dash = (g.progress * C).toFixed(2);
        const fracText = g.totalModels > 0 ? `${g.uniqueCount}/${g.totalModels}` : `${g.uniqueCount}`;
        disc.innerHTML = `
          <span class="coll-disc-ring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="coll-disc-track" cx="50" cy="50" r="45"></circle>
              <circle class="coll-disc-fill" cx="50" cy="50" r="45"
                stroke-dasharray="${dash} ${C}"></circle>
            </svg>
            <span class="coll-disc-badge">${brandBadgeHTML(g.brand, 'lg')}</span>
            ${g.complete ? '<span class="coll-disc-trophy" aria-hidden="true">🏆</span>' : ''}
          </span>
          <span class="coll-disc-name">${escapeHtml(g.brand)}</span>
          <span class="coll-disc-frac">${fracText}</span>
          <span class="coll-disc-pct">${pct}%</span>
        `;

        const detail = document.createElement('div');
        detail.className = 'coll-disc-detail';
        detail.hidden = true;
        const detailHead = document.createElement('div');
        detailHead.className = 'coll-disc-detail-head';
        detailHead.innerHTML = `
          <span class="coll-disc-detail-title">
            ${brandBadgeHTML(g.brand, 'md')}
            <strong>${escapeHtml(g.brand)}</strong>
            <span class="coll-disc-detail-meta">${g.count} ${g.count === 1 ? 'Auto' : 'Autos'} · ${fmtEUR(g.value)}</span>
          </span>
          <button type="button" class="coll-disc-close" aria-label="Schließen">✕</button>
        `;
        const list = document.createElement('div');
        list.className = 'coll-list';
        list.classList.toggle('coll-list--photos', showCb.checked);
        list.classList.toggle('coll-list--compact', !showCb.checked);
        g.items.forEach(it => list.appendChild(buildEntryCard(it)));
        wireDeleteButtons(list);
        detail.appendChild(detailHead);
        detail.appendChild(list);

        const close = () => {
          detail.hidden = true;
          disc.setAttribute('aria-expanded', 'false');
          wrap.classList.remove('coll-disc-wrap--open');
        };
        disc.addEventListener('click', () => {
          // alle anderen schliessen
          grid.querySelectorAll('.coll-disc-wrap--open').forEach(w => {
            if (w !== wrap) {
              w.classList.remove('coll-disc-wrap--open');
              w.querySelector('.coll-disc-detail').hidden = true;
              w.querySelector('.coll-disc').setAttribute('aria-expanded', 'false');
            }
          });
          const open = detail.hidden;
          detail.hidden = !open;
          disc.setAttribute('aria-expanded', open ? 'true' : 'false');
          wrap.classList.toggle('coll-disc-wrap--open', open);
          if (open) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        detailHead.querySelector('.coll-disc-close').addEventListener('click', (e) => {
          e.stopPropagation();
          close();
        });

        wrap.appendChild(disc);
        wrap.appendChild(detail);
        grid.appendChild(wrap);
      });
      body.appendChild(grid);
    } else {
      await ensurePhotos(items);
      const list = document.createElement('div');
      list.className = 'coll-list';
      list.classList.toggle('coll-list--photos', showCb.checked);
      list.classList.toggle('coll-list--compact', !showCb.checked);
      items.forEach(it => list.appendChild(buildEntryCard(it)));
      wireDeleteButtons(list);
      body.appendChild(list);
    }
  }

  draw();
}

// ============================================================
// TROPHIES & STATISTIK
// ============================================================
async function renderTrophies() {
  cleanupSession();
  app.innerHTML = '';
  app.appendChild(tpl('tpl-trophies'));
  $('#tro-back').addEventListener('click', renderHome);

  const s = stats.computeStats();
  const statsHost = $('#tro-stats');
  const tiles = [];
  tiles.push({ label: 'Autos gesammelt', value: String(s.totalCount) });
  tiles.push({ label: 'Marken-Schubladen', value: String(s.brandCount) });
  tiles.push({ label: 'Sammlungswert', value: fmtEUR(s.totalValue) });
  if (s.topItem) {
    tiles.push({
      label: 'Teuerstes Stück',
      value: `${s.topItem.brand} ${s.topItem.model}`,
      sub: fmtEUR(s.topItem.price),
    });
  }
  if (s.favBrand) {
    tiles.push({
      label: 'Lieblings-Marke',
      value: s.favBrand.brand,
      sub: `${s.favBrand.count} ${s.favBrand.count === 1 ? 'Auto' : 'Autos'} · ${fmtEUR(s.favBrand.value)}`,
    });
  }
  if (s.richestDay) {
    const d = new Date(s.richestDay.date).toLocaleDateString('de-DE');
    tiles.push({
      label: 'Bester Tag',
      value: fmtEUR(s.richestDay.value),
      sub: `${d} · ${s.richestDay.count} ${s.richestDay.count === 1 ? 'Auto' : 'Autos'}`,
    });
  }
  tiles.push({ label: 'Streak', value: `${s.streak} ${s.streak === 1 ? 'Tag' : 'Tage'}`, sub: s.streak >= 1 ? 'Weiter so.' : 'Heute startest du.' });

  statsHost.innerHTML = tiles.map(t => `
    <div class="tro-tile">
      <div class="tro-tile-label">${escapeHtml(t.label)}</div>
      <div class="tro-tile-value">${escapeHtml(t.value)}</div>
      ${t.sub ? `<div class="tro-tile-sub">${escapeHtml(t.sub)}</div>` : ''}
    </div>
  `).join('');

  const aHost = $('#tro-achievements');
  aHost.innerHTML = s.achievements.map(a => `
    <div class="tro-ach ${a.done ? 'tro-ach--done' : 'tro-ach--locked'}">
      <span class="tro-ach-icon">${a.done ? a.icon : '🔒'}</span>
      <span class="tro-ach-label">${escapeHtml(a.label)}</span>
    </div>
  `).join('');
}

// ============================================================
// VERLAUF (letzte 7 Tage)
// ============================================================
async function renderHistory() {
  cleanupSession();
  app.innerHTML = '';
  app.appendChild(tpl('tpl-history'));
  $('#his-back').addEventListener('click', renderHome);

  const days = stats.recentDays(7);
  const allItems = days.flatMap(d => d.items);
  let photoMap = {};
  if (allItems.length) {
    try { photoMap = await getPhotos(allItems.map(it => it.photoId)); } catch {}
  }

  const host = $('#his-timeline');
  const today = new Date().toISOString().slice(0, 10);
  const yest  = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

  host.innerHTML = '';
  days.forEach((day, i) => {
    const sec = document.createElement('div');
    sec.className = 'his-day' + (day.count === 0 ? ' his-day--empty' : '');
    const label = day.date === today ? 'Heute' : day.date === yest ? 'Gestern'
      : new Date(day.date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const summary = day.count > 0
      ? `${day.count} ${day.count === 1 ? 'Auto' : 'Autos'} · ${fmtEUR(day.value)}`
      : 'Nichts gefangen';
    sec.innerHTML = `
      <div class="his-day-marker" aria-hidden="true">
        <div class="his-day-dot"></div>
        ${i < days.length - 1 ? '<div class="his-day-line"></div>' : ''}
      </div>
      <div class="his-day-body">
        <div class="his-day-head">
          <div class="his-day-label">${escapeHtml(label)}</div>
          <div class="his-day-summary">${escapeHtml(summary)}</div>
        </div>
        <div class="his-day-items"></div>
      </div>
    `;
    const itemsHost = sec.querySelector('.his-day-items');
    day.items
      .slice()
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      .forEach(it => {
        const photo = photoMap[it.photoId];
        const card = document.createElement('div');
        card.className = 'his-item';
        const time = new Date(it.addedAt || 0).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        card.innerHTML = `
          <div class="his-item-photo">${photo ? `<img src="${photo}" alt="" loading="lazy" />` : brandBadgeHTML(it.brand, 'md')}</div>
          <div class="his-item-meta">
            <div class="his-item-name">${escapeHtml(it.brand)} ${escapeHtml(it.model)}</div>
            <div class="his-item-sub">${time} · ${fmtEUR(it.price)}${it.playerName ? ` · ${escapeHtml(it.playerName)}` : ''}</div>
          </div>
        `;
        itemsHost.appendChild(card);
      });
    host.appendChild(sec);
  });
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
      onPeerJoin: (peerId) => {
        if (game) {
          // Spiel laeuft — wird nach 'name'-Nachricht aufgenommen
        } else {
          mpRefreshLobby();
        }
      },
      onPeerLeave: (peerId) => {
        if (game) game.players = game.players.filter(p => p.id !== peerId);
        if (!game) mpRefreshLobby();
        else { mp.host.broadcast({ type: 'state', state: gameToWire(game) }); refreshGameView(); }
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
    if (code.length < 4) { toast(TEXT.codeIncomplete()); return; }
    const goBtn = $('#room-go');
    goBtn.disabled = true;
    goBtn.textContent = 'Verbinde…';
    setStatus(`Verbinde mit Raum ${code}…`);
    try {
      const peer = await joinHost(code, {
        name,
        onMessage: (msg) => mpHandlePeerMsg(msg),
        onClose: () => { toast(TEXT.connectionEnded()); renderHome(); },
        onError: (err) => console.warn('peer error', err),
        onProgress: (text) => setStatus(text),
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
      goBtn.disabled = false;
      goBtn.textContent = 'Beitreten';
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
  setStatus(`Code: ${mp.host.roomCode} — starte wann du willst, andere können während des Spiels beitreten.`);
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
  $('#room-start').disabled = false;
  mp.host.broadcast({ type: 'lobby', players: mp.players });
}

/** Bei laufendem Spiel: neue Peers nachtraeglich als Spieler aufnehmen. */
function mpAddPlayerLive(peerId, name) {
  if (!game || !mp?.isHost) return;
  if (game.players.find(p => p.id === peerId)) return;
  game.players.push({
    id: peerId, name: String(name || 'Spieler').slice(0, 20),
    avatar: null, isHost: false,
    slots: Array(game.slotCount).fill(null),
    cooldownUntil: 0, deleteStreak: 0, streakDecayAt: 0,
  });
  // Falls vorher "done" weil alle Slots voll waren — wieder aktiv
  if (allSlotsFilledFn()) game.status = 'done'; else game.status = 'playing';
  mp.host.broadcast({ type: 'state', state: gameToWire(game) });
  refreshGameView();
  toast(`${name} ist beigetreten.`, 1400);
}
function allSlotsFilledFn() {
  if (!game) return false;
  return game.players.every(pl => pl.slots.every(s => s != null));
}

function mpStartGame() {
  const s = store.getSettings();
  game = newGameFromPlayers('multi', mp.players, mp.host.peer.id, {
    slotCount: s.slotCount, cooldownSec: s.cooldownSec,
  });
  store.setLastGroup({ mode: 'multi', players: mp.players.map(p => ({ name: p.name })) });
  gameStartedAt = Date.now();
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
    if (game) {
      // Live-Beitritt waehrend des Spiels
      mpAddPlayerLive(peerId, msg.name);
    } else {
      mpRefreshLobby();
    }
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
    if (msg.reason === 'cooldown') toast(TEXT.cooldown());
  }
}

function gameToWire(g) {
  return {
    mode: g.mode, status: g.status, hostId: g.hostId,
    slotCount: g.slotCount, cooldownSec: g.cooldownSec,
    players: g.players.map(p => ({
      id: p.id, name: p.name, isHost: !!p.isHost,
      slots: p.slots.slice(), cooldownUntil: p.cooldownUntil || 0,
      deleteStreak: p.deleteStreak || 0, streakDecayAt: p.streakDecayAt || 0,
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
      deleteStreak: p.deleteStreak || 0, streakDecayAt: p.streakDecayAt || 0,
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
    navigator.clipboard.writeText(text).then(() => toast(TEXT.codeCopied())).catch(() => toast(`Code: ${code}`));
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
    if (!(await customConfirm(CONFIRM.leaveMulti))) return;
  }
  renderHome();
});

// Mute-Toggle
const muteBtn = document.getElementById('btn-mute');
function refreshMuteBtn() {
  if (!muteBtn) return;
  muteBtn.textContent = sounds.isMuted() ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', sounds.isMuted() ? 'true' : 'false');
  muteBtn.title = sounds.isMuted() ? 'Sound einschalten' : 'Sound ausschalten';
}
refreshMuteBtn();
muteBtn?.addEventListener('click', () => {
  sounds.setMuted(!sounds.isMuted());
  refreshMuteBtn();
  if (!sounds.isMuted()) sounds.tap();
});

// Theme-Toggle
const themeBtn = document.getElementById('btn-theme');
function refreshThemeBtn() {
  if (!themeBtn) return;
  const eff = theme.getEffective();
  themeBtn.textContent = eff === 'light' ? '☀️' : '🌙';
  themeBtn.setAttribute('aria-pressed', eff === 'light' ? 'true' : 'false');
  themeBtn.title = eff === 'light' ? 'Dunkel-Modus' : 'Hell-Modus';
}
refreshThemeBtn();
themeBtn?.addEventListener('click', () => {
  theme.toggle();
  refreshThemeBtn();
  haptic.light();
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
    if (!n) { myName.focus(); toast(TEXT.needName()); return; }
    store.setSettings({ name: n });
    flowJoinRoom(n);
  });
  if (myName.value.trim()) flowJoinRoom(myName.value.trim());
} else {
  renderHome();
}

// Splash ausblenden
requestAnimationFrame(() => {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.classList.add('app-splash--hide');
    setTimeout(() => splash.remove(), 600);
  }
});
