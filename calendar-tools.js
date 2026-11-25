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
    </div>
    <div id="pen-palette" class="pen-palette" aria-label="选择马克笔颜色" hidden></div>
    <p id="drawing-status" class="drawing-status" role="status" hidden></p>
  </div>`;

export const pendingMarkup = `
  <div id="pending-marker" class="pending-marker" hidden><span class="swatch" aria-hidden="true"></span><span id="pending-caption"></span>
    <button type="button" id="discard-marker">取消</button>
  </div>`;

export const toolCss = `
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
  .week button.day{width:100%;display:flex;align-items:flex-start;justify-content:flex-start;border:0;border-right:1px solid var(--line);text-align:left;background:transparent;color:inherit;font:inherit;cursor:default;user-select:none}
  .week button.day:nth-child(7){border-right:0}
  .week button.overflow-day{background:#f6f5ee;color:#656c60}
  .day-num{display:grid;width:27px;height:27px;place-items:center;position:relative}
  .important .day-num::after{content:"";position:absolute;inset:-1px 0;border:2px solid #aa4e41;border-radius:51% 47% 49% 53%;transform:rotate(-11deg);pointer-events:none}
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
  @media(max-width:520px){.week button.day{font-size:13px;padding:4px}.day-num{width:25px;height:25px}}
`;

export function setupDrawing({calendar, grid, colors, render, onDraft, onDiscard, onCircle}) {
  const pen = document.querySelector('#pen-tool');
  const circle = document.querySelector('#circle-tool');
  const palette = document.querySelector('#pen-palette');
  const status = document.querySelector('#drawing-status');
  const pending = document.querySelector('#pending-marker');
  const caption = document.querySelector('#pending-caption');
  let mode = '';
  let color = colors[0][0];
  let pointer = null;
  let keyboardStart = '';
  let marker = null;

  function showStatus(text) {
    status.textContent = text;
    status.hidden = !text;
  }
  function setMode(next, message = '') {
    mode = next;
    calendar.classList.toggle('drawing',Boolean(mode));
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
  function focusDay(key) {
    requestAnimationFrame(()=>grid.querySelector(key ? '[data-calendar-day="'+key+'"]' : '[data-current-month]')?.focus({preventScroll:true}));
  }
  pen.addEventListener('click',()=>showPalette(palette.hidden));
  circle.addEventListener('click',()=>{
    showPalette(false);
    if (mode === 'circle') { setMode(''); return; }
    setMode('circle','点击日期画圈，再点一次取消。');
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
    if (!day || !mode || pointer || event.button !== 0) return;
    event.preventDefault();
    if (mode === 'pen') discard();
    pointer = {id:event.pointerId,start:day,end:day};
    grid.setPointerCapture(event.pointerId);
    if (mode === 'pen') draw(day,day);
  });
  grid.addEventListener('pointermove',event=>{
    if (pointer?.id !== event.pointerId || mode !== 'pen') return;
    const day=dayAt(event);
    if (day && day !== pointer.end) { pointer.end=day;draw(pointer.start,day); }
  });
  grid.addEventListener('pointerup',event=>{
    if (pointer?.id !== event.pointerId) return;
    const {start,end} = pointer;
    pointer = null;
    if (mode === 'circle') onCircle(start);
    else complete(start,dayAt(event)||end);
  });
  grid.addEventListener('pointercancel',()=>{
    if (pointer && mode === 'pen') discard();
    pointer = null;
  });
  grid.addEventListener('keydown',event=>{
    const day = event.target.closest('[data-calendar-day]')?.dataset.calendarDay;
    if (event.key === 'Escape' && mode) {
      if (mode==='pen' && keyboardStart) discard();
      setMode('');
      pen.focus();
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
    if (mode==='circle') {onCircle(day);focusDay(day);return;}
    if (!keyboardStart) {discard();keyboardStart=day;draw(day,day);focusDay(day);return;}
    complete(keyboardStart,day);
  });
  return {
    marker:()=>marker,
    enabled:()=>Boolean(mode),
    discard
  };
}
