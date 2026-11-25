import {listTravelShares,makeTravelShare,revokeTravelShare} from './cloud.js';

export function setupSharePanel() {
  const dialog = document.querySelector('#share-dialog');
  const details = dialog.querySelector('#share-for');
  const form = dialog.querySelector('form');
  const viewer = form.elements.viewer;
  const message = dialog.querySelector('[role=status]');
  const output = dialog.querySelector('#share-output');
  const links = dialog.querySelector('#active-shares');
  const url = dialog.querySelector('#share-url');
  let target;
  const emailVisibility = () => {
    const invite = form.elements.access.value === 'account';
    viewer.required = invite;
    viewer.disabled = !invite;
    viewer.closest('label').hidden = !invite;
  };
  form.addEventListener('change',emailVisibility);
  async function refresh(id) {
    const shares = await listTravelShares(id);
    if (id !== target?.id) return;
    links.replaceChildren(...shares.map(record=>{
      const row = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = record.viewer_email || '持链接者';
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.textContent = '撤销';
      revoke.setAttribute('aria-label','撤销 '+text.textContent+' 的链接');
      revoke.onclick = async () => {
        revoke.disabled = true;
        try {
          await revokeTravelShare(record.id);
          output.hidden = true;
          url.value = '';
          message.textContent = '已撤销链接。';
          await refresh(id);
        } catch {
          message.textContent = '撤销失败，请重试。';
          revoke.disabled = false;
        }
      };
      row.append(text,revoke);
      return row;
    }));
    if (!shares.length) {
      const row = document.createElement('li');
      row.textContent = '暂无分享链接。';
      links.append(row);
    }
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const selected = target;
    if (!selected) return;
    const button = event.submitter;
    const recipient = form.elements.access.value==='account' ? viewer.value.trim().toLowerCase() : null;
    button.disabled=true;
    try {
      const link = await makeTravelShare(selected.id,recipient);
      if (selected!==target) return;
      url.value=link;
      output.hidden=false;
      message.textContent='分享链接已生成。';
      await refresh(selected.id);
    } catch {
      message.textContent='无法生成链接，请检查网络后重试。';
    } finally { button.disabled=false; }
  });
  dialog.querySelector('#copy-share').onclick=async()=>{
    try {
      await navigator.clipboard.writeText(url.value);
      message.textContent='已复制分享链接。';
    } catch {
      url.select();
      message.textContent='请手动复制选中的链接。';
    }
  };
  dialog.querySelector('#close-share').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    target=null;
    url.value='';
    output.hidden=true;
  });
  return async trip=>{
    target=trip;
    details.textContent=trip.city||trip.name;
    form.reset();
    emailVisibility();
    message.textContent='';
    links.replaceChildren();
    dialog.showModal();
    try { await refresh(trip.id); } catch { message.textContent='暂时无法读取分享列表。'; }
  };
}
