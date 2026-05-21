// IndexedDB-Storage für Foto-Blobs der Sammlung.
// Nur Schluesselwerte: id (auto) -> { id, dataUrl, createdAt }.

const DB_NAME = 'meins-photos';
const STORE = 'photos';
const VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode = 'readonly') {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

export async function addPhoto(dataUrl) {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.add({ dataUrl, createdAt: Date.now() });
    req.onsuccess = () => resolve(req.result); // id
    req.onerror = () => reject(req.error);
  });
}

export async function getPhoto(id) {
  if (id == null) return null;
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(Number(id));
    req.onsuccess = () => resolve(req.result?.dataUrl || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getPhotos(ids) {
  const out = {};
  if (!Array.isArray(ids) || ids.length === 0) return out;
  const store = await tx('readonly');
  await Promise.all(ids.map(id => new Promise((resolve) => {
    const req = store.get(Number(id));
    req.onsuccess = () => { if (req.result?.dataUrl) out[id] = req.result.dataUrl; resolve(); };
    req.onerror = () => resolve();
  })));
  return out;
}

export async function deletePhoto(id) {
  if (id == null) return;
  const store = await tx('readwrite');
  return new Promise((resolve) => {
    const req = store.delete(Number(id));
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

export function isPhotoStorageAvailable() {
  return typeof indexedDB !== 'undefined';
}
