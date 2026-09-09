// zelvior-runtime/storage -- IndexedDB-backed key/value store with an
// automatic localStorage fallback for browsers/extension contexts without
// IndexedDB (very old WebKit, some locked-down extension sandboxes, private
// mode in a few legacy browsers). ESM source of truth; bundled by build.mjs.
//
// Why IndexedDB by default: localStorage is synchronous and blocks the main
// thread on every read/write, which is exactly the kind of cost this
// runtime exists to remove -- worst on low-end hardware where that
// synchronous I/O competes with everything else. IndexedDB is async and
// off-thread. Callers who need the old synchronous behavior (or explicitly
// want to avoid IndexedDB) can force localStorage via `mode`.

var DB_NAME = 'zelvior-store';
var STORE = 'kv';
var hasIDB = typeof indexedDB !== 'undefined';
var hasLS = (function () {
  try {
    var k = '__zelvior_ls_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
})();

var dbPromise = null;
function openDb(dbName) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    var req = indexedDB.open(dbName || DB_NAME, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  return dbPromise;
}

function idbGet(key, dbName) {
  return openDb(dbName).then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      tx.onsuccess = function () { resolve(tx.result); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function idbSet(key, value, dbName) {
  return openDb(dbName).then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      tx.onsuccess = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function idbDel(key, dbName) {
  return openDb(dbName).then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
      tx.onsuccess = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function idbClear(dbName) {
  return openDb(dbName).then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      tx.onsuccess = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function idbKeys(dbName) {
  return openDb(dbName).then(function (db) {
    return new Promise(function (resolve, reject) {
      var out = [];
      var req = db.transaction(STORE, 'readonly').objectStore(STORE).openKeyCursor
        ? db.transaction(STORE, 'readonly').objectStore(STORE).openKeyCursor()
        : db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = function (e) {
        var cursor = e.target.result;
        if (cursor) { out.push(cursor.key); cursor.continue(); } else resolve(out);
      };
      req.onerror = function () { reject(req.error); };
    });
  });
}

function lsKey(prefix, key) { return prefix + key; }

/**
 * Create a store instance. Defaults to IndexedDB when available, falling
 * back to localStorage automatically (mode: 'auto'). Pass `mode: 'local'`
 * to force localStorage (sync, simple, small data) or `mode: 'idb'` to
 * force IndexedDB and reject if unavailable rather than silently falling
 * back -- useful when a caller needs to guarantee async/off-thread storage.
 *
 * All methods return Promises regardless of backend, so calling code never
 * has to branch on which one is active.
 */
export function createStore(opts) {
  opts = opts || {};
  var dbName = opts.name || DB_NAME;
  var prefix = 'zelvior:' + dbName + ':';
  var mode = opts.mode || 'auto'; // 'auto' | 'idb' | 'local'
  var backend = mode === 'local' ? 'local' : (hasIDB ? 'idb' : (mode === 'idb' ? null : 'local'));

  if (backend === null) {
    return {
      backend: 'none',
      get: function () { return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback')); },
      set: function () { return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback')); },
      del: function () { return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback')); },
      clear: function () { return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback')); },
      keys: function () { return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback')); }
    };
  }

  if (backend === 'local') {
    if (!hasLS) {
      return {
        backend: 'none',
        get: function () { return Promise.resolve(undefined); },
        set: function () { return Promise.resolve(); },
        del: function () { return Promise.resolve(); },
        clear: function () { return Promise.resolve(); },
        keys: function () { return Promise.resolve([]); }
      };
    }
    return {
      backend: 'local',
      get: function (key) {
        try {
          var raw = localStorage.getItem(lsKey(prefix, key));
          return Promise.resolve(raw == null ? undefined : JSON.parse(raw));
        } catch (e) { return Promise.reject(e); }
      },
      set: function (key, value) {
        try { localStorage.setItem(lsKey(prefix, key), JSON.stringify(value)); return Promise.resolve(); }
        catch (e) { return Promise.reject(e); }
      },
      del: function (key) {
        try { localStorage.removeItem(lsKey(prefix, key)); return Promise.resolve(); }
        catch (e) { return Promise.reject(e); }
      },
      clear: function () {
        try {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) localStorage.removeItem(k);
          }
          return Promise.resolve();
        } catch (e) { return Promise.reject(e); }
      },
      keys: function () {
        try {
          var out = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
          }
          return Promise.resolve(out);
        } catch (e) { return Promise.reject(e); }
      }
    };
  }

  // idb backend, with a silent per-call fallback to localStorage only when
  // mode === 'auto' and an IndexedDB op fails at runtime (quota, blocked
  // upgrade, disabled storage in some locked-down extension contexts).
  var lsFallback = mode === 'auto' ? createStore({ name: dbName, mode: 'local' }) : null;
  function withFallback(promise, fallbackFn) {
    if (!lsFallback) return promise;
    return promise.catch(function () { return fallbackFn(); });
  }

  return {
    backend: 'idb',
    get: function (key) { return withFallback(idbGet(key, dbName), function () { return lsFallback.get(key); }); },
    set: function (key, value) { return withFallback(idbSet(key, value, dbName), function () { return lsFallback.set(key, value); }); },
    del: function (key) { return withFallback(idbDel(key, dbName), function () { return lsFallback.del(key); }); },
    clear: function () { return withFallback(idbClear(dbName), function () { return lsFallback.clear(); }); },
    keys: function () { return withFallback(idbKeys(dbName), function () { return lsFallback.keys(); }); }
  };
}

/** Default shared store, created lazily on first use. */
var _default = null;
export function defaultStore() {
  if (!_default) _default = createStore({ name: DB_NAME, mode: 'auto' });
  return _default;
}

export var capabilities = { indexedDB: hasIDB, localStorage: hasLS };
