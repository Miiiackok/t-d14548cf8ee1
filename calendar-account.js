import { client, createTrip, listTrips, listImportantDays, setImportantDay, migrationOwner } from './cloud.js';
import { allowRegistration } from './config.js';
import { markerColors } from './trip-form.js';
import { makeCalendar } from './calendar-view.js';
import { setupDrawing } from './calendar-tools.js';
import { makeDraft } from './drawn-draft.js';
import { setupSharePanel } from './share-panel.js';

const auth = document.querySelector('#account');
const message = document.querySelector('#app-message');
const calendar = document.querySelector('.calendar');
const toolbar = document.querySelector('#drawing-tools');
const controls = document.querySelector('#calendar-controls');
const importer = document.querySelector('#legacy-import');
const tripList = document.querySelector('#trips');
auth.querySelector('[value=register]').hidden = !allowRegistration;
let accountId = null;
let requests = 0;
let trips = [];
let circles = new Set();
const pendingCircles = new Set();
let drawing;
const openShare = setupSharePanel();
const view = makeCalendar({readTrips:()=>trips,readCircles:()=>circles,readDrawing:()=>drawing,onShare:openShare});
const draft = makeDraft({
  async loadPlaces() {
    const response = await fetch('./places.json');
    if (!response.ok) throw new Error('Place catalogue unavailable');
    return response.json();
  },
  async save(values) {
    const trip = await createTrip(values);
    view.showDate(trip.start_date,true);
    await loadTrips();
  },
  discard:()=>drawing.discard()
});
drawing=setupDrawing({
  calendar:view.calendar,grid:view.grid,colors:markerColors,render:view.render,onDraft:draft.show,onDiscard:draft.hide,
  async onCircle(day) {
    if (pendingCircles.has(day)) return;
    const wasMarked = circles.has(day);
    pendingCircles.add(day);
    if (wasMarked) circles.delete(day); else circles.add(day);
    view.render();
    view.grid.querySelector('[data-calendar-day="'+day+'"]')?.focus({preventScroll:true});
    try {
      await setImportantDay(day,!wasMarked);
    } catch {
      if (wasMarked) circles.add(day); else circles.delete(day);
      view.render();
      message.textContent='重要日期未保存，请联网后重试。';
    } finally { pendingCircles.delete(day); }
  }
});

async function renderAccount(session) {
  const user = session?.user;
  const changed = accountId !== user?.id;
  if (changed) {
    requests++;
    trips = [];
    circles = new Set();
    tripList.replaceChildren();
    accountId = user?.id || null;
    drawing.discard();
  }
  auth.hidden = Boolean(user);
  calendar.hidden = !user;
  toolbar.hidden = !user;
  controls.hidden = !user;
  tripList.hidden = !user;
  importer.closest('label').hidden = !user || user.id !== migrationOwner;
  if (user) await loadTrips();
}

async function loadTrips() {
  if (!accountId) return;
  const request = ++requests;
  try {
    const [records,important] = await Promise.all([listTrips(),listImportantDays()]);
    if (request !== requests) return;
    const nextCircles = new Set(important);
    for (const day of pendingCircles) {
      if (circles.has(day)) nextCircles.add(day); else nextCircles.delete(day);
    }
    circles = nextCircles;
    trips = records.map(record => ({
      id: record.id,
      name: record.name,
      start: record.start_date,
      end: record.end_date,
      color: record.color,
      country_code: record.country_code,
      city: record.city,
      url: './trip.html?id=' + record.id + '#all'
    }));
    if (!view.hasChosenMonth() && trips.length) {
      const today = new Date().toISOString().slice(0,10);
      const next = trips.find(trip => trip.end >= today) || trips.at(-1);
      view.showDate(next.start,true);
    }
    view.render();
    message.textContent = '';
  } catch {
    if (request === requests) message.textContent = '暂时无法读取旅行，请检查网络后重试。';
  }
}

auth.addEventListener('submit', async event => {
  event.preventDefault();
  const action = event.submitter.value;
  const { email, password } = Object.fromEntries(new FormData(auth));
  if (!client) return;
  for (const button of auth.querySelectorAll('button')) button.disabled = true;
  try {
    if (action === 'register') {
      const redirect = new URL('./', location.href).href;
      const { data, error } = await client.auth.signUp({email, password, options: {emailRedirectTo: redirect}});
      if (error) throw error;
      if (!data.session) message.textContent = '请到邮箱确认注册，然后回来登录。';
    } else {
      const { error } = await client.auth.signInWithPassword({email, password});
      if (error) throw error;
    }
    auth.reset();
  } catch {
    message.textContent = action === 'register'
      ? '暂时无法注册。请检查邮箱、密码要求或稍后再试。'
      : '登录失败。请检查邮箱和密码，注册后需先验证邮箱。';
  } finally {
    for (const button of auth.querySelectorAll('button')) button.disabled = false;
  }
});

document.querySelector('#signout').onclick = async () => {
  const { error } = await client.auth.signOut({scope:'local'});
  if (error) message.textContent = '退出失败，请重试。';
  else message.textContent = '';
};
importer.addEventListener('change', async () => {
  const file = importer.files[0];
  if (!client || !file) return;
  try {
    const response = await client.auth.getUser();
    if (response.error || response.data.user?.id !== migrationOwner) throw new Error('Wrong account');
    const { importLegacy } = await import('./migration.js');
    message.textContent = '正在迁入旧行程与附件…';
    await importLegacy(await file.text(), response.data.user);
    await loadTrips();
  } catch {
    message.textContent = '迁入未完成。请确认使用原账号和正确的迁移文件。可用同一份文件重试。';
  } finally {
    importer.value = '';
  }
});

if (client) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(() => {});
  }
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => renderAccount(session), 0);
  });
  window.addEventListener('focus', loadTrips);
  window.addEventListener('online', loadTrips);
} else {
  message.textContent = '当前预览尚未配置账号服务。';
  for (const button of auth.querySelectorAll('button')) button.disabled = true;
}
