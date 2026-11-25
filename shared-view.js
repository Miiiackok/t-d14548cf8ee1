import {client,readTravelShare} from './cloud.js';
import {flagEmoji} from './calendar-tools.js';
import {shortDate} from './calendar-view.js';

const token = location.hash.slice(1);
const title = document.querySelector('h1');
const status = document.querySelector('#shared-status');
const login = document.querySelector('#shared-login');
const schedule = document.querySelector('#shared-days');

async function read() {
  if (!/^[0-9a-f]{64}$/.test(token)||!client) {
    status.textContent='分享链接不可用。';
    return;
  }
  try {
    const data=await readTravelShare(token);
    if (!data) {
      status.textContent='这个链接不可用，或需要获邀账号登录。';
      login.hidden=false;
      return;
    }
    login.hidden=true;
    title.textContent=data.city && data.country_code ? flagEmoji(data.country_code)+' - '+data.city : data.name;
    status.textContent=shortDate(data.start)+' – '+shortDate(data.end)+' · 只读行程';
    schedule.replaceChildren(...data.days.map(day=>{
      const section=document.createElement('section');
      const heading=document.createElement('h2');
      heading.textContent=shortDate(day.date);
      section.append(heading);
      if (day.stops.length) {
        const list=document.createElement('ul');
        for (const stop of day.stops) {
          const item=document.createElement('li');
          const time=document.createElement('span');
          time.textContent=stop.time||'时间待定';
          item.append(time,document.createTextNode(stop.name));
          list.append(item);
        }
        section.append(list);
      } else {
        const empty=document.createElement('p');
        empty.textContent='当天暂无安排。';
        section.append(empty);
      }
      return section;
    }));
  } catch { status.textContent='暂时无法读取行程，请稍后再试。'; }
}
login.onsubmit=async event=>{
  event.preventDefault();
  const button=event.submitter;
  const {email,password}=Object.fromEntries(new FormData(login));
  button.disabled=true;
  try {
    const {error}=await client.auth.signInWithPassword({email,password});
    if (error) throw error;
    login.reset();
    await read();
  } catch { status.textContent='登录失败，请检查获邀邮箱和密码。'; }
  finally { button.disabled=false; }
};
read();
