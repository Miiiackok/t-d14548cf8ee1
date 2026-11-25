const transportDate = new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',timeZone:'UTC'});
const stickerDateLabel = day => transportDate.format(new Date(day+'T00:00:00Z'));

const transports = [
  ['plane','飞机'], ['high-speed','高铁'], ['car','汽车'], ['bike','自行车'], ['walk','步行'],
  ['ferry','渡轮'], ['bus','公交车'], ['taxi','出租车'], ['metro','地铁'], ['helicopter','直升机'],
  ['motorcycle','摩托车'], ['scooter','电动滑板车'], ['tram','有轨电车'], ['train','火车'], ['cable-car','缆车'],
  ['cruise','邮轮'], ['speedboat','快艇'], ['sailboat','帆船'], ['balloon','热气球'], ['camper','房车'],
  ['coach','长途大巴'], ['e-bike','电动自行车'], ['light-rail','轻轨'], ['wheelchair','轮椅'],
  ['shuttle','接驳车'], ['monorail','单轨列车'], ['trolleybus','无轨电车'], ['rickshaw','三轮车'],
  ['funicular','登山缆车'], ['kayak','皮划艇'], ['seaplane','水上飞机'], ['ski','滑雪']
];
const transportIndex = new Map(transports.map(([kind,label],index)=>[kind,{label,index}]));
const mainStickerCount = 20;

export const stickerDialogMarkup = `
  <dialog id="sticker-dialog" class="share-dialog" aria-labelledby="sticker-heading">
    <div class="share-head"><h2 id="sticker-heading">交通贴纸</h2><button type="button" id="close-stickers">关闭</button></div>
    <ul id="day-transport-list"></ul><p id="sticker-message" role="status"></p>
  </dialog>`;

export const stickerCss = `
  .tool-row #sticker-tool{display:inline-flex;gap:6px;align-items:center}
  .sticker-art{display:inline-grid;place-items:center;flex:none;width:38px;height:38px}
  .sticker-art.illustrated{background-image:var(--transport-sheet);background-size:500% 400%;background-position:var(--sticker-x) var(--sticker-y)}
  .sticker-art.illustrated-extra{background-image:var(--transport-sheet-extra);background-size:400% 300%}
  #sticker-tool .sticker-art{width:23px;height:23px}
  .sticker-palette{margin-top:10px;padding:9px;border:1px solid var(--line);background:var(--sheet);border-radius:12px}
  .sticker-palette-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:4px}
  .sticker-choice{display:grid;place-items:center;align-content:center;gap:3px;min-height:64px;padding:4px 2px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:12px;cursor:pointer}
  .sticker-choice:hover,.sticker-choice[aria-pressed=true]{background:#edf1de;border-color:#a4b088}
  .calendar.sticking .mark{pointer-events:none}
  .calendar.sticking button.day{cursor:copy;touch-action:manipulation}
  .calendar.sticking button.day:hover{background:#edf1de}
  .week button.day.sticker-day{cursor:pointer}
  .day-stickers{position:relative;z-index:2;display:flex;align-items:center;gap:1px;flex:none}
  .day-stickers .sticker-art{width:clamp(17px,5.4vw,32px);height:clamp(17px,5.4vw,32px)}
  .sticker-count{position:absolute;right:-2px;bottom:-2px;padding:0 2px;border-radius:4px;background:var(--sheet);color:var(--ink);font:650 8px/1.15 system-ui,sans-serif}
  #day-transport-list{list-style:none;padding:0}
  #day-transport-list li{display:flex;align-items:center;gap:7px;padding:4px 0}
  #day-transport-list button{display:grid;place-items:center;margin-left:auto;width:44px;min-height:44px;border:1px solid var(--line);border-radius:7px;background:transparent;color:inherit;font:inherit;cursor:pointer}
  #day-transport-list button:hover{background:#f4ebe4;color:#9b3434}
  .sticker-trash{font-size:21px;line-height:1}
  #sticker-message{color:var(--soft);font-size:14px}
  .sticker-scroll-hint{display:none;margin:6px 0 0;color:var(--soft);font-size:12px;text-align:center}
  @media(min-width:760px){.sticker-palette-grid{grid-template-columns:repeat(8,minmax(0,1fr))}}
  @media(max-width:520px){.sticker-palette-grid{grid-template-columns:repeat(auto-fill,minmax(62px,1fr));max-height:140px;overflow:auto;overscroll-behavior:contain}.sticker-scroll-hint{display:block}}
  @media(max-width:819px){.day-stickers .sticker-art:nth-child(2),.sticker-count .desktop-count{display:none}}
  @media(min-width:820px){.sticker-count .mobile-count,.sticker-count.single-extra{display:none}}
`;

function stickerArt(kind) {
  const {index} = transportIndex.get(kind);
  const isExtra = index>=mainStickerCount;
  const art = document.createElement('span');
  art.setAttribute('aria-hidden','true');
  const sheet = isExtra ? [4,3,index-mainStickerCount] : [5,4,index];
  const [columns,rows,slot] = sheet;
  art.className = 'sticker-art illustrated'+(isExtra?' illustrated-extra':'');
  art.style.setProperty('--sticker-x',(slot%columns)*100/(columns-1)+'%');
  art.style.setProperty('--sticker-y',Math.floor(slot/columns)*100/(rows-1)+'%');
  return art;
}

const byStickerOrder = (a,b) => transportIndex.get(a).index - transportIndex.get(b).index;

export function groupStickers(rows) {
  const days = new Map();
  for (const {day,kind} of rows) {
    if (!transportIndex.has(kind)) continue;
    const kinds = days.get(day) || [];
    kinds.push(kind);
    days.set(day,kinds);
  }
  for (const kinds of days.values()) kinds.sort(byStickerOrder);
  return days;
}

export function setStickerInCalendar(days,day,kind,placed) {
  const kinds = new Set(days.get(day));
  if (placed) kinds.add(kind); else kinds.delete(kind);
  if (kinds.size) days.set(day,[...kinds].sort(byStickerOrder)); else days.delete(day);
}

export function dayStickerStrip(kinds) {
  const strip = document.createElement('span');
  strip.className = 'day-stickers';
  strip.dataset.calendarStickers = '';
  strip.setAttribute('aria-hidden','true');
  strip.append(...kinds.slice(0,2).map(stickerArt));
  if (kinds.length>1) {
    const count = document.createElement('span');
    count.className = 'sticker-count'+(kinds.length===2?' single-extra':'');
    const desktop = document.createElement('span');
    desktop.className='desktop-count';
    desktop.textContent = kinds.length>2 ? '+'+(kinds.length-2) : '';
    const mobile = document.createElement('span');
    mobile.className='mobile-count';
    mobile.textContent = '+'+(kinds.length-1);
    count.append(desktop,mobile);
    strip.append(count);
  }
  return strip;
}

export const stickerNames = kinds => kinds.map(kind=>transportIndex.get(kind).label).join('、');

export function setupStickers({read,save,render,selectMode,isActive,announce,focusDay}) {
  const tool = document.querySelector('#sticker-tool');
  const done = document.querySelector('#sticker-done');
  const palette = document.querySelector('#sticker-palette');
  const dialog = document.querySelector('#sticker-dialog');
  const heading = dialog.querySelector('h2');
  const list = dialog.querySelector('ul');
  const status = dialog.querySelector('[role=status]');
  const close = dialog.querySelector('#close-stickers');
  const pending = new Set();
  let selected = '';
  let openedDay = '';
  let context = 0;

  tool.prepend(stickerArt('plane'));
  function showPalette(visible) {
    palette.hidden = !visible;
    tool.setAttribute('aria-expanded',String(visible));
  }
  tool.onclick = () => {
    if (!palette.hidden) { showPalette(false); return; }
    selectMode('');
    showPalette(true);
    (palette.querySelector('[aria-pressed=true]') || palette.querySelector('button')).focus();
  };
  palette.addEventListener('keydown',event=>{
    if (event.key!=='Escape') return;
    showPalette(false);
    tool.focus();
  });
  done.onclick = () => { selectMode(''); tool.focus(); };
  for (const [kind,label] of transports) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'sticker-choice';
    choice.setAttribute('aria-pressed','false');
    choice.append(stickerArt(kind),label);
    choice.onclick = () => {
      selected = kind;
      for (const button of palette.querySelectorAll('button')) button.setAttribute('aria-pressed',String(button===choice));
      showPalette(false);
      selectMode('sticker','已选'+label+'。点日期贴上。');
      focusDay();
    };
    palette.querySelector('.sticker-palette-grid').append(choice);
  }

  async function change(day,kind,placed) {
    const key = context+'/'+day+'/'+kind;
    if (pending.has(key)) return false;
    pending.add(key);
    try {
      await save(day,kind,placed);
      render();
      return true;
    } finally {
      pending.delete(key);
    }
  }
  async function place(day) {
    const kind = selected;
    const label = transportIndex.get(kind).label;
    if (read(day).includes(kind)) {
      announce(stickerDateLabel(day)+'已有'+label+'贴纸。');
      return;
    }
    const stamp = context;
    try {
      if (await change(day,kind,true) && isActive() && context===stamp) {
        announce('已贴到'+stickerDateLabel(day)+'。还可以继续点日期。');
        focusDay(day);
      }
    } catch {
      if (context===stamp) announce('贴纸未保存，请重试。');
    }
  }
  function open(day) {
    openedDay = day;
    heading.textContent = stickerDateLabel(day)+'的交通贴纸';
    status.textContent = '';
    list.replaceChildren(...read(day).map(kind=>{
      const label = transportIndex.get(kind).label;
      const item = document.createElement('li');
      const remove = document.createElement('button');
      remove.type = 'button';
      const trash = document.createElement('span');
      trash.className = 'sticker-trash';
      trash.textContent = '🗑︎';
      trash.setAttribute('aria-hidden','true');
      remove.append(trash);
      remove.setAttribute('aria-label','移除'+label);
      remove.title = '移除'+label;
      remove.onclick = async () => {
        remove.disabled = true;
        const stamp = context;
        try {
          if (await change(day,kind,false) && dialog.open && openedDay===day && context===stamp) {
            item.remove();
            if (!list.children.length) dialog.close();
            else close.focus();
          }
        } catch {
          status.textContent = '暂时无法移除，请重试。';
        } finally {
          remove.disabled = false;
        }
      };
      item.append(stickerArt(kind),label,remove);
      return item;
    }));
    dialog.showModal();
  }
  close.onclick = () => dialog.close();
  dialog.addEventListener('close',()=>{ if (openedDay) focusDay(openedDay); });
  return {showPalette,place,open,tool,showDone(active) { done.hidden = !active; },reset() {
    context++;
    openedDay='';
    if (dialog.open) dialog.close();
  }};
}
