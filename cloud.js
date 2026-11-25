import { projectUrl, publishableKey, migrationOwner } from './config.js';

export const configured = Boolean(projectUrl && publishableKey);
export { migrationOwner };

const sdk = configured ? await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm') : null;
export const client = sdk?.createClient(projectUrl, publishableKey);
const tripTable = () => client.from('travel_trips');
const itemTable = () => client.from('travel_items');
const bucket = () => client.storage.from('travel-private');

export function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export const listTrips = async () => checked(await tripTable()
  .select('id,name,start_date,end_date,color,country_code,city').order('start_date'));

export const getTrip = async id => checked(await tripTable()
  .select('*').eq('id', id).maybeSingle());

export const createTrip = async trip => checked(await tripTable()
  .insert(trip).select().single());

export const updateTrip = async (id, fields) => checked(await tripTable()
  .update(fields).eq('id', id).select().single());

export const listImportantDays = async () => checked(await client.from('travel_important_days')
  .select('day').order('day')).map(row=>row.day);

export async function setImportantDay(day, marked) {
  const table=client.from('travel_important_days');
  if (marked) checked(await table.upsert({day},{onConflict:'owner_id,day',ignoreDuplicates:true}));
  else checked(await table.delete().eq('day',day));
}

export const listTravelShares = async trip => checked(await client.from('travel_shares')
  .select('id,viewer_email,created_at').eq('trip_id',trip).order('created_at',{ascending:false}));

export async function makeTravelShare(trip,viewer) {
  const hex = data => [...new Uint8Array(data)].map(value=>value.toString(16).padStart(2,'0')).join('');
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
  checked(await client.from('travel_shares').insert({trip_id:trip,viewer_email:viewer,token_hash:'\\x'+hash}));
  return new URL('./share.html#'+token,location.href).href;
}

export async function revokeTravelShare(id) {
  checked(await client.from('travel_shares').delete().eq('id',id));
}

export const readTravelShare = async token => checked(await client.rpc('travel_open_share',{share_token:token}));

export async function openTripStore(trip, user, onStatus = () => {}) {
  const docs = new Map();
  const urls = new Map();
  const subscriptions = new Set();
  const meta = { fromCache: false, hasPendingWrites: false };
  const folder = `${user.id}/${trip.id}/`;
  let queue = Promise.resolve();
  const serial = task => {
    const running = queue.then(task);
    queue = running.catch(() => {});
    return running;
  };
  const snapshot = path => ({
    id: path.split('/').at(-1),
    exists: docs.has(path),
    data: () => docs.get(path),
    metadata: meta
  });
  const notify = () => {
    for (const update of subscriptions) {
      try { update(); } catch (error) { console.error(error); }
    }
  };
  const watch = update => {
    subscriptions.add(update);
    update();
    return () => subscriptions.delete(update);
  };

  async function prepareUrl(id) {
    if (!id || urls.has(id)) return;
    const result = await bucket().createSignedUrl(folder + id, 3600);
    if (result.data?.signedUrl) urls.set(id, {url: result.data.signedUrl, expires: Date.now() + 50 * 60000});
  }

  const refresh = () => serial(async () => {
    const next = new Map();
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const rows = checked(await itemTable().select('path,value').eq('trip_id', trip.id)
        .order('path').range(offset, offset + pageSize - 1));
      rows.forEach(row => next.set(row.path, row.value));
      if (rows.length < pageSize) break;
    }
    const stale = [...urls].filter(([, entry]) => entry.expires <= Date.now());
    stale.forEach(([id]) => urls.delete(id));
    const assets = new Set([...next].filter(([path]) => /^(photos|tickets)\//.test(path))
      .map(([, value]) => value.asset).filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id)));
    const paths = [...assets].filter(id => !urls.has(id));
    for (let offset = 0; offset < paths.length; offset += 8) {
      await Promise.all(paths.slice(offset, offset + 8).map(prepareUrl));
    }
    const changed = JSON.stringify([...docs].sort()) !== JSON.stringify([...next]);
    docs.clear();
    next.forEach((value, path) => docs.set(path, value));
    if (changed || paths.length) notify();
    onStatus('synced');
  });
  const refreshVisible = () => {
    if (!document.hidden) refresh().catch(() => onStatus('offline'));
  };
  const timer = setInterval(refreshVisible, 25000);
  window.addEventListener('online', refreshVisible);
  window.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  try { await refresh(); } catch (error) { stop(); throw error; }

  function stop() {
    clearInterval(timer);
    window.removeEventListener('online', refreshVisible);
    window.removeEventListener('focus', refreshVisible);
    document.removeEventListener('visibilitychange', refreshVisible);
  }

  function doc(path) {
    return {
      path,
      async get() { return snapshot(path); },
      async set(value) {
        return serial(async () => {
          checked(await itemTable().upsert({trip_id: trip.id, path, value}, {onConflict: 'trip_id,path'}));
          if (/^(photos|tickets)\//.test(path) && value.asset) await prepareUrl(value.asset);
          docs.set(path, value);
          notify();
        });
      },
      async delete() {
        return serial(async () => {
          checked(await itemTable().delete().eq('trip_id', trip.id).eq('path', path));
          docs.delete(path);
          notify();
        });
      },
      onSnapshot(callback) { return watch(() => callback(snapshot(path))); }
    };
  }
  function collection(name, order) {
    return {
      orderBy(key) { return collection(name, key); },
      doc(id = crypto.randomUUID()) { return doc(name + '/' + id); },
      async add(value) { const ref = this.doc(); await ref.set(value); return ref; },
      onSnapshot(callback) {
        return watch(() => {
          const matches = [...docs.keys()].filter(path => path.startsWith(name + '/')).map(snapshot);
          if (order) matches.sort((a, b) => String(a.data()[order]).localeCompare(String(b.data()[order])));
          callback({docs: matches, size: matches.length, empty: matches.length === 0, metadata: meta});
        });
      }
    };
  }
  return {
    stop,
    db: {doc, collection},
    url: id => urls.get(id)?.url || '',
    assets: {
      async upload(blob, options = {}) {
        const type = options.type || blob.type;
        if (!/^(image\/|application\/pdf$)/.test(type)) throw {code:'unsupported_type'};
        const id = crypto.randomUUID();
        checked(await bucket().upload(folder + id, blob, {contentType: type, upsert: false}));
        await prepareUrl(id);
        return {id, url: urls.get(id)?.url, contentType: type, sizeBytes: blob.size};
      },
      async delete(id) {
        checked(await bucket().remove([folder + id]));
        urls.delete(id);
        return {deleted: true};
      }
    }
  };
}
