// PeerJS-based transport. Host owns authoritative state.
const PREFIX = 'meins-v4-';
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
      else if (Date.now() - t0 > 10000) {
        clearInterval(iv); reject(new Error('PeerJS konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
      }
    }, 50);
  });
}

export async function createHost(roomCode, { onPeerJoin, onPeerLeave, onMessage, onError } = {}) {
  const Peer = await ensurePeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + roomCode, { debug: 1 });
    const conns = new Map();
    let openResolved = false;

    peer.on('open', () => {
      openResolved = true;
      resolve({
        peer, roomCode,
        broadcast(msg) { for (const { conn } of conns.values()) { try { conn.send(msg); } catch {} } },
        sendTo(peerId, msg) { const c = conns.get(peerId); if (c) try { c.conn.send(msg); } catch {} },
        listPeers() { return Array.from(conns.entries()).map(([id, v]) => ({ id, name: v.name })); },
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
          const e = conns.get(conn.peer); if (e) e.name = data.name.slice(0, 20);
        }
        onMessage?.(conn.peer, data);
      });
      conn.on('close', () => { conns.delete(conn.peer); onPeerLeave?.(conn.peer); });
      conn.on('error', (err) => onError?.(err));
    });

    peer.on('error', (err) => {
      if (!openResolved) {
        if (err && err.type === 'unavailable-id') reject(new Error('Raum-Code bereits vergeben. Bitte neuen Raum erstellen.'));
        else reject(err);
      } else { onError?.(err); }
    });
  });
}

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
      } else { onError?.(err); }
    });
  });
}
