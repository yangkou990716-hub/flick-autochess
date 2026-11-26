// 測試用「記憶體假 Firebase」：只在網址帶 ?netmock=1 時由 src/online.js 載入。
// 實作 online.js 用到的 Firebase compat API 子集（initializeApp、database()、ref/child/set/update/remove/push/
// transaction/on/off/once/onDisconnect/ServerValue.TIMESTAMP、.info/connected）。
// 同源的多個分頁共用同一份資料：存在 localStorage（重新整理不會消失），用 BroadcastChannel 通知變更，
// 用 navigator.locks 讓寫入/transaction 不互相打架；分頁關閉（pagehide 或心跳逾時）時執行它的 onDisconnect。
(function (g) {
  const FA = g.FA = g.FA || {};
  const DBK = 'netmock_db', HB = 'netmock_hb_', OD = 'netmock_od_';
  const conn = Math.random().toString(36).slice(2, 10);
  const bc = typeof BroadcastChannel === 'function' ? new BroadcastChannel('netmock') : null;
  const TS = { '.sv': 'timestamp' };
  const parts = p => String(p || '').split('/').filter(Boolean);
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  const readDb = () => { try { return JSON.parse(localStorage.getItem(DBK)) || {}; } catch (e) { return {}; } };
  const writeDb = d => localStorage.setItem(DBK, JSON.stringify(d));
  const getAt = (d, p) => { let o = d; for (const k of parts(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; };
  const resolveTs = v => { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); const o = Array.isArray(v) ? {} : {}; for (const k in v) o[k] = resolveTs(v[k]); return o; } return v; };
  const prune = v => { // Firebase 不存 null 與空物件；陣列存成 {0:..,1:..}
    if (v == null || typeof v !== 'object') return v === undefined ? null : v;
    const o = {}; let n = 0; for (const k in v) { const c = prune(v[k]); if (c != null) { o[k] = c; n++; } }
    return n ? o : null;
  };
  const arrayify = v => { // 讀出時：鍵是 0..n-1 的物件轉回陣列（和 Firebase 一樣）
    if (v == null || typeof v !== 'object') return v;
    const ks = Object.keys(v); ks.forEach(k => v[k] = arrayify(v[k]));
    if (ks.length && ks.every((k, i) => String(i) === k)) return ks.map(k => v[k]);
    return v;
  };
  function setAt(d, p, v) {
    const ks = parts(p); v = prune(resolveTs(clone(v)));
    if (!ks.length) return v || {};
    let o = d; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
    return prune(d) || {};
  }
  // 寫入一律排隊（navigator.locks 跨分頁互斥；沒有就單頁 Promise 鏈）
  let chain = Promise.resolve();
  const locked = fn => (navigator.locks ? navigator.locks.request('netmock', async () => fn()) : (chain = chain.then(fn)));
  const later = fn => setTimeout(fn, 0);

  function Snap(key, v) { this.key = key; this._v = v == null ? null : v; }
  Snap.prototype.val = function () { return arrayify(clone(this._v)); };
  Snap.prototype.exists = function () { return this._v != null; };
  Snap.prototype.child = function (p) { const ks = parts(p); return new Snap(ks[ks.length - 1] || this.key, getAt(this._v, p)); };
  Snap.prototype.forEach = function (cb) { const v = this._v; if (v && typeof v === 'object') for (const k of Object.keys(v).sort()) if (cb(new Snap(k, v[k])) === true) return true; return false; };

  const listeners = new Set();
  function notify() {
    const d = readDb();
    listeners.forEach(L => {
      if (L.path === '.info/connected') return;
      const v = getAt(d, L.path), j = JSON.stringify(v);
      if (L.ev === 'value') { if (j !== L.last) { L.last = j; later(() => listeners.has(L) && L.cb(new Snap(parts(L.path).pop() || null, clone(v)))); } return; }
      const keys = v && typeof v === 'object' ? Object.keys(v).sort() : [];
      if (L.ev === 'child_added') keys.forEach(k => { if (!L.known.has(k)) { L.known.add(k); const cv = clone(v[k]); later(() => listeners.has(L) && L.cb(new Snap(k, cv))); } });
      if (L.ev === 'child_removed') [...L.known].forEach(k => { if (!keys.includes(k)) { L.known.delete(k); later(() => listeners.has(L) && L.cb(new Snap(k, null))); } });
      if (L.ev !== 'child_added') { L.known = new Set(keys); }
      else[...L.known].forEach(k => { if (!keys.includes(k)) L.known.delete(k); });
    });
  }
  if (bc) bc.onmessage = () => notify();
  addEventListener('storage', e => { if (e.key === DBK) notify(); });
  const changed = () => { notify(); if (bc) bc.postMessage(1); };

  // ---- onDisconnect：存在 localStorage，連線（分頁）消失時由自己（pagehide）或別的分頁（心跳逾時）執行 ----
  const odList = () => { try { return JSON.parse(localStorage.getItem(OD + conn)) || []; } catch (e) { return []; } };
  const odSave = a => localStorage.setItem(OD + conn, JSON.stringify(a));
  function runOd(id, d) { let a = []; try { a = JSON.parse(localStorage.getItem(OD + id)) || []; } catch (e) { }
    a.forEach(op => { if (op.op === 'set') d = setAt(d, op.path, op.v); else if (op.op === 'update') for (const k in op.v) d = setAt(d, op.path + '/' + k, op.v[k]); });
    localStorage.removeItem(OD + id); localStorage.removeItem(HB + id); return d; }
  const beat = () => localStorage.setItem(HB + conn, String(Date.now()));
  beat(); setInterval(beat, 500);
  setInterval(() => locked(() => {
    let d = null;
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || !k.startsWith(HB) || k === HB + conn) continue;
      if (Date.now() - (+localStorage.getItem(k) || 0) > 2500) { d = runOd(k.slice(HB.length), d || readDb()); i = -1; } }
    if (d) { writeDb(d); changed(); }
  }), 1000);
  addEventListener('pagehide', () => { const d = runOd(conn, readDb()); writeDb(d); if (bc) bc.postMessage(1); });

  function Ref(path) { this.path = parts(path).join('/'); const ks = parts(path); this.key = ks.length ? ks[ks.length - 1] : null; }
  Ref.prototype = {
    get parent() { const ks = parts(this.path); return ks.length ? new Ref(ks.slice(0, -1).join('/')) : null; },
    get root() { return new Ref(''); },
    child(p) { return new Ref(this.path + '/' + p); },
    orderByKey() { return this; },
    toString() { return 'mock://' + this.path; },
    set(v) { return locked(() => { writeDb(setAt(readDb(), this.path, v)); changed(); }); },
    update(o) { return locked(() => { let d = readDb(); for (const k in o) d = setAt(d, this.path + '/' + k, o[k]); writeDb(d); changed(); }); },
    remove() { return this.set(null); },
    push(v) { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), r = this.child(k); const p = v === undefined ? Promise.resolve() : r.set(v); r.then = (a, b) => p.then(() => r).then(a, b); return r; },
    transaction(fn, onComplete, applyLocally) {
      return locked(() => {
        const d = readDb(), cur = clone(getAt(d, this.path)), nv = fn(arrayify(clone(cur)));
        if (nv === undefined) { const s = new Snap(this.key, cur); onComplete && onComplete(null, false, s); return { committed: false, snapshot: s }; }
        const d2 = setAt(d, this.path, nv); writeDb(d2); changed();
        const s = new Snap(this.key, clone(getAt(d2, this.path))); onComplete && onComplete(null, true, s); return { committed: true, snapshot: s };
      });
    },
    on(ev, cb) {
      const L = { path: this.path, ev, cb, last: undefined, known: new Set() };
      listeners.add(L);
      if (this.path === '.info/connected') { later(() => cb(new Snap('connected', true))); return cb; }
      notify();
      return cb;
    },
    off(ev, cb) { listeners.forEach(L => { if (L.path === this.path && (!ev || L.ev === ev) && (!cb || L.cb === cb)) listeners.delete(L); }); },
    once(ev) { return new Promise(res => later(() => res(new Snap(this.key, clone(this.path === '.info/connected' ? true : getAt(readDb(), this.path)))))); },
    onDisconnect() {
      const path = this.path;
      return {
        set: v => { const a = odList().filter(o => o.path !== path); a.push({ op: 'set', path, v: clone(v) }); odSave(a); return Promise.resolve(); },
        update: v => { const a = odList(); a.push({ op: 'update', path, v: clone(v) }); odSave(a); return Promise.resolve(); },
        remove: () => { const a = odList().filter(o => o.path !== path); a.push({ op: 'set', path, v: null }); odSave(a); return Promise.resolve(); },
        cancel: () => { odSave(odList().filter(o => o.path !== path && !o.path.startsWith(path + '/'))); return Promise.resolve(); }
      };
    }
  };
  const db = { ref: p => new Ref(p || ''), goOffline() { }, goOnline() { } };
  const database = () => db; database.ServerValue = { TIMESTAMP: TS };
  const app = { name: '[DEFAULT]', database };
  FA.netMock = { apps: [], initializeApp(cfg) { this.apps.push(app); return app; }, app: () => app, database, _reset() { localStorage.removeItem(DBK); changed(); }, _dump: readDb, _conn: conn };
})(globalThis);
