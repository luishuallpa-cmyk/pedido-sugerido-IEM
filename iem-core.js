/* IEM Inventario — núcleo compartido (versión + catálogo offline) */
(function (w) {
  'use strict';
  var VERSION = (w.IEM_CONFIG && w.IEM_CONFIG.VERSION) || (w.IEM && w.IEM.VERSION) || '1.2.9';
  var DB_NAME = 'iem_inventario_db';
  var DB_VER = 1;
  var STORE = 'catalogo';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!w.indexedDB) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      var req = w.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(key, value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /** Guarda catálogo para uso offline (IDB + localStorage de respaldo). */
  function guardarCatalogoOffline(data) {
    if (!data || !data.length) return Promise.resolve(false);
    var payload = { data: data, fechaISO: new Date().toISOString(), version: VERSION };
    var tasks = [];
    tasks.push(
      idbPut('productos', payload).catch(function (e) {
        console.warn('[IEM offline] IDB put', e);
      })
    );
    try {
      w.localStorage.setItem('buscador_respaldo_datos', JSON.stringify(payload));
    } catch (e) {
      console.warn('[IEM offline] localStorage lleno', e);
    }
    return Promise.all(tasks).then(function () { return true; });
  }

  /** Lee catálogo offline: primero IndexedDB, luego localStorage. */
  function leerCatalogoOffline() {
    return idbGet('productos')
      .then(function (payload) {
        if (payload && payload.data && payload.data.length) return payload;
        return null;
      })
      .catch(function () { return null; })
      .then(function (payload) {
        if (payload) return payload;
        try {
          var raw = w.localStorage.getItem('buscador_respaldo_datos');
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (parsed && parsed.data && parsed.data.length) return parsed;
        } catch (e) {}
        return null;
      });
  }

  function setOfflineBadge(on, fechaTexto) {
    var el = document.getElementById('offlineBadge');
    if (!el) return;
    if (on) {
      el.hidden = false;
      el.textContent = fechaTexto
        ? ('📴 Offline · catálogo ' + fechaTexto)
        : '📴 Modo offline';
      el.classList.add('offline-badge-on');
      el.setAttribute('aria-live', 'polite');
    } else {
      el.hidden = true;
      el.classList.remove('offline-badge-on');
    }
  }

  /** Estado de red: actualiza badge y dispara callbacks al recuperar conexión. */
  var _onlineHandlers = [];
  var _offlineHandlers = [];

  function onOnline(fn) {
    if (typeof fn === 'function') _onlineHandlers.push(fn);
  }
  function onOffline(fn) {
    if (typeof fn === 'function') _offlineHandlers.push(fn);
  }

  function notifyOnline() {
    setOfflineBadge(false);
    for (var i = 0; i < _onlineHandlers.length; i++) {
      try { _onlineHandlers[i](); } catch (e) {}
    }
  }
  function notifyOffline() {
    // Solo marca offline de red; el catálogo puede seguir en IDB
    var el = document.getElementById('offlineBadge');
    if (el && el.hidden) {
      setOfflineBadge(true, 'sin red');
    }
    for (var i = 0; i < _offlineHandlers.length; i++) {
      try { _offlineHandlers[i](); } catch (e) {}
    }
  }

  if (typeof w.addEventListener === 'function') {
    w.addEventListener('online', notifyOnline);
    w.addEventListener('offline', notifyOffline);
    // Estado inicial si ya arrancamos sin red
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () { notifyOffline(); });
        } else {
          notifyOffline();
        }
      } catch (eInit) {}
    }
  }

  w.IEM = w.IEM || {};
  w.IEM.VERSION = VERSION;
  w.IEM.guardarCatalogoOffline = guardarCatalogoOffline;
  w.IEM.leerCatalogoOffline = leerCatalogoOffline;
  w.IEM.setOfflineBadge = setOfflineBadge;
  w.IEM.onOnline = onOnline;
  w.IEM.onOffline = onOffline;
})(window);
