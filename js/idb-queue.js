// idb-queue.js — IndexedDB durability mirror for the offline write queue.
// Non-invasive: api.js still uses localStorage as the authoritative live queue;
// this module shadows every write into IndexedDB so the queue survives
// localStorage quota errors / partial wipes. On page load, if IDB has items
// the localStorage queue doesn't, they're restored.
//
// Public surface (Promise-based, never throws into the page):
//   bhtIdbQueue.ready          → Promise<boolean>  resolves true if DB open
//   bhtIdbQueue.put(op)        → Promise<id|null>  add mutation op
//   bhtIdbQueue.remove(id)     → Promise<void>
//   bhtIdbQueue.list()         → Promise<Array<{id, op}>>
//   bhtIdbQueue.count()        → Promise<number>
//   bhtIdbQueue.clear()        → Promise<void>
(function () {
  'use strict';
  const DB_NAME = 'bht_queue';
  const DB_VERSION = 1;
  const STORE = 'mutations';

  let _dbPromise = null;

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return _dbPromise;
  }

  function tx(mode) {
    return openDb().then((db) => {
      if (!db) return null;
      try { return db.transaction(STORE, mode).objectStore(STORE); }
      catch (e) { return null; }
    });
  }

  async function put(op) {
    const store = await tx('readwrite');
    if (!store) return null;
    return new Promise((resolve) => {
      try {
        const r = store.add({ op, queuedAt: Date.now() });
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function remove(id) {
    const store = await tx('readwrite');
    if (!store) return;
    return new Promise((resolve) => {
      try {
        const r = store.delete(id);
        r.onsuccess = () => resolve();
        r.onerror = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  async function list() {
    const store = await tx('readonly');
    if (!store) return [];
    return new Promise((resolve) => {
      try {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  async function count() {
    const store = await tx('readonly');
    if (!store) return 0;
    return new Promise((resolve) => {
      try {
        const r = store.count();
        r.onsuccess = () => resolve(r.result || 0);
        r.onerror = () => resolve(0);
      } catch (e) { resolve(0); }
    });
  }

  async function clear() {
    const store = await tx('readwrite');
    if (!store) return;
    return new Promise((resolve) => {
      try {
        const r = store.clear();
        r.onsuccess = () => resolve();
        r.onerror = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  // Batched replace: clear + put-many in ONE transaction (was 1+N transactions).
  // Used by api.js _savePending — called on every queued write, so this is the
  // hot path for offline-heavy sessions.
  async function replaceAll(ops) {
    const db = await openDb();
    if (!db || !Array.isArray(ops)) return false;
    return new Promise((resolve) => {
      try {
        const t = db.transaction(STORE, 'readwrite');
        const s = t.objectStore(STORE);
        s.clear();
        for (const op of ops) {
          try { s.add({ op, queuedAt: (op && op.queuedAt) || Date.now() }); } catch {}
        }
        t.oncomplete = () => resolve(true);
        t.onerror = () => resolve(false);
        t.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  window.bhtIdbQueue = {
    ready: openDb().then((db) => !!db),
    put, remove, list, count, clear, replaceAll,
  };

  // On load, restore any IDB items missing from localStorage (after a quota wipe).
  // This must run AFTER api.js loads, so we wait for the load event.
  function restoreOnLoad() {
    try {
      const lsRaw = localStorage.getItem('cheder_pending_writes') || '[]';
      const ls = JSON.parse(lsRaw);
      list().then((idb) => {
        if (!idb.length) return;
        if (ls.length >= idb.length) return; // localStorage is already at least as full
        // Merge: union by (kind+tab+matchKey+matchValue), prefer the newer queuedAt
        const key = (o) => `${o.kind}|${o.tab || ''}|${o.matchKey || ''}|${o.matchValue || ''}`;
        const lsKeys = new Set(ls.map(key));
        const restored = [];
        for (const row of idb) {
          if (!row.op) continue;
          if (!lsKeys.has(key(row.op))) restored.push({ ...row.op, queuedAt: row.queuedAt || Date.now() });
        }
        if (restored.length) {
          const merged = [...ls, ...restored];
          try { localStorage.setItem('cheder_pending_writes', JSON.stringify(merged)); } catch {}
          console.warn(`[idb-queue] restored ${restored.length} pending writes from IndexedDB after localStorage gap`);
        }
      });
    } catch (e) { /* defensive */ }
  }
  if (document.readyState === 'complete') restoreOnLoad();
  else window.addEventListener('load', restoreOnLoad);

  console.warn('%c💾 idb-queue — IndexedDB durability mirror for offline write queue', 'color:#0891b2;font-weight:bold');
})();
