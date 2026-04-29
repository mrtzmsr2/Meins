// Multiplayer transport using PeerJS (WebRTC peer-to-peer).
// Architecture:
//  - Host owns the authoritative game state and broadcasts via DataConnections.
//  - Peers send their actions (guess, duelPick, name) to the host only.
// PeerJS is loaded globally via <script> in index.html (window.Peer).

const PREFIX = 'mmeins-v3-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

function ensurePeer() {
  return new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.Peer) { clearInterval(iv); resolve(window.Peer); }
      else if (Date.now() - t0 > 10000) { clearInterval(iv); reject(new Error('PeerJS konnte nicht geladen werden.')); }
    }, 50);
  });
}

/** Host: creates a peer with a deterministic ID derived from the room code. */
export async function createHost(roomCode, { onPeerJoin, onPeerLeave, onMessage, onError } = {}) {
  const Peer = await ensurePeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + roomCode, { debug: 1 });
    const conns = new Map(); // peerId -> { conn, name }

    peer.on('open', () => {
      resolve({
        peer,
        roomCode,
        broadcast(msg) {
          for (const { conn } of conns.values()) {
            try { conn.send(msg); } catch {}
          }
        },
        sendTo(peerId, msg) {
          const c = conns.get(peerId);
          if (c) { try { c.conn.send(msg); } catch {} }
        },
        listPeers() { return Array.from(conns.entries()).map(([id, v]) => ({ id, name: v.name })); },
        kick(peerId) {
          const c = conns.get(peerId);
          if (c) { try { c.conn.close(); } catch {} conns.delete(peerId); }
        },
        destroy() {
          for (const { conn } of conns.values()) { try { conn.close(); } catch {} }
          try { peer.destroy(); } catch {}
        },
      });
    });

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        conns.set(conn.peer, { conn, name: 'Spieler' });
        onPeerJoin?.(conn.peer);
      });
      conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'name' && typeof data.name === 'string') {
          const entry = conns.get(conn.peer);
          if (entry) entry.name = data.name.slice(0, 20);
        }
        onMessage?.(conn.peer, data);
      });
      conn.on('close', () => {
        conns.delete(conn.peer);
        onPeerLeave?.(conn.peer);
      });
      conn.on('error', (err) => onError?.(err));
    });

    peer.on('error', (err) => {
      // unavailable-id means room already exists
      if (err && err.type === 'unavailable-id') reject(new Error('Raum-Code bereits vergeben. Bitte neuen Raum erstellen.'));
      else if (!conns.size) reject(err);
      else onError?.(err);
    });
  });
}

/** Peer: connects to host by room code. */
export async function joinHost(roomCode, { onMessage, onClose, onError, name } = {}) {
  const Peer = await ensurePeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(undefined, { debug: 1 });
    let settled = false;

    peer.on('open', () => {
      const conn = peer.connect(PREFIX + roomCode, { reliable: true });
      conn.on('open', () => {
        settled = true;
        try { conn.send({ type: 'name', name }); } catch {}
        resolve({
          peer, conn, roomCode,
          send(msg) { try { conn.send(msg); } catch {} },
          destroy() { try { conn.close(); } catch {} try { peer.destroy(); } catch {} },
        });
      });
      conn.on('data', (data) => onMessage?.(data));
      conn.on('close', () => onClose?.());
      conn.on('error', (err) => onError?.(err));
    });

    peer.on('error', (err) => {
      if (!settled) {
        if (err && err.type === 'peer-unavailable') reject(new Error('Raum nicht gefunden. Code prüfen.'));
        else reject(err);
      } else {
        onError?.(err);
      }
    });
  });
}
