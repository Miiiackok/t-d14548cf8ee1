export const markerColors = [
  ['#c6ef5c','荧光绿'],['#f6df60','亮黄'],['#f2ad7c','蜜桃橙'],
  ['#f2a8cd','珊瑚粉'],['#a5d5f3','天空蓝'],['#c9b4f1','淡紫']
];

const regions = new Intl.DisplayNames(['zh-CN'],{type:'region'});
const matchText = value => value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
const han = /[\u3400-\u9fff]/;
const favorites = ['CN','US','CA','JP','GB','FR','IT','SG','AU','KR'];

function combobox(input,popup,options,select) {
  let choices = [];
  let active = -1;
  let epoch = 0;
  function close() {
    epoch++;
    active = -1;
    popup.hidden = true;
    input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');
  }
  function highlight(index) {
    active = index;
    for (const [i,item] of [...popup.children].entries()) item.setAttribute('aria-selected',i === active);
    if (active < 0) { input.removeAttribute('aria-activedescendant'); return; }
    const item = popup.children[active];
    input.setAttribute('aria-activedescendant',item.id);
    item.scrollIntoView({block:'nearest'});
  }
  function choose(index) {
    const option = choices[index];
    if (!option) return;
    select(option);
    close();
  }
  async function show() {
    const request = ++epoch;
    let next;
    try { next = await options(input.value); } catch { next = []; }
    if (request !== epoch || document.activeElement !== input) return;
    choices = next;
    if (!choices.length) { close(); return; }
    popup.replaceChildren(...choices.map((option,index) => {
      const item = document.createElement('li');
      item.id = popup.id + '-' + index;
      item.setAttribute('role','option');
      item.setAttribute('aria-selected','false');
      item.textContent = option.label;
      if (option.detail) {
        const detail = document.createElement('small');
        detail.textContent = option.detail;
        item.append(detail);
      }
      item.addEventListener('pointerdown',event => event.preventDefault());
      item.addEventListener('click',() => choose(index));
      return item;
    }));
    active = -1;
    input.removeAttribute('aria-activedescendant');
    popup.hidden = false;
    input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('focus',show);
  input.addEventListener('input',show);
  input.addEventListener('blur',close);
  input.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !popup.hidden) {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter' && active >= 0 && !popup.hidden) {
      event.preventDefault();
      choose(active);
    } else if (['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (popup.hidden) { show(); return; }
      highlight(event.key === 'ArrowDown'
        ? Math.min(choices.length-1,active+1)
        : active <= 0 ? choices.length-1 : active-1);
    }
  });
  return close;
}

export function installTripForm(form,loadIndex) {
  const countryInput = form.querySelector('#trip-country');
  const cityInput = form.querySelector('#trip-city');
  const startField = form.elements.start_date;
  const endField = form.elements.end_date;
  const nameField = form.elements.name;
  let cachedPlaces;
  let countryCode = '';
  let selectedCity = '';
  let autoName = '';
  const getPlaces = () => cachedPlaces ||= Promise.resolve().then(loadIndex).catch(error => {
    cachedPlaces = null;
    throw error;
  });
  function countryLabel(code) { return regions.of(code) || code; }
  function useCountry(code) {
    if (code !== countryCode) {
      cityInput.value = '';
      selectedCity = '';
      if (nameField.value === autoName) nameField.value = '';
      autoName = '';
    }
    countryCode = code;
    countryInput.value = countryLabel(code);
    countryInput.setCustomValidity('');
    cityInput.readOnly = false;
  }
  async function lookupCountry(value) {
    const search = matchText(value);
    const {countries} = await getPlaces();
    const options = Object.entries(countries).map(([code,english]) => ({
      code,label:countryLabel(code),detail:english,terms:[code,english,countryLabel(code)].map(matchText)
    }));
    if (!search) return favorites.map(code => options.find(item => item.code === code)).filter(Boolean);
    return options.filter(item => item.terms.some(term => term.includes(search)))
      .sort((a,b) => Number(b.terms.includes(search))-Number(a.terms.includes(search)))
      .slice(0,9);
  }
  async function lookupCity(value) {
    if (!countryCode) return [];
    const {cities} = await getPlaces();
    const search = matchText(value);
    const found = [];
    for (const [name,english,area,aliases] of cities[countryCode] || []) {
      const terms = [name,english,...aliases].map(matchText);
      if (search && !terms.some(term => term.includes(search))) continue;
      const local = aliases.find(alias => search && matchText(alias) === search) || aliases.find(alias => han.test(alias));
      const label = local || name;
      const detail = [label !== english ? english : '',area.split('.')[0]].filter(Boolean).join(' · ');
      found.push({label,detail,rank:search ? (terms.includes(search) ? 0 : terms.some(t=>t.startsWith(search)) ? 1 : 2) : 0});
    }
    const unique = new Map(found.sort((a,b)=>a.rank-b.rank).map(city=>[city.label+'\0'+city.detail,city]));
    return [...unique.values()].slice(0,9);
  }
  const closeCountry = combobox(countryInput, form.querySelector('#country-options'),lookupCountry,choice=>useCountry(choice.code));
  const closeCity = combobox(cityInput,form.querySelector('#city-options'),lookupCity,choice=>{
    cityInput.value = choice.label;
    selectedCity = choice.label;
    if (!nameField.value || nameField.value === autoName) nameField.value = autoName = choice.label;
  });
  countryInput.addEventListener('input',()=>{
    countryInput.setCustomValidity('');
    if (countryCode && countryInput.value !== countryLabel(countryCode)) {
      countryCode = '';
      selectedCity = '';
      cityInput.value = '';
      cityInput.readOnly = true;
      if (nameField.value === autoName) nameField.value = '';
      autoName = '';
      closeCity();
    }
  });
  countryInput.addEventListener('blur',async()=>{
    if (!countryInput.value.trim() || countryCode) return;
    const value = countryInput.value;
    try {
      const exact = (await lookupCountry(value)).find(item=>item.terms.includes(matchText(value)));
      if (exact && countryInput.value === value && !countryCode) useCountry(exact.code);
    } catch { /* The form will show a validation message if the catalogue is unavailable. */ }
  });
  cityInput.addEventListener('input',()=>{
    cityInput.setCustomValidity('');
    if (cityInput.value !== selectedCity) selectedCity = '';
  });
  return {
    reset() {
      form.reset();
      countryCode = selectedCity = autoName = '';
      cityInput.readOnly = true;
      countryInput.setCustomValidity('');
      cityInput.setCustomValidity('');
      closeCountry();
      closeCity();
    },
    setMarker(marker) {
      startField.value = marker.start;
      endField.value = marker.end;
      form.elements.marker.value = marker.color;
    },
    values() {
      if (!countryCode) {
        countryInput.setCustomValidity('请从搜索结果中选择国家或地区。');
        countryInput.reportValidity();
        return null;
      }
      const city = cityInput.value.trim();
      if (!city) {
        cityInput.setCustomValidity('请选择或输入城市。');
        cityInput.reportValidity();
        return null;
      }
      return {name:nameField.value.trim()||city, country_code:countryCode, city,
        start_date:startField.value,end_date:endField.value,color:form.elements.marker.value};
    }
  };
}
