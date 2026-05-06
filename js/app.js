// Main app router & login

function toast(msg, type) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = {success:'bi-check-circle-fill', error:'bi-exclamation-triangle-fill', warn:'bi-exclamation-circle-fill'};
  const colors = {success:'#16a34a', error:'#dc2626', warn:'#f59e0b'};
  const icon = icons[type] || 'bi-info-circle-fill';
  const div = document.createElement('div');
  div.className = `toast-msg ${type||''}`;
  div.innerHTML = `<i class="bi ${icon}" style="color:${colors[type]||'#0066cc'};font-size:1.3rem"></i><span>${msg}</span>`;
  container.appendChild(div);
  setTimeout(() => {
    div.classList.add('fadeOut');
    setTimeout(() => div.remove(), 300);
  }, 3000);
}
window.notify = toast;

let currentUser = null;
const PAGES = ['login','home','students','behavior','settings','reports'];

function showPage(name) {
  PAGES.forEach(p => {
    document.getElementById('page-' + p).classList.toggle('d-none', p !== name);
  });
  if (name === 'students' && typeof renderStudents === 'function') renderStudents();
  if (name === 'behavior' && typeof renderBehavior === 'function') renderBehavior();
  if (name === 'settings' && typeof renderSettings === 'function') renderSettings();
  if (name === 'reports' && typeof renderReports === 'function') renderReports();
}

function goto(page) {
  showPage(page);
  history.pushState({page}, '', '#' + page);
}

window.addEventListener('popstate', e => {
  const page = (e.state && e.state.page) || 'home';
  showPage(page);
});

async function doLogin(){
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  if (!u || !p) return;
  // Local fallback: admin/6742 always works
  if (u === 'admin' && p === '6742') {
    currentUser = { username: 'admin', role: 'מנהל', permissions: 'all' };
    sessionStorage.setItem('user', JSON.stringify(currentUser));
    document.getElementById('user-info').innerHTML = u + ' (מנהל) <button class="btn btn-sm btn-outline-light ms-2" onclick="logout()">יציאה</button>';
    showPage('home');
    loadStats();
    filterByPermissions();
    return;
  }
  const r = await api('authenticate', [u, p]);
  if (r.ok && r.data && r.data.ok) {
    currentUser = r.data.user;
    // Augment with permissions from users array
    const userRow = (await api('listUsers',[])).data.find(x=>x['שם משתמש']===u);
    if (userRow) currentUser.permissions = userRow['הרשאות'] || '';
    sessionStorage.setItem('user', JSON.stringify(currentUser));
    document.getElementById('user-info').innerHTML = currentUser.username + ' (' + currentUser.role + ') <button class="btn btn-sm btn-outline-light ms-2" onclick="logout()">יציאה</button>';
    showPage('home');
    loadStats();
    filterByPermissions();
  } else {
    const err = document.getElementById('login-error');
    err.textContent = (r.data && r.data.error) || r.error || 'שגיאה';
    err.classList.remove('d-none');
  }
}

document.getElementById('login-btn').onclick = doLogin;
document.getElementById('password').addEventListener('keypress', e => { if(e.key==='Enter') doLogin(); });

async function loadStats() {
  const s = await api('listStudents', []);
  const b = await api('listBehavior', []);
  const events = b.data || [];
  document.getElementById('stat-students').textContent = (s.data || []).length;
  document.getElementById('stat-events').textContent = events.length;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const week = events.filter(e => new Date(e['תאריך']).getTime() > weekAgo);
  document.getElementById('stat-week').textContent = week.length;
  document.getElementById('stat-high').textContent = events.filter(e => e['חומרה'] === 'גבוהה').length;
  drawTrendChart(events);
  drawRecentActivity(events);
}

function drawTrendChart(events) {
  const el = document.getElementById('trend-chart');
  if (!el || typeof Chart === 'undefined') return;
  // Last 14 days
  const labels = [];
  const counts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toLocaleDateString('he-IL', {day:'numeric',month:'numeric'});
    labels.push(key);
    const dayCount = events.filter(e => {
      const ed = new Date(e['תאריך']);
      return ed.toDateString() === d.toDateString();
    }).length;
    counts.push(dayCount);
  }
  if (window._chart) window._chart.destroy();
  window._chart = new Chart(el, {
    type: 'line',
    data: { labels, datasets: [{ label: 'אירועים', data: counts, borderColor: '#0066cc', backgroundColor: 'rgba(0,102,204,0.1)', tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function drawRecentActivity(events) {
  const el = document.getElementById('recent-activity');
  if (!el) return;
  const sorted = [...events].sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך'])).slice(0, 5);
  if (!sorted.length) {
    el.innerHTML = '<p class="text-muted small mb-0">אין פעילות אחרונה</p>';
    return;
  }
  el.innerHTML = sorted.map(e => {
    const sev = e['חומרה'] === 'גבוהה' ? 'text-danger' : e['חומרה'] === 'נמוכה' ? 'text-success' : 'text-warning';
    const date = e['תאריך'] ? new Date(e['תאריך']).toLocaleDateString('he-IL') : '';
    return `<div class="d-flex justify-content-between border-bottom py-2 small">
      <div><i class="bi bi-circle-fill ${sev}" style="font-size:.6rem"></i> <strong>${e['שם תלמיד']||''}</strong> · ${e['קטגוריה']||''}</div>
      <div class="text-muted">${date}</div>
    </div>`;
  }).join('');
}

// Auto-login from session
const saved = sessionStorage.getItem('user');
if (saved) {
  currentUser = JSON.parse(saved);
  document.getElementById('user-info').innerHTML = currentUser.username + ' (' + currentUser.role + ') <button class="btn btn-sm btn-outline-light ms-2" onclick="logout()">יציאה</button>';
  showPage('home');
  setTimeout(loadStats, 500);
  filterByPermissions();
} else {
  showPage('login');
}

function logout(){
  sessionStorage.removeItem('user');
  location.reload();
}

function hasPermission(area){
  if (!currentUser) return false;
  if (currentUser.role === 'מנהל' || currentUser.permissions === 'all') return true;
  if (!currentUser.permissions) return false;
  return currentUser.permissions.split(',').map(s=>s.trim()).includes(area);
}

function filterByPermissions(){
  const permissions = {
    'students': ['students','all'],
    'behavior': ['behavior','all'],
    'settings': ['all'],
    'reports': ['reports','all'],
  };
  const tiles = document.querySelectorAll('.card-tile');
  tiles.forEach(tile => {
    const onclick = tile.getAttribute('onclick') || '';
    const m = onclick.match(/goto\('([a-z]+)'\)/);
    if (!m) return;
    const area = m[1];
    if (!hasPermission(area)) {
      tile.parentElement.style.display = 'none';
    } else {
      tile.parentElement.style.display = '';
    }
  });
}
