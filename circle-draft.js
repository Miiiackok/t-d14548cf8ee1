import {shortDate} from './calendar-view.js';

export function makeCircleDraft({read,save,remove,render}) {
  const panel = document.querySelector('#circle-panel');
  const form = document.querySelector('#circle-form');
  const status = form.querySelector('[role=status]');
  const removeButton = form.querySelector('#remove-circle');
  const link = form.elements.namedItem('link');
  const place = form.elements.namedItem('place');
  const openLink = form.querySelector('#open-circle-link');
  let selected = '';
  let generation = 0;

  function hide() {
    selected = '';
    generation++;
    panel.hidden = true;
  }
  function close() {
    hide();
    render();
  }
  function updateOpenLink() {
    openLink.hidden = !link.value || !link.validity.valid;
    if (openLink.hidden) openLink.removeAttribute('href');
    else openLink.href = link.value;
  }
  link?.addEventListener('input',updateOpenLink);
  function show(day) {
    if (selected === day && !panel.hidden) return;
    selected = day;
    generation++;
    form.reset();
    const previous = read(day);
    document.querySelector('#circled-date').textContent = shortDate(day);
    form.elements.time.value = previous?.time?.slice(0,5) || '';
    form.elements.note.value = previous?.note || '';
    if (link) {
      link.value = previous?.link || '';
      place.value = previous?.place || '';
      updateOpenLink();
    }
    removeButton.hidden = !previous;
    status.textContent = '';
    panel.hidden = false;
    render();
  }
  async function write(operation) {
    if (!selected) return;
    const version = generation;
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button=>button.disabled=true);
    status.textContent = '正在保存…';
    try {
      await operation(selected);
      if (generation === version) close();
    } catch {
      if (generation === version) status.textContent = '保存失败，请重试。';
    } finally {
      buttons.forEach(button=>button.disabled=false);
    }
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const values = {time:form.elements.time.value || null,note:form.elements.note.value.trim()};
    if (link) {
      values.link = link.value.trim();
      values.place = place.value.trim();
    }
    write(day=>save(day,values));
  });
  document.querySelector('#cancel-circle').onclick = close;
  removeButton.onclick = ()=>write(remove);
  return {show,hide,day:()=>selected};
}
