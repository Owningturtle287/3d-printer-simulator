const KEY = 'x2d-lab:v1';
const DB = 'x2d-lab-files';

export function loadPreferences(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(KEY) || '{}'); }
  catch { return {}; }
}

export function savePreferences(preferences, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(preferences)); }
  catch { return false; }
  return true;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('files', mode);
      const request = action(tx.objectStore('files'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || request.error);
    });
  } finally { database.close(); }
}

export function listFiles() { return transaction('readonly', store => store.getAll()); }
export function saveFile(file) { return transaction('readwrite', store => store.put(file)); }
export function deleteFile(id) { return transaction('readwrite', store => store.delete(id)); }
