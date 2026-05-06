// Main app router & login

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
  document.getElementById('stat-students').textContent = (s.data || []).length;
  document.getElementById('stat-events').textContent = (b.data || []).length;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const week = (b.data || []).filter(e => new Date(e['תאריך']).getTime() > weekAgo);
  document.getElementById('stat-week').textContent = week.length;
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
