// Game state machine — works for both single-device and multiplayer (host-authoritative).
import { randomId } from './util.js';

export const SLOT_COUNT = 3;

/**
 * @typedef {{ brand: string, model: string, price: number, emoji?: string }} Car
 * @typedef {{ id: string, name: string, slots: (Car|null)[], isHost?: boolean }} Player
 * @typedef {{
 *   mode: 'single' | 'multi',
 *   status: 'playing' | 'done',
 *   players: Player[],
 *   hostId?: string,
 * }} GameState
 */

/** Build a fresh state from a list of player names. */
export function newGame(mode, names, hostId = null) {
  const players = names.map((name, i) => ({
    id: hostId && i === 0 ? hostId : randomId(),
    name: String(name).slice(0, 20).trim() || `Spieler ${i + 1}`,
    slots: Array(SLOT_COUNT).fill(null),
    isHost: hostId ? i === 0 : false,
  }));
  return { mode, status: 'playing', players, hostId: hostId || null };
}

/** Build a state from existing player objects (e.g. multiplayer joiners). */
export function newGameFromPlayers(mode, players, hostId) {
  return {
    mode,
    status: 'playing',
    players: players.map(p => ({
      id: p.id, name: p.name, isHost: !!p.isHost,
      slots: Array(SLOT_COUNT).fill(null),
    })),
    hostId,
  };
}

/** Place a car in the next free slot for a player. Idempotent on full slots. */
export function setSlot(state, playerId, slotIndex, car) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return state;
  if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return state;
  p.slots[slotIndex] = car;
  if (state.players.every(pl => pl.slots.every(s => s != null))) state.status = 'done';
  return state;
}

export function clearSlot(state, playerId, slotIndex) {
  const p = state.players.find(p => p.id === playerId);
  if (!p) return state;
  p.slots[slotIndex] = null;
  state.status = 'playing';
  return state;
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
  const total = state.players.length * SLOT_COUNT;
  const filled = state.players.reduce(
    (n, p) => n + p.slots.filter(s => s != null).length, 0
  );
  return { filled, total };
}
