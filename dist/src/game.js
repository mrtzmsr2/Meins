// Game state machine — works for both single-device and multiplayer (host-authoritative).
import { randomId } from './util.js';

export const DEFAULT_SLOT_COUNT = 3;
export const DEFAULT_COOLDOWN_SEC = 30;
export const MIN_SLOT_COUNT = 1;
export const MAX_SLOT_COUNT = 6;
export const MIN_COOLDOWN_SEC = 0;
export const MAX_COOLDOWN_SEC = 600;

/**
 * @typedef {{ brand: string, model: string, price: number, emoji?: string }} Car
 * @typedef {{ id: string, name: string, slots: (Car|null)[], isHost?: boolean, cooldownUntil?: number }} Player
 * @typedef {{
 *   mode: 'single' | 'multi',
 *   status: 'playing' | 'done',
 *   players: Player[],
 *   hostId?: string,
 *   slotCount: number,
 *   cooldownSec: number,
 * }} GameState
 */

export function clampSlotCount(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_SLOT_COUNT;
  return Math.max(MIN_SLOT_COUNT, Math.min(MAX_SLOT_COUNT, n));
}
export function clampCooldownSec(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_COOLDOWN_SEC;
  return Math.max(MIN_COOLDOWN_SEC, Math.min(MAX_COOLDOWN_SEC, n));
}

/** Build a fresh state from a list of player names (or {name,avatar} objects). */
export function newGame(mode, names, hostId = null, opts = {}) {
  const slotCount = clampSlotCount(opts.slotCount);
  const cooldownSec = clampCooldownSec(opts.cooldownSec);
  const players = names.map((entry, i) => {
    const isObj = entry && typeof entry === 'object';
    const name = String(isObj ? entry.name : entry).slice(0, 20).trim() || `Spieler ${i + 1}`;
    const avatar = isObj ? (entry.avatar || null) : null;
    return {
      id: hostId && i === 0 ? hostId : randomId(),
      name,
      avatar,
      slots: Array(slotCount).fill(null),
      isHost: hostId ? i === 0 : false,
      cooldownUntil: 0,
    };
  });
  return { mode, status: 'playing', players, hostId: hostId || null, slotCount, cooldownSec };
}

/** Build a state from existing player objects (e.g. multiplayer joiners). */
export function newGameFromPlayers(mode, players, hostId, opts = {}) {
  const slotCount = clampSlotCount(opts.slotCount);
  const cooldownSec = clampCooldownSec(opts.cooldownSec);
  return {
    mode,
    status: 'playing',
    players: players.map(p => ({
      id: p.id, name: p.name, isHost: !!p.isHost,
      avatar: p.avatar || null,
      slots: Array(slotCount).fill(null),
      cooldownUntil: 0,
    })),
    hostId,
    slotCount,
    cooldownSec,
  };
}

/** Place a car in a given slot. Returns {ok, reason}. Rejects if player is in cooldown. */
export function setSlot(state, playerId, slotIndex, car) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return { ok: false, reason: 'no-player' };
  if (slotIndex < 0 || slotIndex >= state.slotCount) return { ok: false, reason: 'bad-slot' };
  if ((p.cooldownUntil || 0) > Date.now()) return { ok: false, reason: 'cooldown' };
  p.slots[slotIndex] = car;
  if (allSlotsFilled(state)) state.status = 'done';
  return { ok: true };
}

/**
 * Remove a car. Triggers an ADDITIVE cooldown:
 * - Jede Loeschung haengt cooldownSec oben drauf (egal ob 1., 2. oder 3. mal).
 * - Streak wird trotzdem getrackt fuer die Anzeige ("warum dauert das so lange").
 * Streak laeuft aus, wenn nach Cooldown-Ende eine Karenzzeit (2x cooldownSec)
 * ohne weitere Loeschung vergeht.
 */
export function clearSlot(state, playerId, slotIndex) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return { ok: false };
  if (slotIndex < 0 || slotIndex >= state.slotCount) return { ok: false };
  if (!p.slots[slotIndex]) return { ok: false };
  p.slots[slotIndex] = null;
  state.status = 'playing';
  if ((state.cooldownSec || 0) > 0) {
    const now = Date.now();
    const cdMs = state.cooldownSec * 1000;
    const decayAt = p.streakDecayAt || 0;
    const streak = (now > decayAt) ? 1 : ((p.deleteStreak || 0) + 1);
    const base = Math.max(now, p.cooldownUntil || 0);
    p.cooldownUntil = base + cdMs;
    p.deleteStreak = streak;
    p.streakDecayAt = p.cooldownUntil + cdMs * 2;
  }
  return { ok: true };
}

/** Naechste Cooldown-Dauer in Sek., wenn der Spieler JETZT loeschen wuerde. */
export function nextCooldownSec(state, player) {
  const cdSec = state.cooldownSec || 0;
  if (cdSec <= 0) return 0;
  return cdSec;
}

export function allSlotsFilled(state) {
  return state.players.every(pl => pl.slots.every(s => s != null));
}

export function totalForPlayer(p) {
  return p.slots.reduce((sum, s) => sum + (s ? Number(s.price) || 0 : 0), 0);
}

export function ranking(state) {
  return [...state.players]
    .map(p => ({ ...p, total: totalForPlayer(p) }))
    .sort((a, b) => b.total - a.total);
}

export function progress(state) {
  const total = state.players.length * state.slotCount;
  const filled = state.players.reduce(
    (n, p) => n + p.slots.filter(s => s != null).length, 0
  );
  return { filled, total };
}

export function cooldownRemainingMs(player) {
  return Math.max(0, ((player.cooldownUntil || 0) - Date.now()));
}

export function isInCooldown(player) {
  return cooldownRemainingMs(player) > 0;
}
