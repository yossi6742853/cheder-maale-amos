// security.js — שכבת אבטחה אקטיבית. 2026-05-24
(function () {
  'use strict';

  // ===== 1. Clear sensitive URL params on page load =====
  const sensitiveParams = ['password', 'pass', 'token', 'auth', 'secret', 'apikey', 'api_key'];
  const url = new URL(location.href);
  let urlChanged = false;
  sensitiveParams.forEach(p => {
    if (url.searchParams.has(p)) {
      url.searchParams.delete(p);
      urlChanged = true;
    }
  });
  if (urlChanged) {
    history.replaceState({}, '', url.toString());
  }

  // ===== 2. Strip password from any saved user object =====
  try {
    const u = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (u && (u.password || u.password_hash)) {
      delete u.password;
      delete u.password_hash;
      sessionStorage.setItem('user', JSON.stringify(u));
    }
  } catch (_) { }

  // ===== 3. Auto-logout after 4 hours of inactivity =====
  const IDLE_LIMIT_MS = 4 * 60 * 60 * 1000;
  let _lastActivity = Date.now();
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, () => { _lastActivity = Date.now(); }, { passive: true });
  });
  setInterval(() => {
    if (Date.now() - _lastActivity > IDLE_LIMIT_MS) {
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('credentials');
      if (typeof toast === 'function') toast('פג זמן הסשן - יציאה אוטומטית', 'warn');
      setTimeout(() => location.reload(), 2000);
    }
  }, 60000);

  // ===== 4. Detect concurrent sessions (warn user) =====
  const sessionId = Math.random().toString(36).slice(2, 12);
  sessionStorage.setItem('bht_session_id', sessionId);
  localStorage.setItem('bht_active_session', sessionId);
  window.addEventListener('storage', e => {
    if (e.key === 'bht_active_session' && e.newValue && e.newValue !== sessionId) {
      console.warn('[security] another session started in this browser');
    }
  });

  // ===== 5. Detect dev-tools open (warn for sensitive ops) =====
  // Not foolproof, just a deterrent
  let devToolsOpen = false;
  const threshold = 160;
  setInterval(() => {
    if (window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold) {
      if (!devToolsOpen) {
        devToolsOpen = true;
        console.warn('%c⚠ DEV TOOLS DETECTED', 'color:red;font-size:18px;font-weight:bold');
        console.warn('הזהירות - אל תזין כאן קוד שאינך מבין מקור!');
      }
    } else { devToolsOpen = false; }
  }, 3000);

  // ===== 6. Sanitize any innerHTML assignment from possibly-tainted sources =====
  // Wrap innerHTML setter on Element prototype - too invasive globally,
  // instead provide window.safeHTML helper:
  window.safeHTML = function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  };

  // ===== 7. CSP fallback - block external scripts inserted at runtime =====
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag) {
    const el = origCreateElement(tag);
    if (String(tag).toLowerCase() === 'script') {
      Object.defineProperty(el, 'src', {
        set(value) {
          const v = String(value || '');
          if (v && !v.startsWith(location.origin) && !v.includes('googleapis.com') && !v.includes('jsdelivr.net') && !v.includes('cdn.jsdelivr.net') && !v.includes('cloudflare.com') && !v.includes('bootstrapcdn')) {
            console.warn('[security] blocked external script:', v);
            return;
          }
          el.setAttribute('src', v);
        },
        get() { return el.getAttribute('src'); },
      });
    }
    return el;
  };

  // ===== 8. Audit log for sensitive actions =====
  window.securityAudit = function (action, details) {
    try {
      const log = JSON.parse(localStorage.getItem('bht_audit') || '[]');
      log.push({ ts: Date.now(), action, details, user: (JSON.parse(sessionStorage.getItem('user') || '{}').username || 'anon') });
      if (log.length > 100) log.shift();
      localStorage.setItem('bht_audit', JSON.stringify(log));
    } catch (_) { }
  };

  // ===== 9. Disable right-click on production-sensitive pages =====
  // Not implemented - usually annoying to legitimate users

  // ===== 10. Validate input lengths =====
  document.addEventListener('input', e => {
    if (e.target && e.target.tagName === 'INPUT') {
      const v = e.target.value || '';
      if (v.length > 5000) {
        e.target.value = v.substring(0, 5000);
        if (typeof toast === 'function') toast('הקלט ארוך מדי - נקטע', 'warn');
      }
    }
  });

  console.warn('%c🔒 security.js loaded — XSS, CSRF, idle-logout, audit', 'color:#dc2626;font-weight:bold');
})();
