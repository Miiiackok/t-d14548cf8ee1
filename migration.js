import { createTrip, getTrip, openTripStore } from './cloud.js';

const allowedCollections = new Set(['tickets','photos','notes','stopEdits','plans','state']);
const idPattern = /^[a-zA-Z0-9_-]+$/;

async function readLegacyDevice() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nytrip');
    request.onupgradeneeded = event => {
      if (!event.oldVersion) event.target.transaction.abort();
    };
    request.onerror = () => {
      if (request.error?.name === 'AbortError') resolve({ docs: new Map(), blobs: new Map() });
      else reject(request.error);
    };
    request.onsuccess = () => {
      const database = request.result;
      const read = name => new Promise((ok, no) => {
        const entries = new Map();
        const cursor = database.transaction(name).objectStore(name).openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) { ok(entries); return; }
          entries.set(item.key, item.value);
          item.continue();
        };
        cursor.onerror = () => no(cursor.error);
      });
      Promise.all([read('docs'), read('blobs')]).then(
        ([docs, blobs]) => { database.close(); resolve({docs, blobs}); },
        error => { database.close(); reject(error); }
      );
    };
  });
}

async function mergeBackup(legacy, encoded) {
  const {readBackupForThisBrowser} = await import('./transfer.js');
  const bytes = Uint8Array.from(atob(encoded), character=>character.charCodeAt(0));
  const archive = await readBackupForThisBrowser(new Blob([bytes]));
  for (const [id,blob] of archive.blobs) {
    if (!legacy.blobs.has(id)) legacy.blobs.set(id,blob);
  }
  for (const [path,value] of archive.docs) {
    const current = legacy.docs.get(path);
    if (!current) legacy.docs.set(path,value);
    else if (path === 'state/todo') legacy.docs.set(path,{...value,...current});
    else {
      const existingTime = Date.parse(current.updatedAt || current.addedAt);
      const backupTime = Date.parse(value.updatedAt || value.addedAt);
      if (backupTime > existingTime) legacy.docs.set(path,value);
    }
  }
}

export async function importLegacy(text, user) {
  const bundle = JSON.parse(text);
  if (bundle.format !== 'nytrip-owner-migration-v1' || !bundle.trip?.id ||
      !Array.isArray(bundle.trip.itinerary?.days)) throw new Error('Unsupported bundle');
  const photosOnly = bundle.scope === 'photos';
  const legacy = await readLegacyDevice();
  if (typeof bundle.encryptedBackup === 'string') await mergeBackup(legacy,bundle.encryptedBackup);
  const existingTrip = await getTrip(bundle.trip.id);
  const trip = existingTrip || await createTrip(bundle.trip);
  const store = await openTripStore(trip, user);
  try {
    if (!photosOnly && bundle.ticket && !legacy.docs.has(bundle.ticket.path)) {
      const bytes = Uint8Array.from(atob(bundle.ticket.data), c => c.charCodeAt(0));
      legacy.docs.set(bundle.ticket.path, bundle.ticket.value);
      legacy.blobs.set(bundle.ticket.value.asset, new Blob([bytes], {type:'application/pdf'}));
    }
    for (const [path, value] of legacy.docs) {
      if (typeof path !== 'string' || !value || Array.isArray(value) || typeof value !== 'object') continue;
      const [collection, id, extra] = path.split('/');
      if (extra || !allowedCollections.has(collection) || !idPattern.test(id || '')) continue;
      if (photosOnly && collection !== 'photos') continue;
      if (collection === 'state' && !['todo', 'map'].includes(id)) continue;
      const target = store.db.doc(path);
      if ((await target.get()).exists) continue;
      if (collection !== 'photos' && collection !== 'tickets') {
        await target.set(value);
        continue;
      }
      const blob = legacy.blobs.get(value.asset);
      if (!(blob instanceof Blob)) continue;
      const asset = await store.assets.upload(blob);
      try { await target.set({...value, asset: asset.id}); }
      catch (error) { await store.assets.delete(asset.id).catch(() => {}); throw error; }
    }
  } finally {
    store.stop();
  }
}
