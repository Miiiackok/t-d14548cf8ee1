const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const magic = encoder.encode('NYT1');
const docPath = /^(tickets|photos|notes|plans|stopEdits|state)\/[A-Za-z0-9_-]+$/;
const assetId = /^[A-Za-z0-9_-]+$/;
const acceptedType = /^(application\/pdf$|image\/)/;
const fileName = 'nytrip-safari-transfer.nyt';

function requestResult(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function complete(transaction) {
  return new Promise((resolve,reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
  });
}

async function openDb() {
  const request = indexedDB.open('nytrip',1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('docs');
    request.result.createObjectStore('blobs');
  };
  return requestResult(request);
}

async function readEntries(transaction,name) {
  const store = transaction.objectStore(name);
  const [keys,values] = await Promise.all([requestResult(store.getAllKeys()),requestResult(store.getAll())]);
  return new Map(keys.map((key,index) => [key, values[index]]));
}

async function snapshot() {
  const db = await openDb();
  try {
    const tx = db.transaction(['docs','blobs'],'readonly');
    const [entries,blobs] = await Promise.all([readEntries(tx,'docs'),readEntries(tx,'blobs')]);
    const docs = [...entries].filter(([key,value]) => docPath.test(key) && value && typeof value === 'object');
    return {docs,blobs};
  } finally { db.close(); }
}

function counts(docs) {
  const count = kind => docs.filter(([key]) => key.startsWith(kind + '/')).length;
  return `${count('tickets')} 份票据 · ${count('photos')} 张行程照片 · ${count('stopEdits')} 条修改 · ${count('plans')} 个自行添加的地点`;
}

async function transferKey(raw) {
  const seed = await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({
    name:'HKDF',hash:'SHA-256',salt:encoder.encode('nytrip-v1'),info:encoder.encode('browser-transfer')
  },seed,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export async function pack(data,key) {
  const files = new Map();
  const docs = data.docs.filter(([path,doc]) => {
    if (!/^(tickets|photos)\//.test(path)) return true;
    const blob = data.blobs.get(doc.asset);
    if (!(blob instanceof Blob) || !acceptedType.test(blob.type) || !assetId.test(doc.asset)) return false;
    files.set(doc.asset,blob);
    return true;
  });
  const json = encoder.encode(JSON.stringify({
    docs, files:[...files].map(([id,blob]) => ({id,type:blob.type,size:blob.size}))
  }));
  const size = new ArrayBuffer(4);
  new DataView(size).setUint32(0,json.length);
  const content = await new Blob([size,json,...files.values()]).arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:magic},key,content);
  return new Blob([magic,iv,ciphertext],{type:'application/octet-stream'});
}

export async function unpack(file,key) {
  const input = await file.arrayBuffer();
  if (input.byteLength < 36 || decoder.decode(input.slice(0,4)) !== 'NYT1') throw new Error('Invalid backup');
  const plain = await crypto.subtle.decrypt({
    name:'AES-GCM',iv:input.slice(4,16),additionalData:magic
  },key,input.slice(16));
  const headerSize = new DataView(plain).getUint32(0);
  let offset = 4 + headerSize;
  const {docs,files} = JSON.parse(decoder.decode(plain.slice(4,offset)));
  if (offset > plain.byteLength || !Array.isArray(docs) || !Array.isArray(files)) throw new Error('Invalid content');
  const blobs = new Map();
  for (const {id,type,size} of files) {
    if (!assetId.test(id) || !acceptedType.test(type) || !Number.isSafeInteger(size) ||
        size < 0 || offset + size > plain.byteLength || blobs.has(id)) throw new Error('Invalid attachment');
    blobs.set(id,new Blob([new Uint8Array(plain,offset,size)],{type}));
    offset += size;
  }
  if (offset !== plain.byteLength) throw new Error('Invalid attachment length');
  for (const [path,value] of docs) {
    if (!docPath.test(path) || !value || typeof value !== 'object' || Array.isArray(value) ||
        (/^(tickets|photos)\//.test(path) && !blobs.has(value.asset))) throw new Error('Invalid itinerary record');
  }
  return {docs,blobs};
}

async function merge(data) {
  const db = await openDb();
  try {
    const tx = db.transaction(['docs','blobs'],'readwrite');
    const written = complete(tx);
    const docs = tx.objectStore('docs');
    const blobs = tx.objectStore('blobs');
    data.blobs.forEach((blob,id) => blobs.put(blob,id));
    for (const [path,value] of data.docs) {
      if (path === 'state/todo') {
        const existing = docs.get(path);
        existing.onsuccess = () => docs.put({...existing.result,...value},path);
      } else {
        docs.put(value,path);
      }
    }
    await written;
  } finally { db.close(); }
}

export async function openTransfer(raw) {
  const panel = document.querySelector('#panel');
  const back = './#d28';
  document.querySelector('.bar').hidden = true;
  panel.innerHTML = `<header class="plain"><h1>转移旅行资料</h1>
    <p class="sub">在原浏览器导出，再在目标浏览器导入。备份全程在本机处理。</p></header>
    <section class="group"><h2>当前浏览器</h2><p id="transfer-count"></p>
    <div class="links"><button type="button" class="lk" id="make-backup">导出加密备份</button>
    <label for="take-backup">导入加密备份</label><input id="take-backup" type="file" accept=".nyt,application/octet-stream"></div>
    <p id="transfer-message" role="status"></p><a class="lk" href="${back}">返回 28 日行程</a></section>`;
  const status = panel.querySelector('#transfer-message');
  const counter = panel.querySelector('#transfer-count');
  const save = panel.querySelector('#make-backup');
  const input = panel.querySelector('#take-backup');
  const key = await transferKey(raw);
  counter.textContent = counts((await snapshot()).docs);
  save.onclick = async () => {
    save.disabled = true;
    status.textContent = '正在生成加密备份…';
    try {
      const backup = await pack(await snapshot(),key);
      const link = document.createElement('a');
      const url = URL.createObjectURL(backup);
      link.href = url;
      link.download = fileName;
      panel.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      status.textContent = '加密备份已生成。';
    } catch {
      status.textContent = '无法生成备份，请重试。';
    } finally { save.disabled = false; }
  };
  input.onchange = async () => {
    if (!input.files[0]) return;
    input.disabled = true;
    try {
      status.textContent = '正在校验备份…';
      const data = await unpack(input.files[0],key);
      await merge(data);
      counter.textContent = counts((await snapshot()).docs);
      status.textContent = '导入完成。已复制 ' + counts(data.docs) + '。';
    } catch {
      status.textContent = '导入失败，请确认文件是用同一网站密码导出的加密备份。';
    } finally { input.disabled = false; input.value = ''; }
  };
}
