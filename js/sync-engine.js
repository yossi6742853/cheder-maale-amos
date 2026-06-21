// sync-engine.js — סנכרון מלא בין מסכים, מסך-תלמיד, ו-Sheet. 2026-05-24
// כל שינוי מתוכנן מעדכן את כל המסכים שתלויים בו אוטומטית.

(function () {
  'use strict';

  // ===== Registry: which screens depend on which data =====
  const DEPENDENCIES = {
    'behavior':       ['behavior','reading','writing','lessonsKlein','students','classview','functioning','calendar','reports'],
    'students':       ['students','behavior','reading','writing','lessonsKlein','classview','attendance','tests','functioning','medications','meetings','conversations','signatures','formsMgmt'],
    'tasks':          ['tasks','projects','behavior'],
    'projects':       ['projects','tasks'],
    'attendance':     ['attendance','classview','students'],
    'meetings':       ['meetings','students','calendar'],
    'conversations':  ['conversations','students','calendar'],
    'medications':    ['medications','students'],
    'signatures':     ['signatures','formsMgmt','students'],
    'users':          ['settings','staff'],
    'classes':        ['settings','classview','students','attendance'],
    'categories':     ['settings','behavior'],
  };

  // Map dataType → render fn name (called to refresh screen)
  const RENDER_FNS = {
    'behavior': 'renderBehavior',
    'reading': 'renderReading',
    'writing': 'renderWriting',
    'lessonsKlein': 'renderLessonsKlein',
    'students': 'renderStudents',
    'tasks': 'renderTasks',
    'projects': 'renderProjects',
    'classview': 'renderClassView',
    'functioning': 'renderFunctioning',
    'calendar': 'renderCalendar',
    'reports': 'renderReports',
    'attendance': 'renderAttendance',
    'tests': 'renderTests',
    'medications': 'renderMedications',
    'meetings': 'renderMeetings',
    'conversations': 'renderConversations',
    'signatures': 'renderSignatures',
    'formsMgmt': 'renderFormsMgmt',
    'staff': 'renderStaff',
    'settings': 'renderSettings',
  };

  // Skip auto-render whenever a Bootstrap modal is currently open or while the
  // user is actively typing in a form — re-rendering kills the modal/input state.
  function shouldSkipAutoRender() {
    if (document.querySelector('.modal.show')) return true;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return true;
    return false;
  }

  // ===== Cross-tab sync via storage event (multiple windows of same site) =====
  window.addEventListener('storage', e => {
    if (e.key === 'cheder_bht_data') {
      if (shouldSkipAutoRender()) { console.log('[sync] skip render — modal/input active'); return; }
      console.log('[sync] data changed in another tab, refreshing current view');
      const currentPage = (location.hash || '#home').replace('#', '');
      const fn = RENDER_FNS[currentPage];
      if (fn && typeof window[fn] === 'function') {
        try { window[fn](); } catch (_) { }
      }
    }
  });

  // ===== After any data change, fire custom event =====
  window.addEventListener('cheder-data-refreshed', e => {
    const detail = e.detail || {};
    const changedType = detail.type;
    if (!changedType) return;
    const screens = DEPENDENCIES[changedType] || [changedType];
    const currentPage = (location.hash || '#home').replace('#', '');
    if (screens.includes(currentPage)) {
      const fn = RENDER_FNS[currentPage];
      if (fn && typeof window[fn] === 'function') {
        setTimeout(() => {
          if (shouldSkipAutoRender()) { console.log('[sync] skip auto-render — modal/input active'); return; }
          try { window[fn](); } catch (_) { }
        }, 100);
      }
    }
  });

  // ===== Patch api.js helpers to emit sync events after mutations =====
  const origApi = window.api;
  if (typeof origApi === 'function') {
    window.api = async function (action, args) {
      const r = await origApi.apply(this, arguments);
      // Detect mutations and emit sync event
      const MUTATIONS = {
        addBehavior: 'behavior', updateBehavior: 'behavior', deleteBehavior: 'behavior',
        addStudent: 'students', updateStudent: 'students', deleteStudent: 'students',
        addTask: 'tasks', updateTask: 'tasks', deleteTask: 'tasks',
        addProject: 'projects', updateProject: 'projects', deleteProject: 'projects',
        addAttendance: 'attendance', updateAttendance: 'attendance',
        addMeeting: 'meetings', updateMeeting: 'meetings', deleteMeeting: 'meetings',
        addConversation: 'conversations', updateConversation: 'conversations', deleteConversation: 'conversations',
        addMedication: 'medications', updateMedication: 'medications', deleteMedication: 'medications',
        addSignature: 'signatures', updateSignature: 'signatures', deleteSignature: 'signatures',
        addUser: 'users', updateUser: 'users', deleteUser: 'users',
      };
      if (MUTATIONS[action] && r && r.ok !== false) {
        window.dispatchEvent(new CustomEvent('cheder-data-refreshed', { detail: { type: MUTATIONS[action], action } }));
      }
      return r;
    };
  }

  // ===== Periodic full-sync: pull from Sheet every 60s if any open tab =====
  let _lastSync = Date.now();
  setInterval(() => {
    if (document.hidden) return; // don't sync hidden tabs
    if (Date.now() - _lastSync < 55000) return;
    _lastSync = Date.now();
    if (typeof window.syncFromSheet === 'function') {
      window.syncFromSheet().catch(_ => { });
    }
  }, 60000);

  // ===== Visual indicator of sync status =====
  function showSyncIndicator(state) {
    let ind = document.getElementById('sync-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'sync-indicator';
      ind.style.cssText = 'position:fixed;bottom:10px;left:10px;font-size:11px;padding:4px 8px;border-radius:4px;z-index:9999;font-family:Heebo,Arial;direction:rtl;opacity:0.7;pointer-events:none';
      document.body.appendChild(ind);
    }
    if (state === 'syncing') {
      ind.style.background = '#fef3c7';
      ind.style.color = '#92400e';
      ind.textContent = '⟳ מסנכרן...';
    } else if (state === 'ok') {
      ind.style.background = '#d1fae5';
      ind.style.color = '#065f46';
      ind.textContent = '✓ מסונכרן';
      setTimeout(() => { if (ind) ind.style.opacity = '0'; }, 2000);
    } else if (state === 'error') {
      ind.style.background = '#fee2e2';
      ind.style.color = '#991b1b';
      ind.textContent = '⚠ שגיאת סנכרון';
    }
  }
  window.showSyncIndicator = showSyncIndicator;

  window.addEventListener('cheder-data-refreshed', () => showSyncIndicator('ok'));
  window.addEventListener('cheder-sync-error', () => showSyncIndicator('error'));

  console.warn('%c🔄 sync-engine loaded — cross-screen + cross-tab + Sheet sync', 'color:#2563eb;font-weight:bold');
})();
