
    let trips = [];
    const dayMs = 86400000;
    const dayKey = date => date.toISOString().slice(0, 10);
    const dateAt = (year, month, day) => new Date(Date.UTC(year, month, day));
    const shift = (date, days) => new Date(date.getTime() + days * dayMs);
    const shortDate = key => Number(key.slice(5, 7)) + '月' + Number(key.slice(8, 10)) + '日';
    const monthLabel = document.querySelector('#month-label');
    const weeks = document.querySelector('#weeks');
    const tripList = document.querySelector('#trips');
    const today = new Date();
    let shownMonth = dateAt(today.getFullYear(), today.getMonth(), 1);

    function makeTripLink(trip, className) {
      const link = document.createElement('a');
      link.className = className;
      link.href = trip.url;
      link.style.setProperty('--trip-color', trip.color);
      link.setAttribute('aria-label', trip.name + '，' + shortDate(trip.start) + '至' + shortDate(trip.end) + '，打开行程');
      return link;
    }

    function render() {
      const year = shownMonth.getUTCFullYear();
      const month = shownMonth.getUTCMonth();
      const last = dateAt(year, month + 1, 0);
      const firstWeek = shift(shownMonth, -((shownMonth.getUTCDay() + 6) % 7));
      const monthTrips = trips.filter(trip => trip.start <= dayKey(last) && trip.end >= dayKey(shownMonth));
      monthLabel.textContent = year + ' 年 ' + (month + 1) + ' 月';
      weeks.replaceChildren();
      tripList.replaceChildren();
      const labeled = new Set();
      for (let first = firstWeek; first <= last; first = shift(first, 7)) {
        const week = document.createElement('div');
        week.className = 'week';
        const days = Array.from({length:7}, (_, i) => shift(first, i));
        for (const date of days) {
          const cell = document.createElement('div');
          cell.className = 'day' + (date.getUTCMonth() === month ? '' : ' overflow-day');
          cell.textContent = date.getUTCDate();
          cell.setAttribute('aria-label', shortDate(dayKey(date)));
          week.appendChild(cell);
        }
        const lanes = [];
        for (const trip of monthTrips) {
          const columns = days.flatMap((date, i) => {
            const key = dayKey(date);
            return date.getUTCMonth() === month && key >= trip.start && key <= trip.end ? [i] : [];
          });
          if (!columns.length) continue;
          const start = columns[0], finish = columns.at(-1);
          let lane = lanes.findIndex(entries => entries.every(([from, to]) => finish < from || start > to));
          if (lane < 0) lane = lanes.push([]) - 1;
          lanes[lane].push([start, finish]);
          const mark = makeTripLink(trip, 'mark');
          mark.style.setProperty('--start', start);
          mark.style.setProperty('--length', columns.length);
          mark.style.setProperty('--lane', lane);
          if (!labeled.has(trip)) mark.textContent = trip.name;
          labeled.add(trip);
          week.appendChild(mark);
        }
        if (lanes.length > 1) {
          week.style.setProperty('--row-height', 27 + lanes.length * 33 + 'px');
          week.style.setProperty('--mobile-row-height', 27 + lanes.length * 33 + 'px');
        }
        weeks.appendChild(week);
      }
      for (const trip of monthTrips) {
        const link = makeTripLink(trip, 'trip');
        const swatch = document.createElement('i');
        swatch.className = 'swatch';
        swatch.setAttribute('aria-hidden', 'true');
        const name = document.createElement('strong');
        name.textContent = trip.name;
        const range = document.createElement('span');
        range.textContent = shortDate(trip.start) + ' – ' + shortDate(trip.end);
        if (trip.location && trip.location.split(' · ')[0] !== trip.name) {
          const meta = document.createElement('span');
          meta.className = 'trip-meta';
          meta.textContent = trip.location;
          name.append(meta);
        }
        link.append(swatch, name, range);
        tripList.appendChild(link);
      }
    }
    function switchMonth(offset) {
      selectedMonth = true;
      shownMonth = dateAt(shownMonth.getUTCFullYear(), shownMonth.getUTCMonth() + offset, 1);
      render();
    }
    document.querySelector('#prev').addEventListener('click', () => switchMonth(-1));
    document.querySelector('#next').addEventListener('click', () => switchMonth(1));
    render();
  
import { client, createTrip, listTrips, migrationOwner } from './cloud.js';
import { allowRegistration } from './config.js';
import { installTripForm } from './trip-form.js';

const auth = document.querySelector('#account');
const tripForm = document.querySelector('#new-trip');
const message = document.querySelector('#app-message');
const calendar = document.querySelector('.calendar');
const controls = document.querySelector('#calendar-controls');
const importer = document.querySelector('#legacy-import');
const tripEditor = installTripForm(tripForm,async()=>{
  const response = await fetch('./places.json');
  if (!response.ok) throw new Error('Place catalogue unavailable');
  return response.json();
});
auth.querySelector('[value=register]').hidden = !allowRegistration;
let accountId = null;
let requests = 0;
let selectedMonth = false;

async function renderAccount(session) {
  const user = session?.user;
  const changed = accountId !== user?.id;
  if (changed) {
    requests++;
    trips = [];
    tripList.replaceChildren();
    accountId = user?.id || null;
    selectedMonth = false;
  }
  auth.hidden = Boolean(user);
  calendar.hidden = !user;
  controls.hidden = !user;
  tripList.hidden = !user;
  importer.closest('label').hidden = !user || user.id !== migrationOwner;
  if (user) await loadTrips();
}

async function loadTrips() {
  if (!accountId) return;
  const request = ++requests;
  try {
    const records = await listTrips();
    if (request !== requests) return;
    trips = records.map(record => ({
      name: record.name,
      start: record.start_date,
      end: record.end_date,
      color: record.color,
      location: record.country_code ? [record.city,new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(record.country_code)].filter(Boolean).join(' · ') : '',
      url: './trip.html?id=' + record.id + '#all'
    }));
    if (!selectedMonth && trips.length) {
      const today = dayKey(new Date());
      const next = trips.find(trip => trip.end >= today) || trips.at(-1);
      shownMonth = new Date(next.start.slice(0, 7) + '-01T00:00:00Z');
      selectedMonth = true;
    }
    render();
    message.textContent = trips.length ? '' : '添加第一段旅行，日历会画出对应的彩色横线。';
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
document.querySelector('#add-trip').onclick = () => {
  tripEditor.reset();
  tripForm.querySelector('[role=status]').textContent = '';
  tripForm.closest('dialog').showModal();
};
document.querySelector('#cancel-trip').onclick = () => tripForm.closest('dialog').close();

tripForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = tripEditor.values();
  if (!values) return;
  const status = tripForm.querySelector('[role=status]');
  if (!values.name || values.end_date < values.start_date) {
    status.textContent = '请填写旅行名称，并确保结束日期不早于开始日期。';
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  try {
    const trip = await createTrip(values);
    shownMonth = new Date(trip.start_date.slice(0,7) + '-01T00:00:00Z');
    selectedMonth = true;
    tripForm.closest('dialog').close();
    button.disabled = false;
    await loadTrips();
  } catch {
    status.textContent = '保存失败。请检查网络和日期，旅行最多 366 天。';
    button.disabled = false;
  }
});

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
