import {shortDate} from './calendar-view.js';
import {installTripForm} from './trip-form.js';

export function makeDraft({loadPlaces,save,discard}) {
  const panel=document.querySelector('#draft-panel');
  const form=document.querySelector('#new-trip');
  const message=form.querySelector('[role=status]');
  const submit=form.querySelector('[type=submit]');
  const inputs=installTripForm(form,loadPlaces);
  let generation=0;
  document.querySelector('#cancel-trip').onclick=()=>{
    if (!submit.disabled) discard();
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const values=inputs.values();
    if (!values) return;
    const current=generation;
    submit.disabled=true;
    message.textContent='正在保存…';
    try {
      await save(values);
      if (current===generation) discard();
    } catch {
      if (current===generation) message.textContent='保存失败，请检查网络后重试。';
    } finally {
      submit.disabled=false;
    }
  });
  return {
    show(marker) {
      generation++;
      inputs.reset();
      inputs.setMarker(marker);
      document.querySelector('#drawn-dates').textContent=shortDate(marker.start)+' – '+shortDate(marker.end);
      message.textContent='';
      panel.hidden=false;
    },
    hide() {
      generation++;
      inputs.reset();
      panel.hidden=true;
    }
  };
}
