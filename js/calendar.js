// Monthly calendar with events + Hebrew calendar
let _calCurMonth = new Date();
let _calMode = 'gregorian'; // gregorian | hebrew

function renderCalendar() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-calendar3"></i> לוח שנה</h3>
      <div class="d-flex gap-2">
        <div class="btn-group">
          <button class="btn btn-outline-secondary ${_calMode==='gregorian'?'active':''}" onclick="calSetMode('gregorian')">לועזי</button>
          <button class="btn btn-outline-secondary ${_calMode==='hebrew'?'active':''}" onclick="calSetMode('hebrew')">עברי</button>
        </div>
        <div class="btn-group">
          <button class="btn btn-outline-primary" onclick="calNav(-1)"><i class="bi bi-chevron-right"></i></button>
          <button class="btn btn-outline-primary" id="cal-title" onclick="calToday()"></button>
          <button class="btn btn-outline-primary" onclick="calNav(1)"><i class="bi bi-chevron-left"></i></button>
        </div>
      </div>
    </div>
    <div id="cal-parsha-banner"></div>
    <div id="cal-grid" class="card p-3"></div>
    <div class="row g-3 mt-1">
      <div class="col-md-6">
        <div class="card p-3 h-100">
          <h6><i class="bi bi-stars"></i> חגים ומועדים</h6>
          <div id="cal-holidays"></div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card p-3 h-100">
          <h6><i class="bi bi-clipboard-check"></i> אירועי התנהגות בחודש</h6>
          <div id="cal-list"></div>
        </div>
      </div>
    </div>`;
  document.getElementById('page-calendar').innerHTML = html;
  drawCalendar();
}

function calSetMode(mode) {
  _calMode = mode;
  renderCalendar();
}

function calNav(dir) {
  if (_calMode === 'hebrew' && typeof hebcal !== 'undefined' && hebcal.HDate) {
    try {
      const hd = new hebcal.HDate(_calCurMonth);
      // Anchor to 1st of current Hebrew month, then step exactly one month at a time
      const firstOfMonth = new hebcal.HDate(1, hd.getMonth(), hd.getFullYear());
      const monthLen = firstOfMonth.daysInMonth();
      let nextJs;
      if (dir > 0) {
        // Jump to first day of next Hebrew month
        const lastJs = new hebcal.HDate(monthLen, hd.getMonth(), hd.getFullYear()).greg();
        nextJs = new Date(lastJs);
        nextJs.setDate(nextJs.getDate() + 1);
      } else {
        // Jump back: 1 day before first day of current month
        const firstJs = firstOfMonth.greg();
        nextJs = new Date(firstJs);
        nextJs.setDate(nextJs.getDate() - 1);
      }
      _calCurMonth = nextJs;
      drawCalendar();
      return;
    } catch {}
  }
  _calCurMonth = new Date(_calCurMonth.getFullYear(), _calCurMonth.getMonth() + dir, 1);
  drawCalendar();
}

function calToday() {
  _calCurMonth = new Date();
  drawCalendar();
}

// Hebrew month names — covers all hebcal getMonth() return values
// hebcal months: Nisan=1..Adar=12 normal year; in leap year Adar I=12, Adar II=13
function getHebMonthName(hd) {
  const m = hd.getMonth();
  const isLeap = hd.isLeapYear ? hd.isLeapYear() : (typeof hebcal !== 'undefined' && hebcal.HDate.isLeapYear(hd.getFullYear()));
  const NORMAL = ['','ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר'];
  const LEAP = ['','ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר א','אדר ב'];
  return (isLeap ? LEAP : NORMAL)[m] || '';
}
const HEB_MONTHS_HE = ['ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר','אדר ב'];

function getHebDayLetter(day) {
  // Render day-of-month in Hebrew letters (gematriya)
  if (typeof hebcal !== 'undefined' && hebcal.gematriya) {
    try { return hebcal.gematriya(day); } catch {}
  }
  // Fallback: simple
  return String(day);
}

function holidaysForDate(jsDate) {
  if (typeof hebcal === 'undefined' || !hebcal.HebrewCalendar) return [];
  try {
    const events = hebcal.HebrewCalendar.getHolidaysOnDate(new hebcal.HDate(jsDate), false) || [];
    return events.map(e => {
      try { return e.render('he'); }
      catch { return e.getDesc(); }
    });
  } catch { return []; }
}

function parshaForDate(jsDate) {
  return (typeof getParshaFor === 'function') ? getParshaFor(jsDate) : '';
}

function buildGregorianGrid(year, month, byDay) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const today = new Date();
  const days = ['א','ב','ג','ד','ה','ו','ש'];
  let html = '<table class="table table-bordered mb-0" style="text-align:center;table-layout:fixed"><thead><tr>';
  days.forEach(d => html += `<th style="font-size:.85rem">${d}</th>`);
  html += '</tr></thead><tbody><tr>';
  for (let i = 0; i < startWeekday; i++) html += '<td style="background:#f9fafb"></td>';
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const wd = (startWeekday + d - 1) % 7;
    if (wd === 0 && d > 1) html += '</tr><tr>';
    const jsDate = new Date(year, month, d);
    const dayData = byDay[d];
    const evCount = dayData ? dayData.events.length : 0;
    const mtCount = dayData ? dayData.meetings.length : 0;
    const total = evCount + mtCount;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    const isShabbat = wd === 6;
    const holidays = holidaysForDate(jsDate);
    const hasHoliday = holidays.length > 0;
    const high = dayData && dayData.events.some(e => e['חומרה'] === 'גבוהה');
    let bg = isShabbat ? '#f0f9ff' : '';
    if (hasHoliday) bg = '#fff7ed';
    if (total > 0) bg = high ? '#fee2e2' : evCount > 3 ? '#fef3c7' : '#dbeafe';
    const border = isToday ? 'border:2px solid #0066cc' : '';
    let hebDay = '';
    try {
      if (typeof hebcal !== 'undefined' && hebcal.HDate) {
        const hd = new hebcal.HDate(jsDate);
        const monthName = getHebMonthName(hd);
        hebDay = `<span class="small text-muted" style="font-size:.7rem">${getHebDayLetter(hd.getDate())}${d === 1 || hd.getDate() === 1 ? ' ' + monthName : ''}</span>`;
      }
    } catch {}
    const holidayBadge = hasHoliday ? `<div class="small" style="font-size:.65rem;color:#c2410c;line-height:1.1">${escHtml(holidays.join(', ').slice(0, 30))}</div>` : '';
    html += `<td style="height:90px;padding:4px;background:${bg};${border};cursor:pointer;vertical-align:top" onclick="calShowDay(${d})">
      <div class="d-flex justify-content-between align-items-start">
        <span class="${isToday ? 'fw-bold text-primary' : ''}">${d}</span>
        ${hebDay}
      </div>
      ${holidayBadge}
      ${evCount ? `<div class="small text-danger" style="font-size:.7rem">${evCount} אירועים</div>` : ''}
      ${mtCount ? `<div class="small text-success" style="font-size:.7rem">${mtCount} פגישות</div>` : ''}
    </td>`;
  }
  const totalCells = startWeekday + lastDay.getDate();
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i++) html += '<td style="background:#f9fafb"></td>';
  html += '</tr></tbody></table>';
  return html;
}

function buildHebrewGrid(jsAnchor, byJsDateKey) {
  // Render a Hebrew month based on the HDate of the anchor
  if (typeof hebcal === 'undefined' || !hebcal.HDate) return '<p class="text-muted">לוח שנה עברי לא זמין (hebcal לא נטען)</p>';
  const today = new Date();
  const anchorHd = new hebcal.HDate(jsAnchor);
  const hYear = anchorHd.getFullYear();
  const hMonth = anchorHd.getMonth();
  // First day of Hebrew month
  const first = new hebcal.HDate(1, hMonth, hYear);
  const firstJs = first.greg();
  const startWeekday = firstJs.getDay();
  // Length of Hebrew month
  const monthLen = first.daysInMonth();
  const days = ['א','ב','ג','ד','ה','ו','ש'];
  const monthName = getHebMonthName(first);
  let html = `<table class="table table-bordered mb-0" style="text-align:center;table-layout:fixed"><thead><tr>`;
  days.forEach(d => html += `<th style="font-size:.85rem">${d}</th>`);
  html += '</tr></thead><tbody><tr>';
  for (let i = 0; i < startWeekday; i++) html += '<td style="background:#f9fafb"></td>';
  for (let d = 1; d <= monthLen; d++) {
    const wd = (startWeekday + d - 1) % 7;
    if (wd === 0 && d > 1) html += '</tr><tr>';
    const hd = new hebcal.HDate(d, hMonth, hYear);
    const jsDate = hd.greg();
    const key = jsDate.toISOString().slice(0,10);
    const dayData = byJsDateKey[key];
    const evCount = dayData ? dayData.events.length : 0;
    const mtCount = dayData ? dayData.meetings.length : 0;
    const total = evCount + mtCount;
    const isToday = jsDate.toDateString() === today.toDateString();
    const isShabbat = wd === 6;
    const holidays = holidaysForDate(jsDate);
    const hasHoliday = holidays.length > 0;
    const high = dayData && dayData.events.some(e => e['חומרה'] === 'גבוהה');
    let bg = isShabbat ? '#f0f9ff' : '';
    if (hasHoliday) bg = '#fff7ed';
    if (total > 0) bg = high ? '#fee2e2' : evCount > 3 ? '#fef3c7' : '#dbeafe';
    const border = isToday ? 'border:2px solid #0066cc' : '';
    const gregLabel = `<span class="small text-muted" style="font-size:.7rem">${jsDate.getDate()}/${jsDate.getMonth()+1}</span>`;
    const holidayBadge = hasHoliday ? `<div class="small" style="font-size:.65rem;color:#c2410c;line-height:1.1">${escHtml(holidays.join(', ').slice(0, 30))}</div>` : '';
    html += `<td style="height:90px;padding:4px;background:${bg};${border};cursor:pointer;vertical-align:top" onclick="calShowDay(${jsDate.getDate()}, ${jsDate.getMonth()}, ${jsDate.getFullYear()})">
      <div class="d-flex justify-content-between align-items-start">
        <span class="${isToday ? 'fw-bold text-primary' : ''}" style="font-size:1.1rem">${getHebDayLetter(d)}</span>
        ${gregLabel}
      </div>
      ${holidayBadge}
      ${evCount ? `<div class="small text-danger" style="font-size:.7rem">${evCount} אירועים</div>` : ''}
      ${mtCount ? `<div class="small text-success" style="font-size:.7rem">${mtCount} פגישות</div>` : ''}
    </td>`;
  }
  const totalCells = startWeekday + monthLen;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < trailing; i++) html += '<td style="background:#f9fafb"></td>';
  html += '</tr></tbody></table>';
  // Save current Hebrew month for nav
  window._calHebMonth = hMonth;
  window._calHebYear = hYear;
  window._calHebMonthName = monthName;
  return html;
}

function drawCalendar() {
  const data = getVisibleData();
  const events = data.behavior || [];
  const meetings = data.meetings || [];

  // Build byJsDateKey index (works for both modes)
  const byJsDateKey = {};
  events.forEach(e => {
    if (!e['תאריך']) return;
    const d = new Date(e['תאריך']);
    const key = d.toISOString().slice(0,10);
    byJsDateKey[key] = byJsDateKey[key] || { events: [], meetings: [] };
    byJsDateKey[key].events.push(e);
  });
  meetings.forEach(m => {
    if (!m['תאריך']) return;
    const d = new Date(m['תאריך']);
    const key = d.toISOString().slice(0,10);
    byJsDateKey[key] = byJsDateKey[key] || { events: [], meetings: [] };
    byJsDateKey[key].meetings.push(m);
  });

  let titleHtml = '';
  if (_calMode === 'hebrew' && typeof hebcal !== 'undefined' && hebcal.HDate) {
    const hd = new hebcal.HDate(_calCurMonth);
    const mn = getHebMonthName(hd);
    // Format year: convert 5786 to תשפ"ו (strip leading 5000)
    let yearStr;
    try {
      yearStr = hebcal.gematriya(hd.getFullYear() % 1000);
    } catch { yearStr = String(hd.getFullYear()); }
    titleHtml = `${mn} ${yearStr}`;
  } else {
    titleHtml = _calCurMonth.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  }
  document.getElementById('cal-title').textContent = titleHtml;

  // Parsha banner — show this week's parsha
  const parsha = parshaForDate(new Date());
  const todayHd = (typeof hebcal !== 'undefined' && hebcal.HDate) ? new hebcal.HDate(new Date()).renderGematriya('he') : '';
  document.getElementById('cal-parsha-banner').innerHTML = parsha ?
    `<div class="alert alert-light border mb-2 d-flex justify-content-between align-items-center py-2">
      <span><i class="bi bi-book"></i> פרשת השבוע: <strong>${escHtml(parsha)}</strong></span>
      <span class="text-muted small">${escHtml(todayHd)}</span>
    </div>` : '';

  // Render grid based on mode
  let gridHtml = '';
  if (_calMode === 'hebrew') {
    gridHtml = buildHebrewGrid(_calCurMonth, byJsDateKey);
  } else {
    const year = _calCurMonth.getFullYear();
    const month = _calCurMonth.getMonth();
    const byDay = {};
    Object.keys(byJsDateKey).forEach(k => {
      const d = new Date(k);
      if (d.getFullYear() === year && d.getMonth() === month) {
        byDay[d.getDate()] = byJsDateKey[k];
      }
    });
    gridHtml = buildGregorianGrid(year, month, byDay);
  }
  document.getElementById('cal-grid').innerHTML = gridHtml;

  // Holidays panel
  drawHolidaysPanel();

  // Events list — month-relevant
  const listEl = document.getElementById('cal-list');
  let monthEvents;
  if (_calMode === 'hebrew' && typeof hebcal !== 'undefined' && hebcal.HDate) {
    const hd = new hebcal.HDate(_calCurMonth);
    const hMonth = hd.getMonth(); const hYear = hd.getFullYear();
    monthEvents = events.filter(e => {
      if (!e['תאריך']) return false;
      try {
        const ehd = new hebcal.HDate(new Date(e['תאריך']));
        return ehd.getMonth() === hMonth && ehd.getFullYear() === hYear;
      } catch { return false; }
    });
  } else {
    const year = _calCurMonth.getFullYear();
    const month = _calCurMonth.getMonth();
    monthEvents = events.filter(e => {
      if (!e['תאריך']) return false;
      const d = new Date(e['תאריך']);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }
  // Also include meetings in the month list
  let monthMeetings;
  if (_calMode === 'hebrew' && typeof hebcal !== 'undefined' && hebcal.HDate) {
    const hd = new hebcal.HDate(_calCurMonth);
    const hMonth = hd.getMonth(); const hYear = hd.getFullYear();
    monthMeetings = meetings.filter(m => {
      if (!m['תאריך']) return false;
      try {
        const mhd = new hebcal.HDate(new Date(m['תאריך']));
        return mhd.getMonth() === hMonth && mhd.getFullYear() === hYear;
      } catch { return false; }
    });
  } else {
    const year = _calCurMonth.getFullYear();
    const month = _calCurMonth.getMonth();
    monthMeetings = meetings.filter(m => {
      if (!m['תאריך']) return false;
      const d = new Date(m['תאריך']);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }
  monthEvents.sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  monthMeetings.sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const totalRows = monthEvents.length + monthMeetings.length;
  if (!totalRows) {
    listEl.innerHTML = '<p class="text-muted small mb-0">אין אירועים בחודש</p>';
  } else {
    const stuById = {};
    (data.students||[]).forEach(s => stuById[s['מזהה']] = s);
    const meetRows = monthMeetings.slice(0, 10).map(m => {
      const dt = formatDateBoth(m['תאריך']);
      const stu = stuById[m['תלמיד_מזהה']];
      const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '';
      return `<div class="d-flex justify-content-between border-bottom py-1 small">
        <div><i class="bi bi-people-fill text-primary"></i> <strong>${escHtml(stuName)}</strong> · ${escHtml(m['נושא']||'אסיפה')}${m['רב']?' · '+escHtml(m['רב']):''}</div>
        <div class="text-muted">${escHtml(dt)}</div>
      </div>`;
    }).join('');
    const evRows = monthEvents.slice(0, 30).map(e => {
      const dt = formatDateBoth(e['תאריך']);
      const sev = e['חומרה']==='גבוהה'?'text-danger':e['חומרה']==='נמוכה'?'text-success':'text-warning';
      return `<div class="d-flex justify-content-between border-bottom py-1 small">
        <div><i class="bi bi-circle-fill ${sev}" style="font-size:.5rem"></i> <strong>${escHtml(e['שם תלמיד']||'')}</strong> · ${escHtml(e['קטגוריה']||'')}</div>
        <div class="text-muted">${escHtml(dt)}</div>
      </div>`;
    }).join('');
    listEl.innerHTML = meetRows + evRows;
  }
}

// Show a one-time toast for meetings happening today / tomorrow / day-after.
// Called once after login (from loadStats) to remind staff.
function showMeetingReminders() {
  try {
    const data = getVisibleData();
    const meetings = (data.meetings || []);
    const students = data.students || [];
    const stuById = {};
    students.forEach(s => stuById[s['מזהה']] = s);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const upcoming = meetings.map(m => {
      if (!m['תאריך']) return null;
      const d = new Date(m['תאריך']);
      const dKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const daysAhead = Math.round((dKey - today) / (24*3600*1000));
      if (daysAhead < 0 || daysAhead > 2) return null;
      return { m, daysAhead };
    }).filter(Boolean).slice(0, 5);
    if (!upcoming.length) return;
    // Skip if we already showed today
    const lastShown = sessionStorage.getItem('cheder_meet_reminder_day');
    const todayKey = String(today);
    if (lastShown === todayKey) return;
    sessionStorage.setItem('cheder_meet_reminder_day', todayKey);
    upcoming.forEach(({ m, daysAhead }) => {
      const stu = stuById[m['תלמיד_מזהה']];
      const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '';
      const when = daysAhead === 0 ? 'היום' : daysAhead === 1 ? 'מחר' : 'בעוד יומיים';
      const text = `אסיפה ${when}: ${stuName} · ${m['נושא']||''}`;
      if (typeof notify === 'function') notify(text, 'warn');
    });
  } catch (e) { /* never crash on reminders */ }
}
window.showMeetingReminders = showMeetingReminders;

function drawHolidaysPanel() {
  const el = document.getElementById('cal-holidays');
  if (!el) return;
  if (typeof hebcal === 'undefined' || !hebcal.HebrewCalendar) {
    el.innerHTML = '<p class="text-muted small mb-0">לוח חגים לא זמין</p>';
    return;
  }
  try {
    // Determine date range
    let start, end;
    if (_calMode === 'hebrew' && hebcal.HDate) {
      const hd = new hebcal.HDate(_calCurMonth);
      const first = new hebcal.HDate(1, hd.getMonth(), hd.getFullYear());
      start = first.greg();
      const monthLen = first.daysInMonth();
      end = new hebcal.HDate(monthLen, hd.getMonth(), hd.getFullYear()).greg();
    } else {
      start = new Date(_calCurMonth.getFullYear(), _calCurMonth.getMonth(), 1);
      end = new Date(_calCurMonth.getFullYear(), _calCurMonth.getMonth() + 1, 0);
    }
    const events = hebcal.HebrewCalendar.calendar({
      start, end, sedrot: true, omer: false, candlelighting: false, locale: 'he',
    });
    if (!events.length) {
      el.innerHTML = '<p class="text-muted small mb-0">אין חגים החודש</p>';
      return;
    }
    el.innerHTML = events.map(ev => {
      let desc; try { desc = ev.render('he'); } catch { desc = ev.getDesc(); }
      const jsDate = ev.getDate().greg();
      const greg = jsDate.toLocaleDateString('he-IL');
      let hebDate = '';
      try { hebDate = ev.getDate().renderGematriya('he'); } catch {}
      const flagClass = (typeof ev.getFlags === 'function') ? ev.getFlags() : 0;
      const isMajor = ev.getCategories && ev.getCategories().includes('major');
      const color = isMajor ? 'text-danger' : 'text-warning';
      return `<div class="d-flex justify-content-between border-bottom py-1 small">
        <div><i class="bi bi-stars ${color}"></i> <strong>${escHtml(desc)}</strong></div>
        <div class="text-muted small">${escHtml(hebDate || greg)}</div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = '<p class="text-muted small mb-0">שגיאה בטעינת חגים</p>';
  }
}

function calShowDay(day, monthOverride, yearOverride) {
  const data = getVisibleData();
  const year = (typeof yearOverride === 'number') ? yearOverride : _calCurMonth.getFullYear();
  const month = (typeof monthOverride === 'number') ? monthOverride : _calCurMonth.getMonth();
  const jsDate = new Date(year, month, day);
  window._calDayContext = { day, month, year, isoDate: jsDate.toISOString().slice(0,10) };
  const events = (data.behavior||[]).filter(e => {
    if (!e['תאריך']) return false;
    const d = new Date(e['תאריך']);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
  const meetings = (data.meetings||[]).filter(m => {
    if (!m['תאריך']) return false;
    const d = new Date(m['תאריך']);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
  const dateStr = jsDate.toLocaleDateString('he-IL');
  let hebDate = '';
  let dayHolidays = [];
  let dayParsha = '';
  try {
    if (typeof hebcal !== 'undefined' && hebcal.HDate) {
      hebDate = new hebcal.HDate(jsDate).renderGematriya('he');
      dayHolidays = holidaysForDate(jsDate);
      dayParsha = parshaForDate(jsDate);
    }
  } catch {}

  let body = '';
  if (dayHolidays.length || dayParsha) {
    body += '<div class="alert alert-warning py-2 mb-3">';
    if (dayHolidays.length) body += `<div><i class="bi bi-stars"></i> <strong>${escHtml(dayHolidays.join(', '))}</strong></div>`;
    if (dayParsha) body += `<div class="small mt-1"><i class="bi bi-book"></i> פרשת השבוע: ${escHtml(dayParsha)}</div>`;
    body += '</div>';
  }

  body += `<div class="d-flex justify-content-between align-items-center mb-2">
    <h6 class="mb-0">אירועי התנהגות (${events.length})</h6>
    <button class="btn btn-sm btn-success" onclick="calAddEventForDay()"><i class="bi bi-plus"></i> אירוע חדש</button>
  </div>`;
  if (!events.length) {
    body += '<p class="text-muted small">אין אירועים ביום זה</p>';
  } else {
    events.forEach(e => {
      const sev = e['חומרה']==='גבוהה'?'severity-high':e['חומרה']==='נמוכה'?'severity-low':'severity-mid';
      const reporter = e['דווח_עי'] || '';
      body += `<div class="card p-2 mb-2 ${sev}">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
          <div><strong>${escHtml(e['שם תלמיד']||'')}</strong><span class="cat-badge me-2">${escHtml(e['קטגוריה']||'')}</span></div>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary p-1" onclick="calEditEvent(${e['מזהה']||0})" title="עריכה"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger p-1" onclick="calDeleteEvent(${e['מזהה']||0})" title="מחיקה"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="small mt-1">${escHtml(e['תיאור']||'')}</div>
        ${reporter ? `<small class="text-muted mt-1"><i class="bi bi-person-fill"></i> ${escHtml(reporter)}</small>` : ''}
      </div>`;
    });
  }

  if (meetings.length) {
    body += '<h6 class="mt-3">אסיפות הורים</h6>';
    meetings.forEach(m => {
      const stu = (data.students||[]).find(s => String(s['מזהה']) === String(m['תלמיד_מזהה']));
      const name = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}` : '?';
      body += `<div class="card p-2 mb-2 border-success">
        <strong>${escHtml(name)}</strong> · ${escHtml(m['נושא']||'')}
        <div class="small mt-1">${escHtml(m['סיכום']||'')}</div>
      </div>`;
    });
  }

  const html = `<div class="modal fade" id="cal-day-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header">
      <h5 class="mb-0">${escHtml(dateStr)} ${hebDate ? `<small class="text-muted">· ${escHtml(hebDate)}</small>` : ''}</h5>
      <button class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">${body}</div>
  </div></div></div>`;
  const old = document.getElementById('cal-day-modal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('cal-day-modal')).show();
}

async function calAddEventForDay(existingEvent) {
  const ctx = window._calDayContext || {};
  const data = getVisibleData();
  const sortedStu = (data.students||[]).filter(s => (s['סטטוס']||'פעיל') !== 'סיים').sort((a,b) =>
    String(a['מחזור']).localeCompare(String(b['מחזור'])) ||
    (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  const cats = data.categories || [];
  const e = existingEvent || {};
  const dateStr = ctx.isoDate || new Date().toISOString().slice(0,10);
  const html = `<div class="modal fade" id="cal-ev-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>${existingEvent ? 'עריכת אירוע' : 'אירוע חדש'} · ${escHtml(new Date(dateStr).toLocaleDateString('he-IL'))}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">תלמיד</label>
        <select id="cev-student" class="form-select">
          ${sortedStu.map(s => `<option value="${s['מזהה']}" ${String(e['תלמיד_מזהה'])===String(s['מזהה'])?'selected':''}>${escHtml((s['מחזור']||'')+' · '+(s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('')}
        </select>
      </div>
      <div class="mb-2"><label class="form-label">קטגוריה</label>
        <select id="cev-cat" class="form-select">
          ${cats.map(c => `<option ${(c.name||c['קטגוריה'])===e['קטגוריה']?'selected':''}>${escHtml(c.name||c['קטגוריה'])}</option>`).join('')}
        </select>
      </div>
      <div class="mb-2"><label class="form-label">תיאור</label><textarea id="cev-desc" class="form-control" rows="4">${escHtml(e['תיאור']||'')}</textarea></div>
      <div class="mb-2"><label class="form-label">חומרה</label>
        <select id="cev-sev" class="form-select">
          <option ${e['חומרה']==='נמוכה'?'selected':''}>נמוכה</option>
          <option ${(!e['חומרה']||e['חומרה']==='בינונית')?'selected':''}>בינונית</option>
          <option ${e['חומרה']==='גבוהה'?'selected':''}>גבוהה</option>
        </select>
      </div>
      <div class="mb-2"><label class="form-label">תאריך</label><input id="cev-date" type="date" class="form-control" value="${dateStr}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="calSaveEvent(${existingEvent ? e['מזהה'] : 'null'})"><i class="bi bi-check"></i> שמור</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('cal-ev-modal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('cal-ev-modal')).show();
}

function calEditEvent(eventId) {
  const data = getVisibleData();
  const ev = (data.behavior||[]).find(e => String(e['מזהה']) === String(eventId));
  if (!ev) return alert('האירוע לא נמצא');
  calAddEventForDay(ev);
}

async function calDeleteEvent(eventId) {
  if (!confirm('בטוח למחוק את האירוע?')) return;
  const r = await api('deleteBehavior', [eventId]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  notify('האירוע נמחק', 'success');
  // Refresh calendar + reopen day
  const ctx = window._calDayContext;
  const old = document.getElementById('cal-day-modal');
  if (old) bootstrap.Modal.getInstance(old).hide();
  drawCalendar();
  setTimeout(() => { if (ctx) calShowDay(ctx.day, ctx.month, ctx.year); }, 250);
}

async function calSaveEvent(editId) {
  const data = getVisibleData();
  // Bug #7 fix: don't parseInt — use raw value (string IDs from external imports are valid)
  const sidRaw = document.getElementById('cev-student').value;
  const sid = /^\d+$/.test(sidRaw) ? parseInt(sidRaw) : sidRaw;
  const stu = (data.students||[]).find(s => String(s['מזהה']) === String(sid));
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const reporter = sess.username || 'admin';
  const isoDate = document.getElementById('cev-date').value;  // YYYY-MM-DD
  // Bug #2 fix: parse as local date components — no timezone shift
  const [yy, mm, dd] = isoDate.split('-').map(Number);
  const jsDate = new Date(yy, (mm||1)-1, dd||1);
  const info = (typeof getHebrewInfo === 'function') ? getHebrewInfo(jsDate) : { hdate: '', parsha: '' };
  const obj = {
    'תלמיד_מזהה': sid,
    'שם תלמיד': stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '',
    'קטגוריה': document.getElementById('cev-cat').value,
    'תיאור': document.getElementById('cev-desc').value.trim(),
    'חומרה': document.getElementById('cev-sev').value,
    'תאריך': isoDate,  // store bare YYYY-MM-DD; consumers use parseAnyDate
    'תאריך_עברי': info.hdate,
    'פרשה': info.parsha,
  };
  if (!obj['תלמיד_מזהה'] || !obj['קטגוריה'] || !obj['תיאור']) return alert('תלמיד, קטגוריה ותיאור חובה');
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    const orig = (data.behavior||[]).find(e => String(e['מזהה']) === String(editId));
    if (orig && orig['דווח_עי']) obj['דווח_עי'] = orig['דווח_עי'];
    const r = await api('updateBehavior', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  } else {
    obj['דווח_עי'] = reporter;
    const r = await api('addBehavior', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  }
  hideModal('cal-ev-modal');
  notify(editId ? 'האירוע עודכן' : 'האירוע נוסף', 'success');
  // If new date is in a different month, navigate to it
  const newDate = new Date(isoDate);
  if (newDate.getMonth() !== _calCurMonth.getMonth() || newDate.getFullYear() !== _calCurMonth.getFullYear()) {
    _calCurMonth = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
  }
  drawCalendar();
  // Refresh day modal if open
  const dayModal = document.getElementById('cal-day-modal');
  if (dayModal) bootstrap.Modal.getInstance(dayModal).hide();
  const refreshDay = newDate.getDate();
  setTimeout(() => calShowDay(refreshDay, newDate.getMonth(), newDate.getFullYear()), 300);
  loadStats();
}
