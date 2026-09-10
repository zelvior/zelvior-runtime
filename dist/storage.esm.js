// Zelvior Runtime — MIT — https://github.com/zelvior/zelvior-runtime

// src/modules/storage.js
var DB_NAME = "zelvior-store";
var STORE = "kv";
var hasIDB = typeof indexedDB !== "undefined";
var hasLS = function() {
  try {
    var k = "__zelvior_ls_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}();
var dbPromise = null;
function openDb(dbName) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open(dbName || DB_NAME, 1);
    req.onupgradeneeded = function() {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = function() {
      resolve(req.result);
    };
    req.onerror = function() {
      reject(req.error);
    };
  });
  return dbPromise;
}
function idbGet(key, dbName) {
  return openDb(dbName).then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      tx.onsuccess = function() {
        resolve(tx.result);
      };
      tx.onerror = function() {
        reject(tx.error);
      };
    });
  });
}
function idbSet(key, value, dbName) {
  return openDb(dbName).then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      tx.onsuccess = function() {
        resolve();
      };
      tx.onerror = function() {
        reject(tx.error);
      };
    });
  });
}
function idbDel(key, dbName) {
  return openDb(dbName).then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
      tx.onsuccess = function() {
        resolve();
      };
      tx.onerror = function() {
        reject(tx.error);
      };
    });
  });
}
function idbClear(dbName) {
  return openDb(dbName).then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
      tx.onsuccess = function() {
        resolve();
      };
      tx.onerror = function() {
        reject(tx.error);
      };
    });
  });
}
function idbKeys(dbName) {
  return openDb(dbName).then(function(db) {
    return new Promise(function(resolve, reject) {
      var out = [];
      var req = db.transaction(STORE, "readonly").objectStore(STORE).openKeyCursor ? db.transaction(STORE, "readonly").objectStore(STORE).openKeyCursor() : db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
      req.onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          out.push(cursor.key);
          cursor.continue();
        } else resolve(out);
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  });
}
function lsKey(prefix, key) {
  return prefix + key;
}
function createStore(opts) {
  opts = opts || {};
  var dbName = opts.name || DB_NAME;
  var prefix = "zelvior:" + dbName + ":";
  var mode = opts.mode || "auto";
  var backend = mode === "local" ? "local" : hasIDB ? "idb" : mode === "idb" ? null : "local";
  if (backend === null) {
    return {
      backend: "none",
      get: function() {
        return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback'));
      },
      set: function() {
        return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback'));
      },
      del: function() {
        return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback'));
      },
      clear: function() {
        return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback'));
      },
      keys: function() {
        return Promise.reject(new Error('zelvior/storage: IndexedDB unavailable and mode="idb" forbids fallback'));
      }
    };
  }
  if (backend === "local") {
    if (!hasLS) {
      return {
        backend: "none",
        get: function() {
          return Promise.resolve(void 0);
        },
        set: function() {
          return Promise.resolve();
        },
        del: function() {
          return Promise.resolve();
        },
        clear: function() {
          return Promise.resolve();
        },
        keys: function() {
          return Promise.resolve([]);
        }
      };
    }
    return {
      backend: "local",
      get: function(key) {
        try {
          var raw = localStorage.getItem(lsKey(prefix, key));
          return Promise.resolve(raw == null ? void 0 : JSON.parse(raw));
        } catch (e) {
          return Promise.reject(e);
        }
      },
      set: function(key, value) {
        try {
          localStorage.setItem(lsKey(prefix, key), JSON.stringify(value));
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      },
      del: function(key) {
        try {
          localStorage.removeItem(lsKey(prefix, key));
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      },
      clear: function() {
        try {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) localStorage.removeItem(k);
          }
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      },
      keys: function() {
        try {
          var out = [];
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
          }
          return Promise.resolve(out);
        } catch (e) {
          return Promise.reject(e);
        }
      }
    };
  }
  var lsFallback = mode === "auto" ? createStore({ name: dbName, mode: "local" }) : null;
  function withFallback(promise, fallbackFn) {
    if (!lsFallback) return promise;
    return promise.catch(function() {
      return fallbackFn();
    });
  }
  return {
    backend: "idb",
    get: function(key) {
      return withFallback(idbGet(key, dbName), function() {
        return lsFallback.get(key);
      });
    },
    set: function(key, value) {
      return withFallback(idbSet(key, value, dbName), function() {
        return lsFallback.set(key, value);
      });
    },
    del: function(key) {
      return withFallback(idbDel(key, dbName), function() {
        return lsFallback.del(key);
      });
    },
    clear: function() {
      return withFallback(idbClear(dbName), function() {
        return lsFallback.clear();
      });
    },
    keys: function() {
      return withFallback(idbKeys(dbName), function() {
        return lsFallback.keys();
      });
    }
  };
}
var _default = null;
function defaultStore() {
  if (!_default) _default = createStore({ name: DB_NAME, mode: "auto" });
  return _default;
}
var capabilities = { indexedDB: hasIDB, localStorage: hasLS };
var hasCrypto = typeof crypto !== "undefined" && !!crypto.subtle;
function deriveKey(passphrase, salt) {
  var enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]).then(function(keyMaterial) {
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  });
}
function toB64(bytes) {
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function fromB64(b64) {
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function createEncryptedStore(store, passphrase) {
  if (!hasCrypto) {
    throw new Error("zelvior-runtime/storage: Web Crypto (crypto.subtle) unavailable, cannot create an encrypted store");
  }
  if (!passphrase || typeof passphrase !== "string") {
    throw new Error("zelvior-runtime/storage: createEncryptedStore requires a non-empty string passphrase");
  }
  function encrypt(value) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(passphrase, salt).then(function(key) {
      var enc = new TextEncoder();
      var data = enc.encode(JSON.stringify(value));
      return crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data).then(function(cipherBuf) {
        return { s: toB64(salt), iv: toB64(iv), c: toB64(new Uint8Array(cipherBuf)) };
      });
    });
  }
  function decrypt(envelope) {
    if (!envelope || typeof envelope !== "object" || !envelope.c) return Promise.resolve(void 0);
    var salt = fromB64(envelope.s);
    var iv = fromB64(envelope.iv);
    var cipher = fromB64(envelope.c);
    return deriveKey(passphrase, salt).then(function(key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher).then(function(plainBuf) {
        var dec = new TextDecoder();
        return JSON.parse(dec.decode(plainBuf));
      });
    });
  }
  return {
    backend: store.backend,
    get: function(key) {
      return store.get(key).then(decrypt);
    },
    set: function(key, value) {
      return encrypt(value).then(function(envelope) {
        return store.set(key, envelope);
      });
    },
    del: function(key) {
      return store.del(key);
    },
    clear: function() {
      return store.clear();
    },
    keys: function() {
      return store.keys();
    }
  };
}
export {
  capabilities,
  createEncryptedStore,
  createStore,
  defaultStore
};
