import {flagEmoji} from './calendar-tools.js';

export const shortDate = key => Number(key.slice(5,7))+'月'+Number(key.slice(8,10))+'日';
const keyOf = date => date.toISOString().slice(0,10);
const dateAt = (year,month,day) => new Date(Date.UTC(year,month,day));
const shift = (date,days) => new Date(date.getTime()+days*86400000);
const visibleTitle = trip => trip.country_code && trip.city
  ? flagEmoji(trip.country_code)+' - '+trip.city
  : trip.name;

export function makeCalendar({readTrips,readCircles,readDrawing,onShare}) {
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
  function makeDay(date,month,circles,tools) {
    const day = keyOf(date);
    const inMonth = date.getUTCMonth() === month;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day'+(inMonth?'':' overflow-day')+(circles.has(day)?' important':'');
    cell.dataset.calendarDay = day;
    if (inMonth) cell.dataset.currentMonth = '';
    cell.tabIndex = tools?.enabled() ? 0 : -1;
    cell.setAttribute('aria-label',shortDate(day)+(circles.has(day)?'，重要日期':''));
    const number = document.createElement('span');
    number.className = 'day-num';
    number.textContent = date.getUTCDate();
    cell.append(number);
    return cell;
  }
  function markWeeks(month,trips,circles,tools) {
    const year = shownMonth.getUTCFullYear();
    const last = dateAt(year,month+1,0);
    const firstWeek = shift(shownMonth,-((shownMonth.getUTCDay()+6)%7));
    const labeled = new Set();
    const weeks = document.createDocumentFragment();
    for (let first=firstWeek;first<=last;first=shift(first,7)) {
      const week = document.createElement('div');
      week.className = 'week';
      const days = Array.from({length:7},(_,i)=>shift(first,i));
      week.append(...days.map(date=>makeDay(date,month,circles,tools)));
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
        if (!trip.pending && !labeled.has(trip)) mark.textContent=trip.city||trip.name;
        labeled.add(trip);
        week.append(mark);
      }
      if (lanes.length>1) {
        week.style.setProperty('--row-height',27+lanes.length*33+'px');
        week.style.setProperty('--mobile-row-height',27+lanes.length*33+'px');
      }
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
