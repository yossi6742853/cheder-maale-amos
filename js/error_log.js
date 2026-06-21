/*
 * error_log.js — Global error/exception logger.
 *
 * Captures:
 *   • window.onerror (uncaught exceptions)
 *   • window.onunhandledrejection (promise rejections)
 *   • console.error (wrapped)
 *   • explicit BHT.log(msg, level, extra) for manual instrumentation
 *
 * Forwards to (in order of availability):
 *   1. Supabase error_log table (when supabase client is loaded)
 *   2. Apps Script Webhook action=logError (fallback)
 *   3. localStorage ring buffer (last 200 entries, always)
 *
 * The localStorage buffer is what we show in the #errors admin page.
 *
 * Rate limit: 10 errors / minute, 200 / hour, dedup by message+stack hash.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bht_error_buffer';
  const MAX_BUFFER = 200;
  const RATE_PER_MIN = 10;
  const RATE_PER_HOUR = 200;

  const recentByMin = [];
  const recentByHour = [];
  const seenHashes = new Map();   // hash → count, ttl 1h

  function now() { return Date.now(); }

  function pruneRate() {
    const t = now();
    while (recentByMin.length && recentByMin[0] < t - 60_000) recentByMin.shift();
    while (recentByHour.length && recentByHour[0] < t - 3_600_000) recentByHour.shift();
    for (const [k, e] of seenHashes) {
      if (e.until < t) seenHashes.delete(k);
    }
  }

  function hash(s) {
    let h = 0;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h.toString(36);
  }

  function withinBudget(h) {
    pruneRate();
    if (recentByMin.length >= RATE_PER_MIN) return false;
    if (recentByHour.length >= RATE_PER_HOUR) return false;
    const ex = seenHashes.get(h);
    if (ex) { ex.count++; return false; }
    seenHashes.set(h, { count: 1, until: now() + 3_600_000 });
    recentByMin.push(now());
    recentByHour.push(now());
    return true;
  }

  function getBuffer() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveBuffer(arr) {
    try {
      const trimmed = arr.slice(-MAX_BUFFER);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
  }

  function pushBuffer(entry) {
    const buf = getBuffer();
    buf.push(entry);
    saveBuffer(buf);
  }

  function userInfo() {
    try {
      const u = JSON.parse(sessionStorage.getItem('bht_user') || sessionStorage.getItem('user') || 'null');
      return u ? { email: u.email || u.username, name: u.fullName || u.username, role: u.role } : null;
    } catch (e) { return null; }
  }

  async function shipToSupabase(entry) {
    if (!window.bhtSupabase) return false;
    try {
      const { error } = await window.bhtSupabase.from('error_log').insert({
        user_email: entry.user && entry.user.email,
        build_hash: entry.build,
        url: entry.url,
        message: entry.message,
        stack: entry.stack,
        user_agent: entry.ua,
      });
      return !error;
    } catch (e) { return false; }
  }

  async function shipToAppsScript(entry) {
    try {
      const url = (window.API_URL || (window.api && window.api.URL) || '');
      if (!url) return false;
      const body = new URLSearchParams({
        action: 'logError',
        token: window.AGENT_TOKEN || 'BHT_AGENT_2026',
        payload: JSON.stringify(entry),
      });
      await fetch(url, { method: 'POST', body });
      return true;
    } catch (e) { return false; }
  }

  function log(message, level, extra) {
    level = level || 'error';
    const stack = (extra && extra.stack) || (new Error()).stack || '';
    const h = hash(message + '|' + (stack.split('\n')[1] || ''));
    if (!withinBudget(h)) return;
    const entry = {
      at: new Date().toISOString(),
      level,
      message: String(message).slice(0, 1000),
      stack: String(stack).slice(0, 4000),
      url: location.href,
      ua: navigator.userAgent.slice(0, 200),
      build: window.BHT_BUILD_HASH || 'dev',
      user: userInfo(),
      extra: extra || null,
    };
    pushBuffer(entry);
    // ship (best-effort, non-blocking)
    shipToSupabase(entry).then(ok => { if (!ok) shipToAppsScript(entry); });
  }

  // ─── Wire global handlers ──────────────────────────────────
  window.addEventListener('error', e => {
    log(e.message || 'window.onerror', 'error', {
      source: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error && e.error.stack,
    });
  });

  window.addEventListener('unhandledrejection', e => {
    const r = e.reason || {};
    log('UnhandledRejection: ' + (r.message || String(r)), 'error', {
      stack: r.stack,
    });
  });

  // Wrap console.error so existing code still reaches us
  const origErr = console.error.bind(console);
  console.error = function (...args) {
    try { log(args.map(a => (a && a.message) || String(a)).join(' '), 'error'); } catch (_) {}
    origErr(...args);
  };

  // ─── Public API ────────────────────────────────────────────
  window.BHT = window.BHT || {};
  window.BHT.log = log;
  window.BHT.warn = (m, x) => log(m, 'warn', x);
  window.BHT.info = (m, x) => log(m, 'info', x);
  window.BHT.errorBuffer = getBuffer;
  window.BHT.clearErrorBuffer = function () { saveBuffer([]); };
})();
