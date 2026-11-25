import {flagEmoji} from './calendar-tools.js';
import {dayStickerStrip,stickerNames} from './transport-stickers.js';

export const shortDate = key => Number(key.slice(5,7))+'月'+Number(key.slice(8,10))+'日';
const keyOf = date => date.toISOString().slice(0,10);
const dateAt = (year,month,day) => new Date(Date.UTC(year,month,day));
const shift = (date,days) => new Date(date.getTime()+days*86400000);
const visibleTitle = trip => trip.country_code && trip.city
  ? flagEmoji(trip.country_code)+' - '+trip.city
  : trip.name;

export function makeCalendar({readTrips,readCircles,readStickers,readCircleDraft,readDrawing,onShare}) {
  const calendar = document.querySelector('.calendar');
  const monthLabel = document.querySelector('#month-label');
  const grid = document.querySelector('#weeks');
  const tripList = document.querySelector('#trips');
  const now = new Date();
  let shownMonth = dateAt(now.getFullYear(),now.getMonth(),1);
  let monthChosen = false;

  function makeTripLink(trip,className) {
    const link = document.createElement('a');
    link.className = className;
    link.href = trip.url;
    link.style.setProperty('--trip-color',trip.color);
    link.setAttribute('aria-label',visibleTitle(trip)+'，'+shortDate(trip.start)+'至'+shortDate(trip.end)+'，打开行程');
    return link;
  }
  function makeDay(date,month,trips,circles,tools) {
    const day = keyOf(date);
    const inMonth = date.getUTCMonth() === month;
    const important = circles.get(day);
    const memo = important?.note?.trim();
    const stickers = readStickers(day);
    const adjusting = readCircleDraft() === day;
    const places = inMonth ? dayPlanPlaces(trips,day) : [];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day'+(inMonth?'':' overflow-day')+(important?' important':'')+(adjusting?' circle-draft':'');
    cell.dataset.calendarDay = day;
    if (inMonth) cell.dataset.currentMonth = '';
    if (important) cell.dataset.savedCircle = '';
    if (stickers.length) {
      cell.dataset.savedStickers = '';
      cell.classList.add('sticker-day');
      if (important) cell.setAttribute('aria-keyshortcuts','Shift+Enter');
    }
    cell.tabIndex = tools?.enabled() || important || stickers.length ? 0 : -1;
    const time = important?.time?.slice(0,5);
    cell.setAttribute('aria-label',shortDate(day)+(important?'，重要日期'+(time?'，'+time:''):'')+(memo?'，备注：'+memo:'')+
      (stickers.length?'，交通贴纸：'+stickerNames(stickers):'')+(places.length?'，计划地点：'+places.join('、'):''));
    if (important) cell.title = '查看重要日期';
    const heading = document.createElement('span');
    heading.className = 'day-top';
    const number = document.createElement('span');
    number.className = 'day-num';
    number.textContent = date.getUTCDate();
    heading.append(number);
    if (stickers.length) heading.append(dayStickerStrip(stickers));
    cell.append(heading);
    if (memo || places.length) {
      const writing = document.createElement('span');
      writing.className = 'day-writing';
      writing.setAttribute('aria-hidden','true');
      if (memo) {
        const note = document.createElement('span');
        note.className = 'day-memo';
        note.textContent = memo;
        note.title = memo;
        writing.append(note);
      }
      if (places.length) {
        const list = document.createElement('span');
        list.className = 'day-places';
        for (const place of places) {
          const item = document.createElement('span');
          item.className = 'day-place';
          item.textContent = place;
          item.title = place;
          list.append(item);
        }
        writing.append(list);
      }
      cell.append(writing);
    }
    return cell;
  }
  function dayPlanPlaces(trips,day) {
    const choices = new Set(trips.flatMap(trip=>trip.placesByDay?.[day] || []));
    // Sample from this day's itinerary while keeping the same notes when the month rerenders.
    function rank(place) {
      let hash = 2166136261;
      for (const character of day+'|'+place) hash = Math.imul(hash ^ character.codePointAt(0),16777619);
      return hash >>> 0;
    }
    return [...choices].sort((a,b)=>rank(a)-rank(b)).slice(0,2);
  }
  function markWeeks(month,trips,circles,tools) {
    const year = shownMonth.getUTCFullYear();
    const last = dateAt(year,month+1,0);
    const firstWeek = shift(shownMonth,-((shownMonth.getUTCDay()+6)%7));
    const weeks = document.createDocumentFragment();
    for (let first=firstWeek;first<=last;first=shift(first,7)) {
      const week = document.createElement('div');
      week.className = 'week';
      const days = Array.from({length:7},(_,i)=>shift(first,i));
      week.append(...days.map(date=>makeDay(date,month,trips,circles,tools)));
      const lanes = [];
      for (const trip of trips) {
        const columns = days.flatMap((date,i)=>{
          const day = keyOf(date);
          return (trip.pending || date.getUTCMonth()===month) && day>=trip.start && day<=trip.end ? [i] : [];
        });
        if (!columns.length) continue;
        const start = columns[0],end = columns.at(-1);
        let lane = lanes.findIndex(ranges=>ranges.every(([from,to])=>end<from||start>to));
        if (lane<0) lane=lanes.push([])-1;
        lanes[lane].push([start,end]);
        const mark = trip.pending ? document.createElement('span') : makeTripLink(trip,'mark');
        if (trip.pending) {
          mark.className = 'mark pending';
          mark.setAttribute('aria-hidden','true');
        }
        mark.style.setProperty('--trip-color',trip.color);
        mark.style.setProperty('--start',start);
        mark.style.setProperty('--length',columns.length);
        mark.style.setProperty('--lane',lane);
        week.append(mark);
      }
      if (lanes.length>1) week.style.setProperty('--extra-mark-lanes',lanes.length-1);
      weeks.append(week);
    }
    grid.replaceChildren(weeks);
  }
  function render() {
    const month = shownMonth.getUTCMonth(),year = shownMonth.getUTCFullYear();
    const last = dateAt(year,month+1,0);
    const trips = readTrips().filter(trip=>trip.start<=keyOf(last)&&trip.end>=keyOf(shownMonth));
    const tools = readDrawing();
    const marker = tools?.marker();
    monthLabel.textContent = year+' 年 '+(month+1)+' 月';
    markWeeks(month,marker?[...trips,marker]:trips,readCircles(),tools);
    tripList.replaceChildren(...trips.map(trip=>{
      const row = document.createElement('div');
      row.className = 'trip-row';
      const link = makeTripLink(trip,'trip');
      const swatch = document.createElement('i');
      swatch.className = 'swatch';
      swatch.setAttribute('aria-hidden','true');
      const place = document.createElement('strong');
      place.textContent = visibleTitle(trip);
      const dates = document.createElement('span');
      dates.textContent = shortDate(trip.start)+' – '+shortDate(trip.end);
      link.append(swatch,place,dates);
      row.append(link);
      if (onShare) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'share-button';
        action.textContent = '分享';
        action.setAttribute('aria-label','分享 '+(trip.city||trip.name));
        action.onclick = ()=>onShare(trip);
        row.append(action);
      }
      return row;
    }));
  }
  function showDate(date,manual=false) {
    shownMonth = new Date(date.slice(0,7)+'-01T00:00:00Z');
    monthChosen ||= manual;
  }
  document.querySelector('#prev').onclick = ()=>switchMonth(-1);
  document.querySelector('#next').onclick = ()=>switchMonth(1);
  function switchMonth(delta) {
    shownMonth = dateAt(shownMonth.getUTCFullYear(),shownMonth.getUTCMonth()+delta,1);
    monthChosen = true;
    render();
  }
  return {calendar,grid,render,showDate,hasChosenMonth:()=>monthChosen};
}
