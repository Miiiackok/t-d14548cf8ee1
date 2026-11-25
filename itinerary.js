
export function startItinerary(trip, store) {
  const bu = store.url;
  const monthDay = date => Number(date.slice(5,7)) + '.' + date.slice(8,10);
  const safeUrl = value => /^https:\/\//i.test(value||'') ? String(value).replace(/[<>"']/g, encodeURIComponent) : '#';
  function emptyDays() {
    const days = [];
    const formatter = new Intl.DateTimeFormat('zh-CN', {timeZone:'UTC',weekday:'short'});
    const start = Date.parse(trip.start_date + 'T00:00:00Z');
    const end = Date.parse(trip.end_date + 'T00:00:00Z');
    for (let time = start; time <= end; time += 86400000) {
      const date = new Date(time);
      const key = date.toISOString().slice(0,10);
      days.push({id:'day-'+key,n:key.slice(8,10),wd:formatter.format(date),date:key,
        title:monthDay(key) + ' 行程',lede:'',stops:[],route:[]});
    }
    return days;
  }
  const DAYS=trip.itinerary.days||emptyDays();
  const SLOTS=trip.itinerary.slots||{other:{g:'其他',k:'票据',t:'上传票据和照片'}};
  const TODO=trip.itinerary.todo||[];
  document.title=trip.name+' · 我的旅行日历';
const MODE={'1':'#ee352e','7':'#b933ad',E:'#0039a6',C:'#0039a6',A:'#0039a6',F:'#ff6319',B:'#ff6319',R:'#fccc0a',W:'#fccc0a'};
const MODEB={w:['步行','#6d757b'],ferry:['渡轮','#0a7f8f'],tram:['缆车','#c1272d'],nj:['NJ Transit','#55606a'],air:['AirTrain','#55606a'],bus:['FlixBus','#3b8f1d']};
/* ---------- store ---------- */
let photos={}, curView='all', db=null, assets=null, ready=false, tickets=[], notes={}, todo={}, mapUrl='', busy={}, errs={}, target=null, plans=[], planDraft=null;
const $=s=>document.querySelector(s);
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const okMap=u=>/^https:\/\/(www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(u||'');
function refreshSlots(){
  document.querySelectorAll('[data-slot]').forEach(el=>{el.innerHTML=slotInner(el.dataset.slot,el.dataset.full==='1')});
  const m=$('#meter'); if(m) m.textContent=meterText();
  const g=$('#gmapAll'); if(g) g.innerHTML=allMapHtml();
  document.querySelectorAll('[data-ph]').forEach(el=>{el.innerHTML=photoHtml(el.dataset.ph)});
  document.querySelectorAll('[data-pa]').forEach(el=>{el.innerHTML=phActs(el.dataset.pa)});
}
function meterText(){const need=Object.keys(SLOTS).filter(k=>k!=='other'&&k!=='philly'&&!SLOTS[k].archived);const have=need.filter(k=>tickets.some(t=>t.slot===k)).length;return `放好了 ${have} / ${need.length}`}

async function boot(){
  db=store.db; assets=store.assets;
  const timer=setTimeout(()=>{if(!ready){errs._load='票据暂时读不到，检查一下网络。';route()}},10000);
  db.collection('tickets').orderBy('addedAt').onSnapshot(s=>{
    tickets=s.docs.map(d=>({id:d.id,...d.data()}));
    if(!s.metadata.fromCache){ready=true;clearTimeout(timer);delete errs._load}
    refreshSlots();
  },e=>{errs._load='票据读取失败，刷新页面再试。';refreshSlots()});
  db.collection('photos').onSnapshot(s=>{photos={};s.docs.forEach(d=>photos[d.id]=d.data());refreshSlots()},()=>{});
  db.collection('notes').onSnapshot(s=>{notes={};s.docs.forEach(d=>notes[d.id]=d.data().text||'');
    document.querySelectorAll('textarea[data-note]').forEach(t=>{if(document.activeElement!==t)t.value=notes[t.dataset.note]||''})},()=>{});
  db.doc('state/todo').onSnapshot(s=>{todo=s.exists?{...s.data()}:{};document.querySelectorAll('[data-k]').forEach(c=>c.checked=!!todo[c.dataset.k])},()=>{});
  db.doc('state/map').onSnapshot(s=>{mapUrl=s.exists?(s.data().url||''):'';refreshSlots();const i=$('#mapUrl');if(i&&document.activeElement!==i)i.value=mapUrl},()=>{});
  db.collection('stopEdits').onSnapshot(snapshot=>{
    const next={};snapshot.docs.forEach(doc=>{if(originalStop(doc.id))next[doc.id]=doc.data()});
    if(JSON.stringify(next)===JSON.stringify(stopEdits))return;
    stopEdits=next;
    const selected=DAYS.find(day=>day.id===curView);if(selected)showDay(selected);
  });
  db.collection('plans').onSnapshot(s=>{
    plans=s.docs.map(d=>({id:d.id,...d.data()})).filter(p=>typeof p.name==='string');
    renderPlanList();
    const day=DAYS.find(d=>d.id===curView);if(day)showDay(day);
  });
  route();
}

/* Places can stay undated, then become extra stops without changing the original itinerary. */
function planTime(value){
  const match=/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?$/.exec(String(value||''));
  return match?match[1].padStart(2,'0')+':'+match[2]:'';
}
function dayStops(d){
  const extra=plans.filter(p=>p.day===d.id).map(p=>({t:planTime(p.time)||'时间待定',n:p.name,addr:p.address||'',q:p.address||p.name,d:p.note||'',custom:true,planId:p.id}));
  return [...ORIGINAL_STOPS.map(resolvedStop).filter(stop=>stop.day===d.id),...extra].map((s,i)=>({s,i})).sort((a,b)=>{
    const time=s=>stopTime(s)||'99:99';
    return time(a.s).localeCompare(time(b.s))||a.i-b.i;
  }).map(x=>x.s);
}
function planForm(p={}){
  const time=planTime(p.time),[hour,minute]=time?time.split(':'):['',''];
  const choices=(count,selected)=>Array.from({length:count},(_,i)=>String(i).padStart(2,'0')).map(v=>`<option value="${v}"${selected===v?' selected':''}>${v}</option>`).join('');
  return `<form id="plan-form" class="plan-form" data-edit-id="${esc(p.id||'')}" novalidate>
    <h2 id="plan-form-title">${p.id?'编辑地点':'记下一个想去的地方'}</h2>
    <label for="plan-name">地点或活动 <span class="plan-required">必填</span></label>
    <input id="plan-name" name="name" required aria-describedby="plan-message" maxlength="160" placeholder="比如：一家书店、一场展览" value="${esc(p.name||'')}">
    <label for="plan-address">地址 <span>选填</span></label>
    <input id="plan-address" name="address" maxlength="500" placeholder="地址或区域，方便之后导航" value="${esc(p.address||'')}">
    <label for="plan-note">备注 <span>选填</span></label>
    <textarea id="plan-note" name="note" rows="3" maxlength="3000" placeholder="想做什么、推荐理由、要提前预约的事…">${esc(p.note||'')}</textarea>
    <details${p.day?' open':''}><summary>安排到某一天 <span>可以以后再定</span></summary>
      <div class="plan-schedule"><div><label for="plan-day">日期</label><select id="plan-day" name="day"><option value="">先放在待安排</option>${DAYS.map(d=>`<option value="${d.id}"${p.day===d.id?' selected':''}>${monthDay(d.date)} ${d.wd}</option>`).join('')}</select></div>
      <fieldset class="plan-clock"${p.day?'':' disabled'}><legend>时间 <span>选填 · 24 小时制</span></legend><div class="plan-clock-fields">
        <select id="plan-hour" name="hour" aria-label="小时" aria-describedby="plan-message"><option value="">时</option>${choices(24,hour)}</select><span aria-hidden="true">:</span>
        <select id="plan-minute" name="minute" aria-label="分钟" aria-describedby="plan-message"><option value="">分</option>${choices(60,minute)}</select></div>
        <button class="lk sm" type="button" data-plan-action="clear-time">时间待定</button></fieldset></div>
    </details>
    <div class="plan-actions"><button class="cta" type="submit"${db?'':' disabled'}>${p.id?'保存修改':'加入想去清单'}</button>${p.id?'<button class="lk" type="button" data-plan-action="cancel">取消编辑</button>':''}</div>
    <p id="plan-message" class="hint" role="status">${db?'':'正在读取账号数据…'}</p>
  </form>`;
}
function renderPlanList(){
  const host=$('#plan-lists');if(!host)return;
  const pending=plans.filter(p=>!DAYS.some(d=>d.id===p.day)),scheduled=plans.filter(p=>DAYS.some(d=>d.id===p.day));
  scheduled.sort((a,b)=>a.day.localeCompare(b.day)||(planTime(a.time)||'99:99').localeCompare(planTime(b.time)||'99:99'));
  const card=p=>{const day=DAYS.find(d=>d.id===p.day);return `<article class="card plan-card"><div class="k">${day?`${monthDay(day.date)} ${day.wd} · ${esc(planTime(p.time)||'时间待定')}`:'还没定时间'}</div><h3>${esc(p.name)}</h3>${p.address?`<p>${esc(p.address)}</p>`:''}${p.note?`<p class="plan-note">${esc(p.note)}</p>`:''}<div class="links"><button class="lk" type="button" data-plan-action="edit" data-plan-id="${esc(p.id)}">${day?'编辑 / 调整日期':'编辑 / 安排日期'}</button>${day?`<a class="lk" href="#${day.id}">查看当天行程</a>`:''}<a class="lk" href="https://www.google.com/maps/search/?api=1&query=${enc(p.address||p.name)}" target="_blank" rel="noopener">地图</a><button class="del" type="button" data-plan-action="delete" data-plan-id="${esc(p.id)}">删除</button></div></article>`};
  host.innerHTML=`<section class="group"><h2>待安排 <span class="plan-count">${pending.length}</span></h2>${pending.length?pending.map(card).join(''):'<p class="plan-empty">想去的地方先记在这里，不用急着选时间。</p>'}</section>${scheduled.length?`<section class="group"><h2>已安排 <span class="plan-count">${scheduled.length}</span></h2>${scheduled.map(card).join('')}</section>`:''}`;
}
function showPlans(){
  panel.innerHTML=`<header class="plain"><h1>想去的地方</h1><p class="sub">先收集灵感，什么时候去，以后再定。</p><p class="hint plan-local">保存在你的账号里，可在其他设备查看。</p></header><div id="plan-editor">${planForm(planDraft||{})}</div><div id="plan-lists"></div>`;
  renderPlanList();
}
document.addEventListener('change',e=>{
  if(e.target.id==='plan-day'){
    const clock=$('.plan-clock');clock.disabled=!e.target.value;
    if(clock.disabled){$('#plan-hour').value='';$('#plan-minute').value=''}
  }
  if(e.target.id==='plan-hour'&&e.target.value&&!$('#plan-minute').value)$('#plan-minute').value='00';
});
document.addEventListener('submit',async e=>{
  const f=e.target;if(f.id!=='plan-form')return;e.preventDefault();
  const message=$('#plan-message'),name=f.elements.name.value.trim();
  f.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
  if(!name){message.textContent='请先写一个地点或活动名称。';f.elements.name.setAttribute('aria-invalid','true');f.elements.name.focus();return}
  if(!db){message.textContent='账号数据还没准备好，请稍后再试。';return}
  const day=f.elements.day.value,hour=f.elements.hour.value,minute=f.elements.minute.value;
  if(day&&(hour!==''||minute!=='')&&(hour===''||minute==='')){
    message.textContent='请同时选择小时和分钟，或点“时间待定”。';
    const missing=hour===''?f.elements.hour:f.elements.minute;missing.setAttribute('aria-invalid','true');missing.focus();return;
  }
  const time=day&&hour!==''?planTime(hour+':'+minute):'';
  const old=plans.find(p=>p.id===f.dataset.editId);
  const value={name,address:f.elements.address.value.trim(),note:f.elements.note.value.trim(),day,time,addedAt:old?.addedAt||new Date().toISOString()};
  const button=f.querySelector('[type="submit"]');button.disabled=true;message.textContent='正在保存…';
  try{
    const ref=db.collection('plans').doc(f.dataset.editId||undefined);await ref.set(value);
    planDraft=null;
    if($('#plan-form')!==f)return;
    $('#plan-editor').innerHTML=planForm();
    $('#plan-message').textContent=day?'已加入当天行程，之后仍可调整。':'已加入待安排，想好时间再安排。';
  }catch(err){message.textContent='保存失败，内容还在，请重试。';button.disabled=false}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-plan-action]');if(!b)return;
  const action=b.dataset.planAction,p=plans.find(x=>x.id===b.dataset.planId);
  if(action==='clear-time'){$('#plan-hour').value='';$('#plan-minute').value='';$('#plan-message').textContent='时间可以以后再定。';return}
  if(action==='new'){
    planDraft={day:b.dataset.planDay||''};
    if(curView!=='plans'){location.hash='plans';route()}
    $('#plan-editor').innerHTML=planForm(planDraft);$('#plan-name').focus();return;
  }
  if(action==='cancel'){planDraft=null;$('#plan-editor').innerHTML=planForm();return}
  if(action==='edit'&&p){
    planDraft=p;
    if(curView!=='plans'){location.hash='plans';route()}
    $('#plan-editor').innerHTML=planForm(p);$('#plan-name').focus();$('#plan-editor').scrollIntoView({block:'start'});return;
  }
  if(action==='delete'&&p&&db){
    if(b.dataset.confirm!=='yes'){b.dataset.confirm='yes';b.textContent='再点一次删除';setTimeout(()=>{b.dataset.confirm='';b.textContent='删除'},4000);return}
    b.disabled=true;
    try{await db.doc('plans/'+p.id).delete();if($('#plan-form')?.dataset.editId===p.id){planDraft=null;$('#plan-editor').innerHTML=planForm()}}
    catch(err){b.disabled=false;b.textContent='删除失败，再试一次'}
  }
});

/* Existing stops keep stable IDs; edits are separate, device-local patches. */
const ORIGINAL_STOPS=DAYS.flatMap(day=>day.stops.map(stop=>({...stop,baseId:stop.stopId,baseDay:day.id})));
let stopEdits={};
const originalStop=id=>ORIGINAL_STOPS.find(stop=>stop.baseId===id);
const transportText=stop=>(stop.how||[]).map(value=>Array.isArray(value)?(MODEB[value[0]]?.[0]||value[0]+' 线'):value).join(' · ');
function editableValues(stop){
  return {name:stop.n,en:stop.en||'',address:stop.addr||'',note:stop.d||'',day:stop.day||stop.baseDay,time:stop.t||'',transport:transportText(stop),mode:stop.mode||'transit'};
}
function resolvedStop(base){
  const change=stopEdits[base.baseId];
  if(!change)return {...base,day:base.baseDay};
  const text=(key,fallback)=>typeof change[key]==='string'?change[key]:fallback;
  const name=text('name',base.n),address=text('address',base.addr||'');
  const day=DAYS.some(d=>d.id===change.day)?change.day:base.baseDay;
  const result={...base,n:name,en:text('en',base.en||''),addr:address,d:text('note',base.d||''),
    t:text('time',base.t)||'时间待定',day,edited:true,mode:text('mode',base.mode||'transit')};
  if(typeof change.transport==='string')result.how=change.transport?[change.transport]:undefined;
  if(name!==base.n||address!==(base.addr||'')){
    result.q=address||name;
    // Original coordinates belong to the old destination.
    delete result.ll;
  }
  return result;
}
function originalDayChanged(day){
  return ORIGINAL_STOPS.some(base=>{
    const edit=stopEdits[base.baseId];
    return edit&&(base.baseDay===day.id||edit.day===day.id);
  })||plans.some(plan=>plan.day===day.id);
}
function routePlaces(day){
  if(!originalDayChanged(day))return day.route;
  return dayStops(day).filter(stop=>stop.q&&!stop.k).map(stop=>stop.q);
}
function stopToast(message){
  let toast=$('#stop-toast');
  if(!toast){toast=document.createElement('p');toast.id='stop-toast';toast.className='stop-toast';toast.setAttribute('role','status');document.body.appendChild(toast)}
  toast.textContent=message;toast.hidden=false;
  clearTimeout(stopToast.timer);stopToast.timer=setTimeout(()=>toast.hidden=true,4500);
}
function stopEditor(id){
  const base=originalStop(id);if(!base)return;
  const current=resolvedStop(base),value=editableValues(current);
  let dialog=$('#stop-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='stop-dialog';dialog.className='stop-dialog';dialog.setAttribute('aria-labelledby','stop-edit-heading');document.body.appendChild(dialog)}
  dialog.innerHTML=`<form id="stop-edit-form" class="plan-form" data-stop-id="${esc(id)}" novalidate>
    <div class="stop-editor-head"><h2 id="stop-edit-heading">编辑行程</h2><button class="lk" type="button" data-stop-action="cancel">关闭</button></div>
    <p class="stop-local">修改保存到你的账号。可随时恢复原安排。</p>
    <label for="stop-name">地点或活动 <span>必填</span></label>
    <input id="stop-name" name="name" maxlength="160" required value="${esc(value.name)}">
    <div class="stop-editor-grid"><div><label for="stop-day">日期</label><select id="stop-day" name="day">${DAYS.map(day=>`<option value="${day.id}"${day.id===value.day?' selected':''}>${monthDay(day.date)} ${day.wd}</option>`).join('')}</select></div>
    <div><label for="stop-time">时间</label><input id="stop-time" name="time" maxlength="40" placeholder="如 09:30 或时间待定" value="${esc(value.time)}"></div></div>
    <label for="stop-en">副标题 / 英文名称 <span>选填</span></label><input id="stop-en" name="en" maxlength="200" value="${esc(value.en)}">
    <label for="stop-address">地址 <span>选填</span></label><input id="stop-address" name="address" maxlength="500" value="${esc(value.address)}">
    <label for="stop-transport">交通 / 到达方式 <span>选填</span></label><input id="stop-transport" name="transport" maxlength="600" value="${esc(value.transport)}">
    <label for="stop-mode">导航方式</label><select id="stop-mode" name="mode">${[['transit','公共交通'],['walking','步行'],['driving','驾车']].map(([mode,label])=>`<option value="${mode}"${mode===value.mode?' selected':''}>${label}</option>`).join('')}</select>
    <label for="stop-note">备注 <span>选填</span></label><textarea id="stop-note" name="note" rows="4" maxlength="3000">${esc(value.note)}</textarea>
    <div class="plan-actions stop-editor-actions"><button class="cta" type="submit"${db?'':' disabled'}>保存修改</button><button class="lk" type="button" data-stop-action="cancel">取消</button>${stopEdits[id]?'<button class="lk" type="button" data-stop-action="reset">恢复原安排</button>':''}</div>
    <p class="hint" id="stop-message" role="status">${db?'':'正在读取账号数据…'}</p>
  </form>`;
  dialog.showModal();
}
function closeStopEditor(day,id,message){
  $('#stop-dialog')?.close();
  if(curView!==day){location.hash=day;route()}
  else {const selected=DAYS.find(d=>d.id===curView);if(selected)showDay(selected)}
  document.querySelector(`[data-stop-action="edit"][data-stop-id="${id}"]`)?.focus();
  stopToast(message);
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-stop-action]');if(!button)return;
  const action=button.dataset.stopAction;
  if(action==='edit'){stopEditor(button.dataset.stopId);return}
  if(action==='cancel'){$('#stop-dialog')?.close();return}
  if(action!=='reset'||!db)return;
  const form=$('#stop-edit-form'),base=originalStop(form?.dataset.stopId);if(!base)return;
  const message=$('#stop-message');button.disabled=true;
  try{await db.doc('stopEdits/'+base.baseId).delete();closeStopEditor(base.baseDay,base.baseId,'已恢复原安排。')}
  catch(error){message.textContent='恢复失败，请重试。';button.disabled=false}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='stop-edit-form')return;event.preventDefault();
  const base=originalStop(form.dataset.stopId),message=$('#stop-message');if(!base)return;
  if(!db){message.textContent='账号数据还没准备好，请稍后再试。';return}
  const values=Object.fromEntries(new FormData(form));
  for(const key of Object.keys(values))values[key]=values[key].trim();
  form.querySelectorAll('[aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  if(!values.name){message.textContent='请填写地点或活动名称。';form.elements.name.setAttribute('aria-invalid','true');form.elements.name.focus();return}
  const timeMatch=/^(\d{1,2}):(\d{2})$/.exec(values.time);
  if(timeMatch){
    const normalized=planTime(values.time);
    if(!normalized){message.textContent='请使用有效的 24 小时时间，如 15:30。';form.elements.time.setAttribute('aria-invalid','true');form.elements.time.focus();return}
    values.time=normalized;
  }
  if(!DAYS.some(day=>day.id===values.day)){message.textContent='请选择行程日期。';return}
  const defaults=editableValues({...base,day:base.baseDay}),changes={};
  for(const key of Object.keys(defaults))if(values[key]!==defaults[key])changes[key]=values[key];
  const save=form.querySelector('[type="submit"]');
  form.querySelectorAll('button').forEach(button=>button.disabled=true);message.textContent='正在保存…';
  try{
    const ref=db.doc('stopEdits/'+base.baseId);
    if(Object.keys(changes).length)await ref.set({...changes,updatedAt:new Date().toISOString()});
    else await ref.delete();
    closeStopEditor(values.day,base.baseId,'修改已同步到你的账号。');
  }catch(error){message.textContent='保存失败，内容还在，请重试。';form.querySelectorAll('button').forEach(button=>button.disabled=false);save.disabled=false}
});

/* ---------- tickets ---------- */
function tkBtn(t){
  const img=(t.type||'').startsWith('image/');
  return `<span class="tkw"><button class="tk" type="button" data-act="view" data-id="${t.id}"><i>${img?`<img src="${bu(t.asset)}" alt="">`:'PDF'}</i><span>${esc(t.name)}</span><em>打开</em></button></span>`;
}
function slotInner(k,full){
  const list=tickets.filter(t=>t.slot===k);
  const put=assets?`<button class="lk" type="button" data-act="put" data-slot-id="${k}">${list.length?'再放一份':'放票'}</button>`:'';
  const b=busy[k]?`<span class="busy">正在上传…</span>`:'';
  const er=errs[k]?`<div class="err">${esc(errs[k])}</div>`:'';
  if(full) return `<div class="files">${list.map(t=>`<div class="frow">${tkBtn(t)}${assets?`<button class="del" type="button" data-act="del" data-id="${t.id}">删除</button>`:''}</div>`).join('')}</div><div class="links">${put}${b}</div>${er}`;
  return list.map(tkBtn).join('')+put+b+er;
}
async function shrink(f){
  try{const u=URL.createObjectURL(f),im=new Image();
    await new Promise((a,b)=>{im.onload=a;im.onerror=b;im.src=u});
    const s=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');
    c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);
    return await new Promise(r=>c.toBlob(b=>r(b||f),'image/jpeg',.85));
  }catch(e){return f}
}
async function putPhoto(id,f){
  const k='ph'+id; busy[k]=true; delete errs[k]; refreshSlots();
  try{const old=photos[id],r=await assets.upload(await shrink(f));
    await db.doc('photos/'+id).set({asset:r.id,addedAt:new Date().toISOString()});
    if(old){try{await assets.delete(old.asset)}catch(e){}}
  }catch(err){errs[k]=msgFor(err)}
  delete busy[k]; refreshSlots(); if(errs[k]) route();
}
function msgFor(e){
  const c=e&&e.code;
  if(c==='too_large') return '文件太大，单个上限 20 MB。';
  if(c==='unsupported_type') return '这个格式放不进来，请用 PDF、JPG 或 PNG。';
  if(c==='quota_or_state') return '存储空间满了，删掉一些再放。';
  if(c==='rate_limited') return '操作太快，等一下再试。';
  return '没有放成功，检查网络后再试一次。';
}
$('#pick').onchange=async e=>{
  const files=[...e.target.files]; e.target.value=''; const k=target; if(!k||!files.length) return;
  if(k.startsWith('photo:')){await putPhoto(k.slice(6),files[0]);return}
  busy[k]=true; delete errs[k]; refreshSlots();
  for(const f of files){
    try{
      const r=await assets.upload(f);
      await db.collection('tickets').add({slot:k,asset:r.id,name:f.name,type:r.contentType,addedAt:new Date().toISOString()});
    }catch(err){errs[k]=`${f.name}：${msgFor(err)}`}
  }
  delete busy[k]; refreshSlots();
};
$('#imp').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const m=()=>$('#impMsg'), say=s=>{const x=m();if(x)x.textContent=s};
  try{say('正在导入…');const j=JSON.parse(await f.text());let n=0;
    for(const k of j.tickets){ if(tickets.some(t=>t.slot===k.slot&&t.name===k.name)) continue;
      const bin=atob(k.b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
      const r=await assets.upload(new Blob([u],{type:k.type}));
      await db.collection('tickets').add({slot:k.slot,asset:r.id,name:k.name,type:k.type,addedAt:new Date().toISOString()});n++}
    say(`放好了 ${n} 份`);
  }catch(err){say('这个文件导入不了。')}
};
let delArm=null;
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.dataset.act;
  if(act==='put'){const p=$('#pick');p.accept='image/*,application/pdf';p.multiple=true;target=b.dataset.slotId;p.click()}
  if(act==='photo'){const p=$('#pick');p.accept='image/*';p.multiple=false;target='photo:'+b.dataset.day;p.click()}
  if(act==='unphoto'){const id=b.dataset.day;
    if(delArm!=='ph'+id){delArm='ph'+id;b.textContent='确认恢复';setTimeout(()=>{if(delArm==='ph'+id){delArm=null;b.textContent='恢复插画'}},4000);return}
    delArm=null;const old=photos[id];try{await db.doc('photos/'+id).delete();if(old)await assets.delete(old.asset)}catch(err){}}
  if(act==='copya'){const t=b.dataset.text,lab=b.querySelector('b');
    const done=()=>{lab.textContent='已复制';setTimeout(()=>lab.textContent='复制',1500)};
    const fail=()=>{const r=document.createRange();r.selectNodeContents(b.querySelector('span'));const s=getSelection();s.removeAllRanges();s.addRange(r);lab.textContent='长按复制'};
    try{navigator.clipboard.writeText(t).then(done).catch(fail)}catch(err){fail()}}
  if(act==='import') $('#imp').click();
  if(act==='view') openTicket(tickets.find(t=>t.id===b.dataset.id));
  if(act==='del'){
    const id=b.dataset.id;
    if(delArm!==id){delArm=id;b.textContent='确认删除';setTimeout(()=>{if(delArm===id){delArm=null;b.textContent='删除'}},4000);return}
    delArm=null; const t=tickets.find(x=>x.id===id); if(!t) return;
    try{await assets.delete(t.asset);await db.doc('tickets/'+id).delete()}catch(err){errs[t.slot]='删除失败，再试一次。';refreshSlots()}
  }
  if(act==='copy'){const t=b.dataset.text,done=()=>{b.textContent='已复制';setTimeout(()=>b.textContent='复制地址',1500)};
    try{navigator.clipboard.writeText(t).then(done).catch(()=>{b.textContent=t})}catch(err){b.textContent=t}}
  if(act==='savemap'){const v=$('#mapUrl').value.trim(),m=$('#mapMsg');
    if(v&&!okMap(v)){m.textContent='这不是 Google 地图的链接。';return}
    try{await db.doc('state/map').set({url:v});m.textContent=v?'已保存，总览页会出现入口。':'已清除。'}catch(err){m.textContent='保存失败，再试一次。'}}
});
document.addEventListener('change',async e=>{
  const c=e.target;
  if(c.dataset.k){todo={...todo,[c.dataset.k]:c.checked}; if(db){try{await db.doc('state/todo').set(todo)}catch(err){}}}
  if(c.dataset.note!=null){const k=c.dataset.note; if(db){try{await db.doc('notes/'+k).set({text:c.value})}catch(err){}}}
});

/* full-screen viewer; PDFs draw to canvas so they open in place on a phone */
let pdfLib=null;
function loadPdf(){
  if(pdfLib) return pdfLib;
  const add=s=>new Promise((ok,no)=>{const x=document.createElement('script');x.src=s;x.onload=ok;x.onerror=no;document.head.appendChild(x)});
  const base='vendor/';
  pdfLib=add(base+'pdf.min.js').then(()=>add(base+'pdf.worker.min.js')).then(()=>window.pdfjsLib);
  return pdfLib;
}
async function openTicket(t){
  if(!t) return;
  const v=$('#view'), url=bu(t.asset), pdf=(t.type||'').includes('pdf');
  v.innerHTML=`<header><strong>${esc(t.name)}</strong><button type="button" id="vClose">关闭</button></header><div class="body" id="vBody">${pdf?'<div class="msg">正在打开…</div>':`<img src="${url}" alt="${esc(t.name)}">`}</div>`;
  v.hidden=false; $('#vClose').onclick=()=>{v.hidden=true;v.innerHTML=''};
  if(!pdf) return;
  try{
    const lib=await loadPdf(), buf=await (await fetch(url)).arrayBuffer();
    const doc=await lib.getDocument({data:buf,isEvalSupported:false}).promise, body=$('#vBody');
    if(!body) return; body.innerHTML='';
    for(let i=1;i<=doc.numPages;i++){
      const p=await doc.getPage(i), w=Math.min(body.clientWidth-20,900), s0=p.getViewport({scale:1}), sc=w/s0.width*Math.min(window.devicePixelRatio||1,2.5), vp=p.getViewport({scale:sc});
      const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;c.style.width=w+'px';body.appendChild(c);
      await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    }
  }catch(err){const body=$('#vBody');if(body)body.innerHTML='<div class="msg">这份文件打不开，重新放一次试试。</div>'}
}

/* ---------- views ---------- */
const panel=$('#panel');
const enc=encodeURIComponent;
const CLIPS=['#e79ab5','#7fb7e0','#e2b84a','#86cdb2'];
const gm=s=>`https://www.google.com/maps/dir/?api=1&destination=${enc(s.q)}&travelmode=${['walking','driving','transit'].includes(s.mode)?s.mode:'transit'}`;
const gmRoute=d=>'https://www.google.com/maps/dir/'+routePlaces(d).map(q=>enc(q).replace(/%20/g,'+')).join('/');
const SHORT=trip.itinerary.labels||{};

/* small hand-drawn scenes in the polaroids */
function skyline(seed,base,color,lit){
  let x=0,s=seed,o='';
  const r=()=>(s=(s*16807)%2147483647)/2147483647;
  while(x<160){const w=9+r()*13,h=16+r()*base;o+=`<rect x="${x.toFixed(1)}" y="${(120-h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"/>`;
    if(lit)for(let i=0;i<3;i++){o+=`<rect x="${(x+2+r()*(w-5)).toFixed(1)}" y="${(124-h+r()*(h-10)).toFixed(1)}" width="1.8" height="2.4" fill="#f0d98c"/>`}
    x+=w+1}
  return o;
}
function scene(id){
  const S={
   d26:`<rect width="160" height="120" fill="#27403f"/><circle cx="122" cy="26" r="9" fill="#f1e6b8"/>${skyline(7,52,'#1b2f2f',1)}`,
   d27:`<rect width="160" height="120" fill="#b9d0cb"/><circle cx="118" cy="30" r="11" fill="#f6edc2"/><rect y="88" width="160" height="32" fill="#2f5a55"/><path d="M0 92q20-3 40 0t40 0 40 0 40 0" stroke="#6f958f" fill="none"/><path d="M56 88h14l-2-8h-2l-1-16 3-4-1-5 3-11-2-1-2 8-2-3-3 4 1 6-3 5 1 6-2 11h-2z" fill="#1f3d3a"/>`,
   d28:`<rect width="160" height="120" fill="#cfdccb"/><circle cx="40" cy="28" r="10" fill="#f6edc2"/>${skyline(11,20,'#a8bcae',0)}<path d="M0 88q44-26 92-6t68-8v46H0z" fill="#2f5a55"/><path d="M84 120q-16-16 6-24t10-16" stroke="#d9cfa3" stroke-width="1.6" fill="none"/><circle cx="30" cy="76" r="9" fill="#1f3d3a"/><circle cx="130" cy="76" r="11" fill="#1f3d3a"/>`,
   d29:`<rect width="160" height="120" fill="#e3d9b8"/><circle cx="118" cy="56" r="14" fill="#efb878"/><rect y="78" width="160" height="42" fill="#4d6a60"/><rect y="96" width="160" height="2" fill="#e3d9b8" opacity=".7"/><rect x="34" y="66" width="52" height="24" rx="3" fill="#2a4640"/><rect x="39" y="71" width="9" height="8" fill="#d9e2d0"/><rect x="51" y="71" width="9" height="8" fill="#d9e2d0"/><rect x="63" y="71" width="9" height="8" fill="#d9e2d0"/><circle cx="46" cy="91" r="4" fill="#1b2f2f"/><circle cx="74" cy="91" r="4" fill="#1b2f2f"/>`,
   d30:`<rect width="160" height="120" fill="#e8bd92"/><circle cx="40" cy="62" r="14" fill="#f6e3b0"/>${skyline(23,46,'#37504c',0)}<path d="M0 24L160 60" stroke="#27403a"/><rect x="88" y="44" width="20" height="13" rx="2" fill="#a63a28"/><rect x="97" y="41" width="1.5" height="4" fill="#27403a"/>`,
   d31:`<rect width="160" height="120" fill="#cfe0e4"/><circle cx="34" cy="92" r="16" fill="#f6dba6"/><path d="M0 104q40-10 80-2t80-6v24H0z" fill="#8fb0ab"/><path d="M40 70Q84 56 112 36" stroke="#fbfaf3" stroke-width="1.6" stroke-dasharray="3 4" fill="none"/><path d="M112 36l14-9 3 2-8 10 5 6-2 1-7-4-6 3 1-4z" fill="#27403a"/>`
  };
  return `<svg viewBox="0 0 160 120" aria-hidden="true">${S[id]||skyline(27,54,'#557569',1)}</svg>`;
}

function chip(x){
  if(MODE[x]) return `<span class="b${x==='R'||x==='W'?' y':''}" style="background:${MODE[x]}" aria-label="${x} 线">${x}</span>`;
  return {w:'<span>步行</span>',ferry:'<span>渡轮</span>'}[x]||'';
}
const howHtml=h=>`<div class="how">${h.map(x=>Array.isArray(x)?chip(x[0]):`<span>${esc(x)}</span>`).join('')}</div>`;
function stopHtml(s,i){
  return `<li class="st" id="st${i}" style="--clip:${CLIPS[i%4]}">
    <span class="clip"></span>
    <div class="when"><span>${esc(s.t)}</span>${s.edited?'<b class="stop-edit-tag">已调整</b>':''}${s.custom?'<i>自己添加</i>':s.no?`<i>No.${s.no}</i>`:''}</div>
    <h3 class="name">${esc(s.n)}</h3>${s.en?`<div class="en">${esc(s.en)}</div>`:''}
    ${s.addr?`<button class="addr" type="button" data-act="copya" data-text="${esc(s.addr)}"><span>${esc(s.addr)}</span><b>复制</b></button>`:''}
    ${s.how?howHtml(s.how):''}${s.d?`<p class="note${s.custom?' plan-note':''}">${esc(s.d)}</p>`:''}${s.warn?`<div class="warn">${esc(s.warn)}</div>`:''}
    ${s.q||s.book?`<div class="links">${s.q?`<a class="lk" href="${gm(s)}" target="_blank" rel="noopener">导航</a>`:''}${s.book?`<a class="lk" href="${safeUrl(s.book[1])}" target="_blank" rel="noopener">${esc(s.book[0])}</a>`:''}</div>`:''}
    ${s.slot?`<div class="slot" data-slot="${s.slot}">${slotInner(s.slot)}</div>`:''}
    ${s.custom?`<button class="lk sm stop-edit-link" type="button" data-plan-action="edit" data-plan-id="${esc(s.planId)}">编辑 / 调整日期</button>`:`<button class="lk sm stop-edit-link" type="button" data-stop-action="edit" data-stop-id="${esc(s.baseId)}"${db?'':' disabled'}>编辑行程</button>`}
  </li>`;
}
const nowNY=()=>window.__now||{date:new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}),time:new Date().toLocaleTimeString('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit'})};
const nyToday=()=>nowNY().date;
const stopTime=s=>planTime((/^(\d{1,2}:\d{2})/.exec(s.t||'')||[])[1])||(s.t==='白天'?'06:00':s.t==='散场后'?'22:00':null);
/* the clock decides each stop's state: past stops fade and fold, the current one grows */
function markNow(){
  const d=DAYS.find(x=>x.id===curView);
  document.querySelectorAll('.st').forEach(x=>x.classList.remove('now','past','soon'));
  if(!d) return null;
  const n=nowNY();
  if(n.date>d.date){document.querySelectorAll('.st').forEach(x=>x.classList.add('past'));return null}
  if(n.date<d.date) return null;
  let cur=-1,first=-1;
  const stops=dayStops(d);
  stops.forEach((s,i)=>{const t=stopTime(s); if(!t) return; if(first<0) first=i; if(t<=n.time) cur=i});
  const i=cur>=0?cur:first; if(i<0) return null;
  stops.forEach((s,k)=>{if(k<i) $('#st'+k).classList.add('past')});
  const el=$('#st'+i); el.classList.add('now'); if(cur<0) el.classList.add('soon');
  return el;
}
function photoHtml(id){const p=photos[id];return p?`<img class="ph" src="${bu(p.asset)}" alt="这一天的照片">`:scene(id)}
function phActs(id){
  if(!assets) return '';
  if(busy['ph'+id]) return '<span class="busy">正在上传…</span>';
  return `<button class="lk sm" type="button" data-act="photo" data-day="${id}">${photos[id]?'换照片':'放照片'}</button>${photos[id]?`<button class="lk sm" type="button" data-act="unphoto" data-day="${id}">恢复插画</button>`:''}`;
}
function showDay(d){
  let number=0;
  panel.innerHTML=`<header class="dayhead"><div><div class="d">${monthDay(d.date)}</div><span class="tag">${d.wd}</span><h1>${esc(d.title)}</h1><p>${esc(d.lede)}</p></div>
     <div><button class="pol" type="button" ${assets?`data-act="photo" data-day="${d.id}"`:''} aria-label="放这一天的照片" style="--clip:${CLIPS[+d.n%4]}"><span class="pin"></span><span class="frame" data-ph="${d.id}">${photoHtml(d.id)}</span><span class="cap">${monthDay(d.date)}</span></button><div class="phacts" data-pa="${d.id}">${phActs(d.id)}</div>${errs['ph'+d.id]?`<div class="err">${esc(errs['ph'+d.id])}</div>`:''}</div></header>
   ${routePlaces(d).length>1?`<div class="mapbox"><a class="cta" href="${gmRoute(d)}" target="_blank" rel="noopener">在 Google 地图看今天路线</a><p class="hint">${originalDayChanged(d)?'路线已按当前日期、时间和地点更新，各站也可单独导航。':'怎么坐车，点每一站的“导航”'}</p></div>`:''}
   <div class="links plan-day-add"><button class="lk" type="button" data-plan-action="new" data-plan-day="${d.id}">＋ 补充当天行程</button><a class="lk" href="#plans">去想去清单挑一处</a></div>
   <p class="hint" style="text-align:left">每一站都可以编辑；修改保存到你的账号。</p>
   <ol class="line">${dayStops(d).map((stop,index)=>stopHtml(stop.no?{...stop,no:++number}:stop,index)).join('')}</ol>`;
  const el=markNow();
  if(el) requestAnimationFrame(()=>{const y=el.getBoundingClientRect().top+scrollY-90;window.scrollTo({top:y})});
}
const allMapHtml=()=>okMap(mapUrl)?`<div class="mapbox"><a class="cta" href="${esc(mapUrl)}" target="_blank" rel="noopener">在 Google 地图看全部地点</a></div>`:'';
function showAll(){
  panel.innerHTML=`<header class="cover"><span class="tag">${monthDay(trip.start_date)} – ${monthDay(trip.end_date)}</span><h1 style="margin-top:12px">${esc(trip.name)}</h1><p>点一张照片，看那天怎么走。</p></header>
   <div id="gmapAll">${allMapHtml()}</div>
   <button class="sticky plan-entry" type="button" data-plan-action="new"><strong>＋ 记下想去的地方</strong><span>还没想好什么时候去？先放进待安排。</span></button>

   <div class="wall">${DAYS.map((d,i)=>`<button class="hang${d.date<nyToday()?' done':d.date===nyToday()?' today':''}" type="button" onclick="location.hash='${d.id}'"><div class="pol" style="--r:${[-1.6,1.2,1.4,-1.1,-.9,1.5][i]}deg;--clip:${CLIPS[i%4]}"><span class="pin"></span><span class="frame" data-ph="${d.id}">${photoHtml(d.id)}</span><span class="cap">${monthDay(d.date)} ${d.wd}</span></div><strong>${esc(SHORT[d.id]||d.title)}</strong></button>`).join('')}</div>`;
}
function showWallet(){
  const groups=['门票','交通','住宿','其他'];
  panel.innerHTML=`<header class="plain"><h1>票夹</h1><p class="sub">票据跟随你的账号，可在其他设备打开。</p><div class="meter"><span class="tag" id="meter">${meterText()}</span> <button class="lk sm" type="button" data-act="import" style="margin-left:10px">导入票包</button><span class="busy" id="impMsg" style="margin-left:8px"></span></div></header>

   ${errs._load?`<div class="warn">${errs._load}</div>`:''}
   ${groups.map(g=>`<section class="group"><h2>${g}</h2>${Object.entries(SLOTS).filter(([k,s])=>s.g===g&&(!s.archived||tickets.some(t=>t.slot===k)||notes[k])).map(([k,s])=>`<div class="card"><div class="k">${esc(s.k)}</div><b class="t">${esc(s.t)}</b>${s.d?`<p>${esc(s.d)}</p>`:''}${s.a?`<p>${esc(s.a)}</p><p>${esc(s.p)}</p><div class="links"><button class="lk" type="button" data-act="copy" data-text="${esc(s.a)}">复制地址</button><a class="lk" href="https://www.google.com/maps/dir/?api=1&destination=${enc(s.a)}&travelmode=transit" target="_blank" rel="noopener">导航</a></div>`:''}
     <div data-slot="${k}" data-full="1">${slotInner(k,true)}</div>
     ${db?`<textarea id="note-${k}" data-note="${k}" rows="1" placeholder="备注：订单号、取票方式…" aria-label="${esc(s.t)} 备注">${esc(notes[k]||'')}</textarea>`:''}</div>`).join('')}</section>`).join('')}`;
}
function showTodo(){
  panel.innerHTML=`<header class="plain"><h1>出发前</h1></header>
   <ul class="todo">${TODO.map(([k,t,s,u])=>`<li><label><input type="checkbox" id="td-${esc(k)}" data-k="${esc(k)}"${todo[k]?' checked':''}><span>${esc(t)}${s?`<small>${esc(s)}</small>`:''}${u?`<a href="${safeUrl(u)}" target="_blank" rel="noopener">打开官网</a>`:''}</span></label></li>`).join('')}</ul>
   ${db?`<section class="group"><h2>Google 地图链接</h2><p class="hint" style="text-align:left">把“我的地图”的分享链接贴在这里，首页会出现入口。</p><div class="field"><input id="mapUrl" type="url" inputmode="url" placeholder="https://www.google.com/maps/d/…" aria-label="Google 我的地图链接" value="${esc(mapUrl)}"><button class="lk" type="button" data-act="savemap">保存</button></div><p class="hint" style="text-align:left" id="mapMsg"></p></section>`:''}`;
}

/* ---------- tabs + routing ---------- */
const tabs=$('#tabs');
tabs.innerHTML=`<button class="tab" role="tab" data-v="all" type="button"><b>全程</b><span>&nbsp;</span></button>`+
 DAYS.map(d=>`<button class="tab" role="tab" data-v="${d.id}" type="button"><b>${d.n}</b><span>${d.wd}</span></button>`).join('')+
 `<button class="tab" role="tab" data-v="plans" type="button"><b>想去</b><span>待安排</span></button><button class="tab" role="tab" data-v="wallet" type="button"><b>票夹</b><span>&nbsp;</span></button><button class="tab" role="tab" data-v="todo" type="button"><b>清单</b><span>&nbsp;</span></button>`;
tabs.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{location.hash=t.dataset.v});
function route(){
  let v=location.hash.slice(1);
  if(!v){const t=DAYS.find(d=>d.date===nyToday()); v=t?t.id:'all'}
  curView=v;
  tabs.querySelectorAll('.tab').forEach(t=>{const on=t.dataset.v===v;t.setAttribute('aria-selected',on);if(on)t.scrollIntoView({block:'nearest',inline:'center'})});
  const d=DAYS.find(x=>x.id===v);
  if(v==='plans') showPlans(); else if(v==='wallet') showWallet(); else if(v==='todo') showTodo(); else if(d) showDay(d); else showAll();
}
addEventListener('hashchange',()=>{route();window.scrollTo(0,0)});
route();
boot();
setInterval(markNow,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)markNow()});
document.addEventListener('click',e=>{const s=e.target.closest('.st.past');if(s&&!e.target.closest('a,button'))s.classList.toggle('open')});

}
