import { client, createTrip, listTrips, listCalendarPlaces, listImportantDays, setImportantDay, listTransportStickers, setTransportSticker, migrationOwner } from './cloud.js';
import { allowRegistration } from './config.js';
import { markerColors } from './trip-form.js';
import { makeCalendar } from './calendar-view.js';
import { setupDrawing } from './calendar-tools.js';
import {groupStickers,setStickerInCalendar} from './transport-stickers.js';
import { makeDraft } from './drawn-draft.js';
import { makeCircleDraft } from './circle-draft.js';
import { setupSharePanel } from './share-panel.js';

const legacyTripId = 'ce5415bd-64d3-45df-aecc-6ff00987d50e';
const urlOptions = new URLSearchParams(location.search);
const migrationRequested = urlOptions.get('migration') === '1';
const legacyBookmark = !migrationRequested && /^#(?:all|wallet|todo|plans|d(?:2[6-9]|3[01]))$/.test(location.hash) ? location.hash : '';
const setupRequested = urlOptions.get('account') === 'setup';
const auth = document.querySelector('#account');
const setupForm = document.querySelector('#account-setup');
const message = document.querySelector('#app-message');
const calendar = document.querySelector('.calendar');
const toolbar = document.querySelector('#drawing-tools');
const controls = document.querySelector('#calendar-controls');
const importer = document.querySelector('#legacy-import');
const tripList = document.querySelector('#trips');
auth.querySelector('[value=register]').hidden = !allowRegistration;
let accountId = null;
let requests = 0;
let importInProgress = false;
let trips = [];
let circles = new Map();
let transportDays = new Map();
const readStickers = day => transportDays.get(day) || [];
let drawing;
const openShare = setupSharePanel();
const view = makeCalendar({
  readTrips:()=>trips,readCircles:()=>circles,readStickers,readCircleDraft:()=>circleDraft.day(),
  readDrawing:()=>drawing,onShare:openShare
});
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
async function saveCircle(day,details) {
  const owner=accountId;
  await setImportantDay(day,details);
  if (owner !== accountId) return;
  requests++;
  if (details) circles.set(day,details); else circles.delete(day);
}
async function saveSticker(day,kind,placed) {
  const owner = accountId;
  await setTransportSticker(owner,day,kind,placed);
  if (owner !== accountId) return;
  requests++;
  setStickerInCalendar(transportDays,day,kind,placed);
}
const circleDraft = makeCircleDraft({
  read:day=>circles.get(day),save:saveCircle,remove:day=>saveCircle(day,null),render:view.render
});
drawing=setupDrawing({
  calendar:view.calendar,grid:view.grid,colors:markerColors,render:view.render,onDraft:draft.show,onDiscard:draft.hide,
  onCircle:circleDraft.show,onCircleDiscard:circleDraft.hide,readStickers,saveSticker
});

async function renderAccount(session) {
  const user = session?.user;
  if (setupRequested) {
    auth.hidden = Boolean(user);
    setupForm.hidden = !user;
    message.textContent = user ? '' : '请从邀请邮件打开链接来设置密码。';
    return;
  }
  const changed = accountId !== user?.id;
  if (changed) {
    requests++;
    trips = [];
    circles = new Map();
    transportDays = new Map();
    tripList.replaceChildren();
    accountId = user?.id || null;
    circleDraft.hide();
    drawing.reset();
  }
  auth.hidden = Boolean(user);
  calendar.hidden = !user;
  toolbar.hidden = !user;
  controls.hidden = !user;
  tripList.hidden = !user;
  importer.closest('label').hidden = !migrationRequested || !user || user.id !== migrationOwner;
  if (user) await loadTrips();
}

async function loadTrips() {
  if (!accountId || importInProgress) return;
  const request = ++requests;
  try {
    const [records,important,stickers,places] = await Promise.all([
      listTrips(),listImportantDays(),listTransportStickers().catch(()=>null),listCalendarPlaces().catch(()=>null)
    ]);
    if (request !== requests) return;
    if (legacyBookmark && records.some(record=>record.id===legacyTripId)) {
      const tripPage = new URL('./trip.html',location.href);
      tripPage.searchParams.set('id',legacyTripId);
      tripPage.hash = legacyBookmark;
      location.replace(tripPage);
      return;
    }
    circles = new Map(important.map(details=>[details.day,details]));
    if (stickers) transportDays = groupStickers(stickers);
    const placesByTrip = new Map();
    for (const {trip_id,day,name} of places || []) {
      if (!placesByTrip.has(trip_id)) placesByTrip.set(trip_id,Object.create(null));
      const days = placesByTrip.get(trip_id);
      (days[day] ??= []).push(name);
    }
    trips = records.map(record => ({
      id: record.id,
      name: record.name,
      start: record.start_date,
      end: record.end_date,
      color: record.color,
      country_code: record.country_code,
      city: record.city,
      placesByDay: placesByTrip.get(record.id),
      url: './trip.html?id=' + record.id + '#all'
    }));
    if (!view.hasChosenMonth() && trips.length) {
      const today = new Date().toISOString().slice(0,10);
      const next = trips.find(trip => trip.end >= today) || trips.at(-1);
      view.showDate(next.start,true);
    }
    view.render();
    message.textContent = migrationRequested && accountId===migrationOwner && !records.some(record=>record.id===legacyTripId)
      ? '请在原先保存照片的浏览器迁入旧行程。'
      : !stickers ? '暂时无法读取交通贴纸。' : !places ? '暂时无法读取计划地点。' : '';
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

setupForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = setupForm.elements.password.value;
  const confirm = document.querySelector('#setup-confirm');
  if (password !== confirm.value) {
    message.textContent = '两次输入的密码需要一致。';
    confirm.focus();
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const {error} = await client.auth.updateUser({password});
    if (error) throw error;
    setupForm.reset();
    location.replace('./#all');
  } catch {
    message.textContent = '密码暂时无法保存。请重试，或重新打开邀请链接。';
    button.disabled = false;
  }
});

document.querySelector('#signout').onclick = async () => {
  const { error } = await client.auth.signOut({scope:'local'});
  if (error) message.textContent = '退出失败，请重试。';
  else message.textContent = '';
};
importer.addEventListener('change', async () => {
  const file = importer.files[0];
  if (!client || !file || importInProgress) return;
  importInProgress = true;
  requests++;
  importer.disabled = true;
  try {
    const response = await client.auth.getUser();
    if (response.error || response.data.user?.id !== migrationOwner) throw new Error('Wrong account');
    const { importLegacy } = await import('./migration.js');
    message.textContent = '正在迁入旧行程与附件…';
    await importLegacy(await file.text(), response.data.user);
    importInProgress = false;
    await loadTrips();
  } catch {
    message.textContent = '迁入未完成。请确认使用原账号和正确的迁移文件。可用同一份文件重试。';
  } finally {
    importInProgress = false;
    importer.disabled = false;
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
