import { client, getTrip, openTripStore } from './cloud.js';

const id = new URL(location.href).searchParams.get('id');
const status = document.querySelector('#trip-sync');
const setStatus = state => {
  status.textContent = state === 'synced'
    ? '已同步'
    : '网络中断，显示当前已加载的内容。';
};

try {
  if (!client) throw new Error('Backend not configured');
  const {data: {user}, error} = await client.auth.getUser();
  if (!user || error) {
    location.replace('./');
  } else {
    const trip = await getTrip(id);
    if (!trip) throw new Error('Trip unavailable');
    const store = await openTripStore(trip, user, setStatus);
    const app = await import('./itinerary.js');
    app.startItinerary(trip, store);
    window.addEventListener('pagehide', event => { if (!event.persisted) store.stop(); });
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') location.replace('./');
    });
  }
} catch {
  status.textContent = '暂时无法打开旅行。请从日历重新进入。';
}
