// Stockage local (IndexedDB) : fonctionne hors ligne, synchronisé ensuite avec GitHub.
// Stores :
//   items  : { id, type: 'journal'|'place'|'note', title, body, date, mood, tags[],
//              lat, lng, photos[], createdAt, updatedAt, deleted }
//   photos : { id, blob, uploaded }
//   meta   : { key, value }  (réglages, état de synchro)

const DB_NAME = 'journal-de-bord';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  allItems: () => run('items', 'readonly', s => s.getAll()),
  getItem: id => run('items', 'readonly', s => s.get(id)),
  putItem: item => run('items', 'readwrite', s => { s.put(item); }),
  putItems: items => run('items', 'readwrite', s => { items.forEach(i => s.put(i)); }),

  getPhoto: id => run('photos', 'readonly', s => s.get(id)),
  putPhoto: photo => run('photos', 'readwrite', s => { s.put(photo); }),
  allPhotos: () => run('photos', 'readonly', s => s.getAll()),
  deletePhoto: id => run('photos', 'readwrite', s => { s.delete(id); }),

  async getMeta(key, fallback = null) {
    const row = await run('meta', 'readonly', s => s.get(key));
    return row ? row.value : fallback;
  },
  setMeta: (key, value) => run('meta', 'readwrite', s => { s.put({ key, value }); }),
};
