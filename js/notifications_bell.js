/**
 * notifications_bell.js — in-app notifications panel in the topbar.
 *
 * Surfaces meaningful events: watchdog auto-restores, smoke failures,
 * daily backup status, recent audit log entries, and any custom toast
 * that other modules push via window.bhtNotify(...).
 *
 * Storage: keeps the last 30 notifications in localStorage under
 * bht_notifications. The badge shows unread count; click marks all read.
 */
(function () {
  'use strict';
  const STORAGE_KEY = 'bht_notifications';
  const MAX_KEEP = 30;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function save(arr) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, MAX_KEEP)));
    } catch (_) {}
  }

  window.bhtNotify = function (msg, kind /* info|success|warn|error */) {
    const list = load();
    const text = String(msg).slice(0, 200);
    // Dedupe — if the same text was added within 60s, just bump its
    // timestamp and don't create a second entry. Same idea protects
    // against a chatty watchdog flooding the bell.
    const now = Date.now();
    const recent = list[0];
    if (recent && recent.msg === text && (now - new Date(recent.at).getTime()) < 60_000) {
      recent.at = new Date().toISOString();
      recent.read = false;
      recent.count = (recent.count || 1) + 1;
      save(list);
      refreshBadge();
      return;
    }
    list.unshift({
      id: now + ':' + Math.random().toString(36).slice(2, 8),
      msg: text,
      kind: kind || 'info',
      at: new Date().toISOString(),
      read: false,
      count: 1,
    });
    save(list);
    refreshBadge();
  };

  function refreshBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    const unread = load().filter(n => !n.read).length;
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtAgo(iso) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'לפני רגע';
    if (diff < 3_600_000) return 'לפני ' + Math.floor(diff/60_000) + ' דק׳';
    if (diff < 86_400_000) return 'לפני ' + Math.floor(diff/3_600_000) + ' שעות';
    return d.toLocaleDateString('he-IL');
  }
  function iconFor(kind) {
    switch (kind) {
      case 'success': return 'bi-check-circle-fill text-success';
      case 'warn':    return 'bi-exclamation-triangle-fill text-warning';
      case 'error':   return 'bi-x-octagon-fill text-danger';
      default:        return 'bi-info-circle-fill text-primary';
    }
  }

  let _panel = null;
  function openPanel() {
    if (_panel) { closePanel(); return; }
    const list = load();
    list.forEach(n => { n.read = true; });
    save(list);
    refreshBadge();
    const p = document.createElement('div');
    p.id = 'notif-panel';
    p.style.cssText = 'position:fixed;top:60px;left:12px;width:340px;max-width:calc(100vw - 24px);background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(15,23,42,.35);max-height:480px;display:flex;flex-direction:column;z-index:1050;overflow:hidden';
    p.innerHTML = `
      <div style="padding:12px 14px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;background:#f8fafc">
        <i class="bi bi-bell-fill text-primary"></i>
        <b style="flex:1">התראות</b>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.bhtClearNotifications()" title="נקה הכל"><i class="bi bi-trash"></i></button>
      </div>
      <div id="notif-list" style="overflow-y:auto;flex:1"></div>`;
    document.body.appendChild(p);
    _panel = p;
    renderPanelList();
    setTimeout(() => document.addEventListener('click', maybeClose, true), 50);
  }
  function maybeClose(e) {
    if (!_panel) return;
    if (_panel.contains(e.target)) return;
    if (e.target.closest('#notif-toggle')) return;
    closePanel();
  }
  function closePanel() {
    if (_panel) { _panel.remove(); _panel = null; }
    document.removeEventListener('click', maybeClose, true);
  }
  function renderPanelList() {
    const cont = document.getElementById('notif-list');
    if (!cont) return;
    const list = load();
    if (!list.length) {
      cont.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8">אין התראות חדשות</div>';
      return;
    }
    cont.innerHTML = list.slice(0, MAX_KEEP).map(n => `
      <div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:flex-start">
        <i class="bi ${iconFor(n.kind)}" style="font-size:1.1rem;margin-top:2px"></i>
        <div style="flex:1">
          <div style="font-size:.88rem;color:#1e293b">${escHtml(n.msg)}${(n.count||1)>1?' <span style="font-size:.7rem;color:#94a3b8">×'+n.count+'</span>':''}</div>
          <div style="font-size:.74rem;color:#94a3b8">${escHtml(fmtAgo(n.at))}</div>
        </div>
      </div>`).join('');
  }

  window.bhtClearNotifications = function () {
    if (!confirm('למחוק את כל ההתראות?')) return;
    save([]);
    renderPanelList();
    refreshBadge();
  };
  window.bhtOpenNotifications = openPanel;

  function ensureBellInTopbar() {
    if (document.getElementById('notif-toggle')) return;
    const userInfo = document.getElementById('user-info');
    if (!userInfo) return;
    const btn = document.createElement('button');
    btn.id = 'notif-toggle';
    btn.className = 'btn btn-sm btn-outline-light position-relative';
    btn.title = 'התראות';
    btn.innerHTML = '<i class="bi bi-bell"></i><span id="notif-badge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="display:none;font-size:9px;padding:2px 5px">0</span>';
    btn.onclick = openPanel;
    userInfo.parentElement.insertBefore(btn, userInfo);
    refreshBadge();
  }

  // Periodic refresh: if other tabs/services pushed events, badge stays current.
  setInterval(refreshBadge, 30000);

  document.addEventListener('DOMContentLoaded', () => {
    ensureBellInTopbar();
    // Welcome the user with one breadcrumb on first load if list is empty
    const list = load();
    if (!list.length && sessionStorage.getItem('user')) {
      window.bhtNotify('ברוך הבא! האתר חי ומסונכרן עם הענן ✓', 'success');
    }
  });
})();
