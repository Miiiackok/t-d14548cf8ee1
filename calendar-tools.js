import {setupStickers} from './transport-stickers.js';

export function flagEmoji(country) {
  return /^[A-Z]{2}$/.test(country||'')
    ? String.fromCodePoint(...[...country].map(letter => 127397 + letter.charCodeAt(0)))
    : '';
}

export const toolMarkup = `
  <div class="drawing-tools" id="drawing-tools">
    <div class="tool-row">
      <button type="button" id="pen-tool" aria-expanded="false" aria-controls="pen-palette"><span class="tool-marker" aria-hidden="true"></span> 马克笔</button>
      <button type="button" id="circle-tool" aria-label="铅笔（重要日期）" aria-pressed="false" title="圈出重要日期">✎ 铅笔</button>
      <button type="button" id="sticker-tool" aria-expanded="false" aria-controls="sticker-palette">交通贴纸</button>
      <button type="button" id="sticker-done" hidden>完成贴纸</button>
    </div>
    <div id="sticker-palette" class="sticker-palette" aria-label="选择交通贴纸" hidden><div class="sticker-palette-grid"></div><p class="sticker-scroll-hint">向下滑看更多贴纸</p></div>
    <div id="pen-palette" class="pen-palette" aria-label="选择马克笔颜色" hidden></div>
    <p id="drawing-status" class="drawing-status" role="status" hidden></p>
  </div>`;

export const pendingMarkup = `
  <div id="pending-marker" class="pending-marker" hidden><span class="swatch" aria-hidden="true"></span><span id="pending-caption"></span>
    <button type="button" id="discard-marker">取消</button>
  </div>`;

export const toolCss = `
  .calendar{--pencil-red:#ab3636}
  .drawing-tools{margin-top:14px}
  .drawing-tools:not([hidden])+.calendar{margin-top:12px}
  .tool-row,.pen-palette{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
  .tool-row button,.pending-marker button,.share-button{min-height:44px;padding:0 14px;background:var(--sheet);border:1px solid var(--line);border-radius:9px;color:var(--ink);cursor:pointer;font:inherit}
  .tool-row .active{border-color:#667b42;background:#eaf0d8}
  .tool-marker{display:inline-block;width:18px;height:8px;border-radius:2px;background:var(--marker);vertical-align:1px;transform:rotate(-12deg)}
  .pen-palette{margin-top:10px;padding:6px 9px;border:1px solid var(--line);background:var(--sheet);border-radius:10px;width:fit-content}
  .pen-palette button{width:44px;height:44px;border:1px solid transparent;border-radius:7px;background:transparent;cursor:pointer;display:grid;place-items:center}
  .pen-palette button span{width:28px;height:14px;background:var(--chip);display:block;border-radius:3px;border:1px solid #26352d44;transform:rotate(-6deg)}
  .pen-palette button:hover{border-color:#62764c}
  .drawing-status{margin:6px 0;color:var(--soft);font-size:14px}
  .pending-marker{display:flex;align-items:center;gap:10px;min-height:50px;margin-top:12px;padding:2px 10px 2px 13px;border:1px dashed #adb89a;border-radius:10px}
  .pending-marker button{margin-left:auto;min-height:40px}
  .week button.day{width:100%;min-height:0;display:flex;flex-direction:column;align-items:flex-start;padding:4px clamp(3px,1vw,10px) 3px;border:0;border-right:1px solid var(--line);text-align:left;background:transparent;color:inherit;font:inherit;cursor:default;user-select:none}
  .week button.day:nth-child(7){border-right:0}
  .week button.overflow-day{background:#f6f5ee;color:#656c60}
  .day-top{display:flex;align-items:center;gap:2px;width:100%;height:33px;flex:none}
  .day-num{display:grid;flex:none;width:26px;height:27px;place-items:center;position:relative;z-index:2;pointer-events:none}
  .important .day-num{pointer-events:auto}
  .important .day-num::after,.circle-draft .day-num::after{
    content:"";position:absolute;left:50%;top:50%;width:38px;height:34px;transform:translate(-50%,-50%);pointer-events:none;
    background:var(--pencil-red);
    mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 36'%3E%3Cpath d='M32 7.5 C27.3 2.2 18 1.7 11.2 5.8 C3.8 10.3 1.5 20.9 6.1 27.8 C11.4 35.1 23.3 33.6 31.1 28.3 C37.3 24 39 16.7 35.2 12.7' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round'/%3E%3Cpath d='M4.5 23.2 Q6.6 34.5 19.2 33.2' fill='none' stroke='black' stroke-opacity='.35' stroke-width='.8' stroke-linecap='round'/%3E%3C/svg%3E") center / contain no-repeat
  }
  .circle-draft .day-num::after{opacity:.75}
  .day-writing{display:grid;gap:2px;width:100%;min-height:0;margin-top:calc(3px + var(--extra-mark-space));overflow:hidden;color:#657062;font:400 10px/11px "Calendar Hand","Kaiti SC",KaiTi,STKaiti,system-ui,sans-serif}
  .day-places{display:grid;grid-template-columns:minmax(0,1fr)}
  .day-place{position:relative;padding-inline-start:7px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .day-place::before{content:"";position:absolute;inset-inline-start:0;top:.42em;width:3px;height:3px;border-radius:50%;background:#879083}
  .day-memo{display:-webkit-box;overflow:hidden;overflow-wrap:anywhere;color:#8c4945;white-space:pre-line;-webkit-box-orient:vertical;-webkit-line-clamp:var(--memo-lines,4)}
  .week button.important{cursor:pointer}
  .calendar-body{position:relative}
  .pencil-trace{position:absolute;inset:0;z-index:3;pointer-events:none;width:100%;height:100%}
  .calendar.drawing .mark,.mark.pending{pointer-events:none}
  .calendar.drawing .week{touch-action:none}
  .calendar.drawing .day{cursor:crosshair}
  .calendar.drawing .day:hover .day-num{background:#dfe8cc;border-radius:50%}
  .mark.pending::before{opacity:.82}
  .trip-row{display:flex;gap:8px;align-items:stretch}
  .trip-row .trip{flex:1;min-width:0}
  .trip-row .share-button{flex:0 0 auto}
  .draft-panel{margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--sheet);max-width:560px}
  .draft-panel h2{font-size:19px}
  .draft-panel form label{display:block;margin:12px 0 3px}
  .draft-panel input:not([type=hidden]){width:100%;font:inherit;min-height:44px;border:1px solid var(--line);border-radius:6px;background:var(--sheet);color:var(--ink);padding:7px 10px}
  .draft-panel .save-draft{min-width:55px;font-size:23px}
  #drawn-dates{font-weight:650;font-variant-numeric:tabular-nums}
  @media(max-width:520px){
    .week button.day{font-size:13px}
    .day-top{height:29px;gap:1px}
    .day-num{width:17px;height:24px}
    .important .day-num::after,.circle-draft .day-num::after{width:30px;height:29px}
    .day-writing{font-size:9px;line-height:10px}
    .day-place{padding-inline-start:6px}
  }
`;

export function setupDrawing({calendar, grid, colors, render, onDraft, onDiscard, onCircle, onCircleDiscard,readStickers,saveSticker}) {
  const pen = document.querySelector('#pen-tool');
  const circle = document.querySelector('#circle-tool');
  const palette = document.querySelector('#pen-palette');
  const status = document.querySelector('#drawing-status');
  const pending = document.querySelector('#pending-marker');
  const caption = document.querySelector('#pending-caption');
  const canvas = document.querySelector('#pencil-trace');
  const graphite = canvas.getContext('2d');
  let mode = '';
  let color = colors[0][0];
  let pointer = null;
  let keyboardStart = '';
  let marker = null;

  const stickers = setupStickers({
    read:readStickers,save:saveSticker,render,focusDay,
    selectMode(next,message) { showPalette(false); setMode(next,message); },
    isActive:()=>mode==='sticker',announce:showStatus
  });

  function showStatus(text) {
    status.textContent = text;
    status.hidden = !text;
  }
  function setMode(next, message = '') {
    mode = next;
    calendar.classList.toggle('drawing',mode==='pen' || mode==='circle');
    calendar.classList.toggle('sticking',mode==='sticker');
    stickers.tool.classList.toggle('active',mode==='sticker');
    stickers.showDone(mode==='sticker');
    pen.classList.toggle('active',mode === 'pen');
    circle.classList.toggle('active',mode === 'circle');
    circle.setAttribute('aria-pressed',mode === 'circle');
    keyboardStart = '';
    showStatus(message);
    render();
  }
  function showPalette(visible) {
    palette.hidden = !visible;
    pen.setAttribute('aria-expanded',String(visible));
  }
  function showPending(message) {
    pending.hidden = !message;
    caption.textContent = message;
    pending.style.setProperty('--trip-color',marker?.color||color);
  }
  function discard() {
    marker = null;
    pointer = null;
    keyboardStart = '';
    showPending('');
    onDiscard();
    render();
  }
  function startStroke(event) {
    const rect=grid.getBoundingClientRect();
    const scale=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.ceil(rect.width*scale);
    canvas.height=Math.ceil(rect.height*scale);
    graphite.setTransform(scale,0,0,scale,0,0);
    graphite.lineWidth=1.55;
    graphite.lineCap='round';
    graphite.lineJoin='round';
    graphite.strokeStyle=getComputedStyle(calendar).getPropertyValue('--pencil-red').trim();
    graphite.globalAlpha=.8;
    pointer.bounds={left:event.clientX,right:event.clientX,top:event.clientY,bottom:event.clientY};
    pointer.point=[event.clientX-rect.left,event.clientY-rect.top];
  }
  function traceStroke(event) {
    const rect=grid.getBoundingClientRect();
    const next=[event.clientX-rect.left,event.clientY-rect.top];
    const {bounds,point}=pointer;
    graphite.beginPath();
    graphite.moveTo(...point);
    graphite.lineTo(...next);
    graphite.stroke();
    pointer.point=next;
    bounds.left=Math.min(bounds.left,event.clientX);
    bounds.right=Math.max(bounds.right,event.clientX);
    bounds.top=Math.min(bounds.top,event.clientY);
    bounds.bottom=Math.max(bounds.bottom,event.clientY);
  }
  function clearStroke() { canvas.width=0; }
  function draw(start,end) {
    const [first,last] = [start,end].sort();
    marker = {start:first,end:last,color,pending:true,name:''};
    render();
  }
  function complete(start,end) {
    const [first,last] = [start,end].sort();
    marker = {start:first,end:last,color,pending:true,name:''};
    setMode('');
    showPending('已选日期');
    onDraft(marker);
  }
  function dayAt(event) {
    const hit = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-calendar-day]');
    return hit && grid.contains(hit) ? hit.dataset.calendarDay : '';
  }
  function finishCircle(day) {
    clearStroke();
    discard();
    setMode('');
    onCircle(day);
  }
  function focusDay(key) {
    requestAnimationFrame(()=>grid.querySelector(key ? '[data-calendar-day="'+key+'"]' : '[data-current-month]')?.focus({preventScroll:true}));
  }
  pen.addEventListener('click',()=>{
    stickers.showPalette(false);
    if (mode==='sticker') setMode('');
    showPalette(palette.hidden);
  });
  circle.addEventListener('click',()=>{
    stickers.showPalette(false);
    showPalette(false);
    if (mode === 'circle') { setMode(''); return; }
    setMode('circle','用铅笔绕着日期画一圈，或直接点选日期。');
    focusDay();
  });
  for (const [ink,label] of colors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.name = 'ink';
    button.setAttribute('aria-label',label);
    button.title = label;
    button.style.setProperty('--chip',ink);
    button.append(document.createElement('span'));
    button.onclick = () => {
      color = ink;
      showPalette(false);
      setMode('pen','在日历上拖过要标记的日期。也可以用键盘依次选开始和结束。');
      focusDay();
    };
    palette.append(button);
  }
  document.querySelector('#discard-marker').onclick = discard;
  grid.addEventListener('pointerdown',event=>{
    const day = event.target.closest('[data-calendar-day]')?.dataset.calendarDay;
    if (!day || (mode!=='pen' && mode!=='circle') || pointer || event.button !== 0) return;
    event.preventDefault();
    if (mode === 'pen') { onCircleDiscard(); discard(); }
    else onCircleDiscard();
    pointer = {id:event.pointerId,start:day,end:day};
    grid.setPointerCapture(event.pointerId);
    if (mode === 'pen') draw(day,day);
    else startStroke(event);
  });
  grid.addEventListener('pointermove',event=>{
    if (pointer?.id !== event.pointerId) return;
    if (mode === 'circle') { traceStroke(event);return;}
    if (mode !== 'pen') return;
    const day=dayAt(event);
    if (day && day !== pointer.end) { pointer.end=day;draw(pointer.start,day); }
  });
  grid.addEventListener('pointerup',event=>{
    if (pointer?.id !== event.pointerId) return;
    if (mode==='circle') traceStroke(event);
    const {start,end,bounds} = pointer;
    pointer = null;
    if (mode === 'circle') {
      const center={clientX:(bounds.left+bounds.right)/2,clientY:(bounds.top+bounds.bottom)/2};
      finishCircle(dayAt(center)||start);
    }
    else complete(start,dayAt(event)||end);
  });
  grid.addEventListener('pointercancel',()=>{
    if (pointer && mode === 'pen') discard();
    clearStroke();
    pointer = null;
  });
  grid.addEventListener('lostpointercapture',event=>{
    if (pointer?.id !== event.pointerId) return;
    if (mode==='pen') discard();
    clearStroke();
    pointer=null;
  });
  grid.addEventListener('click',event=>{
    const cell = event.target.closest('[data-calendar-day]');
    if (!cell) return;
    const day = cell.dataset.calendarDay;
    if (mode==='sticker') { stickers.place(day); return; }
    if (mode) return;
    if (cell.hasAttribute('data-saved-stickers') && (event.target.closest('[data-calendar-stickers]') || !cell.hasAttribute('data-saved-circle'))) {
      stickers.open(day);
    } else if (cell.hasAttribute('data-saved-circle')) finishCircle(day);
  });
  grid.addEventListener('keydown',event=>{
    const day = event.target.closest('[data-calendar-day]')?.dataset.calendarDay;
    if (event.key === 'Escape' && mode) {
      if (mode==='pen' && keyboardStart) discard();
      const tool = mode==='sticker' ? stickers.tool : mode==='circle' ? circle : pen;
      setMode('');
      tool.focus();
      return;
    }
    if (!mode && day && event.key==='Enter' && event.shiftKey && readStickers(day).length) {
      event.preventDefault();
      stickers.open(day);
      return;
    }
    if (!mode || !day) return;
    const step = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if (step) {
      event.preventDefault();
      const date = new Date(day+'T00:00:00Z');
      date.setUTCDate(date.getUTCDate()+step);
      const target = date.toISOString().slice(0,10);
      if (mode==='pen' && keyboardStart && grid.querySelector('[data-calendar-day="'+target+'"]')) draw(keyboardStart,target);
      focusDay(target);
      return;
    }
    if (event.key!=='Enter' && event.key!==' ') return;
    event.preventDefault();
    if (mode==='sticker') { stickers.place(day); return; }
    if (mode==='circle') {finishCircle(day);focusDay(day);return;}
    if (!keyboardStart) {onCircleDiscard();discard();keyboardStart=day;draw(day,day);focusDay(day);return;}
    complete(keyboardStart,day);
  });
  return {
    marker:()=>marker,
    enabled:()=>Boolean(mode),
    reset() {
      stickers.reset();
      stickers.showPalette(false);
      showPalette(false);
      setMode('');
      discard();
    },
    discard
  };
}
