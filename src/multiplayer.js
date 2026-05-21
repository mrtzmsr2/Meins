// PeerJS-based transport. Host owns authoritative state.
const PREFIX = 'meins-v4-';
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

// STUN+TURN-Server fuer NAT-Traversal. Ohne TURN scheitern Verbindungen,
// wenn Host und Joiner in unterschiedlichen Mobilfunk-/Symmetric-NATs sind.
// Open Relay (Metered) ist kostenlos und ohne Account nutzbar.
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
const PEER_OPTS = { debug: 1, config: ICE_CONFIG };

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
    const peer = new Peer(PREFIX + roomCode, PEER_OPTS);
    const conns = new Map();
    let openResolved = false;

    const timeout = setTimeout(() => {
      if (openResolved) return;
      try { peer.destroy(); } catch {}
      reject(new Error('Zeitüberschreitung beim Verbinden zum Signaling-Server. Bitte erneut versuchen.'));
    }, 15000);

    peer.on('open', () => {
      openResolved = true;
      clearTimeout(timeout);
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
        clearTimeout(timeout);
        try { peer.destroy(); } catch {}
        if (err && err.type === 'unavailable-id') reject(new Error('Raum-Code bereits vergeben. Bitte neuen Raum erstellen.'));
        else if (err && err.type === 'network') reject(new Error('Netzwerk-Fehler. Internetverbindung prüfen.'));
        else if (err && err.type === 'server-error') reject(new Error('PeerJS-Server nicht erreichbar. Bitte erneut versuchen.'));
        else reject(err instanceof Error ? err : new Error(err?.message || 'Verbindung fehlgeschlagen'));
      } else { onError?.(err); }
    });
  });
}

export async function joinHost(roomCode, opts = {}) {
  const { onMessage, onClose, onError, name, onProgress } = opts;
  const Peer = await ensurePeer();

  // Up to 4 attempts with backoff to defeat PeerJS-cloud rate limits
  const attempts = 4;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      const wait = 2000 + i * 1500; // 2s, 3.5s, 5s
      onProgress?.(`Versuch ${i + 1} von ${attempts}… (PeerJS-Cloud begrenzt — bitte kurz warten)`);
      await new Promise(r => setTimeout(r, wait));
    } else {
      onProgress?.(`Verbinde…`);
    }
    try {
      return await tryJoin(Peer, roomCode, { onMessage, onClose, onError, name });
    } catch (e) {
      lastErr = e;
      // Don't retry if we know the room genuinely doesn't exist
      if (e && /nicht gefunden/i.test(e.message)) throw e;
    }
  }
  throw lastErr || new Error('Verbindung fehlgeschlagen');
}

function tryJoin(Peer, roomCode, { onMessage, onClose, onError, name }) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(undefined, PEER_OPTS);
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { peer.destroy(); } catch {}
      reject(err);
    };

    const timeout = setTimeout(() => {
      fail(new Error('Zeitüberschreitung beim Verbinden.'));
    }, 12000);

    peer.on('open', () => {
      const conn = peer.connect(PREFIX + roomCode, { reliable: true });
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { conn.send({ type: 'name', name }); } catch {}
        resolve({
          peer, conn, roomCode,
          send(msg) { try { conn.send(msg); } catch {} },
          destroy() { try { conn.close(); } catch {} try { peer.destroy(); } catch {} },
        });
      });
      conn.on('data', (data) => onMessage?.(data));
      conn.on('close', () => { if (settled) onClose?.(); });
      conn.on('error', (err) => {
        if (!settled) fail(new Error('Raum nicht gefunden oder Verbindung gescheitert. Code prüfen.'));
        else onError?.(err);
      });
    });

    peer.on('error', (err) => {
      if (settled) { onError?.(err); return; }
      const t = err && err.type;
      if (t === 'peer-unavailable') fail(new Error('Raum nicht gefunden. Code prüfen.'));
      else if (t === 'network') fail(new Error('Netzwerk-Fehler. Internetverbindung prüfen.'));
      else if (t === 'server-error' || t === 'socket-error' || /usage|limit/i.test(err?.message || '')) {
        fail(new Error('PeerJS-Cloud begrenzt — Retry läuft…'));
      } else fail(err instanceof Error ? err : new Error(err?.message || 'Verbindung fehlgeschlagen'));
    });
  });
}
