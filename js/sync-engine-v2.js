// sync-engine-v2.js — Schema-driven sync engine with exponential backoff + isolation. 2026-05-27
// Replaces hardcoded DEPENDENCIES with BHT_SCHEMA derived configuration.
// REPLACES sync-engine.js (legacy continues to work).
(function () {
  'use strict';

  const VERSION = 'v2';
  const MAX_RETRIES = 5;
  const BASE_DELAY = 500;  // ms
  const MAX_DELAY = 30000;  // 30s cap

  /**
   * Compute dependency graph from schema.js.
   * @returns {Object} { tabName: [dependent screens] }
   */
  function buildDependencies() {
    if (typeof window.BHT_SCHEMA !== 'object') {
      console.warn('[Sync-v2] BHT_SCHEMA not loaded - using fallback');
      return {};
    }
    const out = {};
    Object.entries(window.BHT_SCHEMA.SCHEMAS).forEach(([key, schema]) => {
      out[schema.tab] = [key];
      // Add common cross-dependencies
      if (key === 'students') out[schema.tab].push('classview', 'attendance', 'meetings', 'conversations');
      if (key === 'behavior') out[schema.tab].push('reading', 'writing', 'lessonsKlein', 'students', 'reports');
      if (key === 'users') out[schema.tab].push('staff', 'settings');
      if (key === 'classes') out[schema.tab].push('students', 'classview', 'attendance');
    });
    return out;
  }

  /**
   * Exponential backoff retry with isolation per module.
   * @param {Function} fn - async function returning {ok, error?}
   * @param {string} moduleName - for logging
   * @returns {Promise<{ok, error?, attempts}>}
   */
  async function retryWithBackoff(fn, moduleName) {
    let attempt = 0;
    let lastError;
    while (attempt <= MAX_RETRIES) {
      try {
        const r = await fn();
        if (r && r.ok !== false) {
          return { ok: true, attempts: attempt + 1 };
        }
        lastError = r?.error || 'unknown';
      } catch (e) {
        lastError = e.message;
      }
      attempt++;
      if (attempt > MAX_RETRIES) break;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY);
      const jitter = Math.random() * 200;
      console.warn(`[Sync-v2 ${moduleName}] retry ${attempt}/${MAX_RETRIES} in ${(delay+jitter).toFixed(0)}ms (${lastError})`);
      await new Promise(r => setTimeout(r, delay + jitter));
    }
    return { ok: false, error: lastError, attempts: attempt };
  }

  /**
   * Sync a single schema module from sheet → cache.
   * @param {string} schemaKey - e.g. 'students', 'behavior'
   * @returns {Promise<{ok, count?, error?}>}
   */
  async function syncModule(schemaKey) {
    if (typeof window.BHT_SCHEMA !== 'object') return { ok: false, error: 'schema not loaded' };
    const schema = window.BHT_SCHEMA.getSchema(schemaKey);
    if (!schema) return { ok: false, error: 'unknown schema: ' + schemaKey };

    return retryWithBackoff(async () => {
      if (typeof window.pullFromSheet !== 'function') {
        return { ok: false, error: 'pullFromSheet not available' };
      }
      const rows = await window.pullFromSheet(schema.tab);
      if (rows === null) return { ok: false, error: 'pullFromSheet returned null' };
      return { ok: true, count: rows.length };
    }, schemaKey);
  }

  /**
   * Sync ALL schema modules in parallel, with isolation.
   * Failed modules don't block others.
   * @returns {Promise<{success: [], failed: []}>}
   */
  async function syncAll() {
    const schemas = window.BHT_SCHEMA ? window.BHT_SCHEMA.getAllSchemaKeys() : [];
    const results = await Promise.allSettled(
      schemas.map(async key => ({ key, result: await syncModule(key) }))
    );
    const success = [];
    const failed = [];
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.result.ok) {
        success.push(r.value.key);
      } else {
        failed.push({
          key: r.status === 'fulfilled' ? r.value.key : 'unknown',
          error: r.status === 'fulfilled' ? r.value.result.error : r.reason?.message,
        });
      }
    });
    return { success, failed };
  }

  /**
   * Refresh dependent screens after data change.
   * Schema-driven: derives screens from tab→key→render_fn mapping.
   * @param {string} tabName - sheet tab that changed
   */
  function refreshDependents(tabName) {
    const deps = buildDependencies();
    const screens = deps[tabName] || [];
    const renderMap = {
      students: 'renderStudents', behavior: 'renderBehavior',
      reading: 'renderReading', writing: 'renderWriting',
      lessonsKlein: 'renderLessonsKlein', classview: 'renderClassView',
      attendance: 'renderAttendance', tests: 'renderTests',
      medications: 'renderMedications', meetings: 'renderMeetings',
      conversations: 'renderConversations', signatures: 'renderSignatures',
      tasks: 'renderTasks', projects: 'renderProjects',
      staff: 'renderStaff', settings: 'renderSettings',
      reports: 'renderReports', formsMgmt: 'renderFormsMgmt',
      functioning: 'renderFunctioning', calendar: 'renderCalendar',
    };
    // Skip render whenever a modal is open or user is editing — prevents
    // mid-edit page wipes that were killing "save new event" flow.
    const skipAutoRender = () => {
      if (document.querySelector('.modal.show')) return true;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return true;
      return false;
    };
    screens.forEach(screen => {
      const fn = renderMap[screen];
      if (fn && typeof window[fn] === 'function') {
        try {
          // Only re-render if user is currently on that page
          const hash = location.hash.replace('#', '');
          if (hash === screen) {
            if (skipAutoRender()) { console.log('[Sync-v2] skip render — modal/input active'); return; }
            window[fn]();
          }
        } catch (e) {
          console.warn(`[Sync-v2] refresh ${screen} failed:`, e.message);
        }
      }
    });
  }

  /**
   * Expose API + replace legacy where possible.
   */
  window.BhtSync = {
    version: VERSION,
    syncModule,
    syncAll,
    refreshDependents,
    getDependencies: buildDependencies,
    retryWithBackoff,
  };

  // ===== Cross-tab sync via storage event =====
  window.addEventListener('storage', e => {
    if (e.key !== 'cheder_bht_data') return;
    if (document.querySelector('.modal.show')) { console.warn('[Sync-v2] skip cross-tab render — modal open'); return; }
    console.warn('[Sync-v2] data changed in another tab');
    const hash = location.hash.replace('#', '') || 'home';
    const renderMap = { students: 'renderStudents', behavior: 'renderBehavior' };
    const fn = renderMap[hash];
    if (fn && typeof window[fn] === 'function') {
      try { window[fn](); } catch {}
    }
  });

  // ===== Periodic auto-sync (every 5 min when tab visible) =====
  let lastAutoSync = Date.now();
  setInterval(async () => {
    if (document.hidden) return;
    if (Date.now() - lastAutoSync < 5 * 60 * 1000) return;
    lastAutoSync = Date.now();
    if (!navigator.onLine) return;
    const r = await syncAll();
    if (r.failed.length) {
      console.warn('[Sync-v2 auto] failed modules:', r.failed);
    }
  }, 60 * 1000);

  console.warn(`%c🔄 sync-engine-v2 loaded — schema-driven, exp backoff (max ${MAX_RETRIES} retries, ${MAX_DELAY/1000}s cap), per-module isolation`, 'color:#16a34a;font-weight:bold');
  console.log('  Try: BhtSync.syncAll().then(r => console.log(r))');
})();
