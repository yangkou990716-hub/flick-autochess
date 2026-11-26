// 連線對戰（Firebase Realtime Database）
// 同步方式：只同步「輸入」（每發 {by, idx, angle, power, ult, n}），每支手機用固定步長物理自己算同一場戰鬥；
// 房主每發結束寫狀態 hash（snap）＋完整快照（snapData），其他人比對 hash，不一致就讀快照覆蓋。
// 掉線：onDisconnect 標記離線；輪到離線玩家時由房主手機用 FA.ai.choose 代打並寫入 moves；回來就接手。
// 切出 App／重新整理：記住房號自動重連，從快照＋後續 moves 重建。房主掉線時由下一位在線玩家接手。
// 資料：rooms/{4 碼房號} = { v, createdAt, hostId, state(lobby|battle|over), players/{pid}, battle, moves/{g?_n}, snap, snapData, result }
// 第一版：2 人對戰（battle.seats 前 2 位：seat0＝藍方 team0、seat1＝紅方 team1）；players/seat 支援到 8 人，之後擴充。
(function () {
  const FA = globalThis.FA, D = FA.DATA, C = D.config, V = FA.view, RUN = FA.run, BT = FA.battle;
  const $ = id => document.getElementById(id);
  const QS = new URLSearchParams(location.search), MOCK = QS.get('netmock') === '1';
  const MEM_KEY = 'fa_net' + (QS.get('who') ? '_' + QS.get('who') : (MOCK ? '_x' : '')); // ?who= 讓同一台裝置多個分頁當不同玩家（測試用）
  const SAVE_KEY = 'flick_autochess_save_v2';
  const NEED = 2, MAXP = 8, AI_DELAY = 1.5, TURN_LIMIT = 30, ROOM_TTL = 12 * 3600e3, AI_LV = 15;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(4, '0');
  const mkey = (g, n) => 'g' + g + '_' + pad(n);

  // ---------- 記憶（玩家 id、名稱、目前房號） ----------
  const mem = (() => { try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch (e) { return {}; } })();
  if (!mem.pid) mem.pid = 'p' + Math.random().toString(36).slice(2, 12);
  if (!mem.name) mem.name = '玩家' + Math.floor(Math.random() * 900 + 100);
  const saveMem = () => { try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { } };
  saveMem();
  const pid = mem.pid;

  // ---------- Firebase ----------
  let fb = null, db = null, TS = null;
  const configured = () => MOCK || !!FA.NET_CONFIG;
  function ensureDb() {
    if (db) return true;
    if (MOCK) fb = FA.netMock; else { if (!FA.NET_CONFIG || !globalThis.firebase) return false; fb = globalThis.firebase; }
    if (!fb) return false;
    const app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(FA.NET_CONFIG || { projectId: 'netmock' });
    db = app.database ? app.database() : fb.database();
    TS = fb.database.ServerValue.TIMESTAMP;
    return true;
  }

  // ---------- 狀態 ----------
  const R = { code: null, ref: null, hostId: null, players: {}, state: null, battle: null, result: null, offs: [], ld: {} }; // ld：各欄位是否已載入
  let B = null, gen = 0, mySeat = -1, applied = 0, moveMap = {}, snapInfo = null, writing = false, building = false;
  let aiT = 0, aiBusy = false, resyncs = 0, overShown = false, err = '', lobbyBusy = false;
  const ui = { aim: null, msg: '', ultArmed: false };
  const isHost = () => R.hostId === pid;
  const mv = n => moveMap[mkey(gen, n)];
  const sorted = () => Object.entries(R.players).map(([id, p]) => Object.assign({ id }, p)).sort((a, b) => (a.seat - b.seat) || ((a.joinedAt || 0) - (b.joinedAt || 0)));
  const online = id => id === pid ? true : !!(R.players[id] && R.players[id].online);

  // ---------- 介面 ----------
  const app = $('app');
  app.insertAdjacentHTML('beforeend', `
  <section id="net" class="screen hidden"><div id="netBox" class="netbox"></div></section>
  <section id="netb" class="screen hidden">
    <canvas id="netcv"></canvas>
    <div id="netHud" class="bhud nethud"></div>
    <button id="netMenu" class="pausebtn">☰</button>
    <button id="netUlt" class="ultbtn hidden">⚡ 大招</button>
    <div id="netOver" class="netover hidden"></div>
  </section>`);
  const btn = document.createElement('button');
  btn.id = 'btnNet'; btn.className = 'big'; btn.textContent = '🌐 連線對戰';
  $('btnHot').after(btn);
  btn.onclick = () => { err = ''; showScreen('net'); if (configured() && ensureDb() && mem.code && !R.code) rejoin(mem.code); renderLobby(); };

  function showScreen(id) {
    ['title', 'net', 'netb'].forEach(s => $(s).classList.toggle('hidden', s !== id));
    if (id !== 'title') ['shop', 'battle'].forEach(s => $(s).classList.add('hidden'));
    if (id === 'netb') { V.init($('netcv')); V.reset(); V.resize(); startLoop(); }
    else if (loopOn) { loopOn = false; V.init($('cv')); V.resize(); }
    FA.sound && FA.sound.music(id === 'netb' ? 'battle' : 'title');
  }

  // 目前單人局的隊伍（優先用記憶體裡的局，沒有就讀存檔）
  function myRun() {
    const d = FA.debug && FA.debug(); if (d && d.run) return d.run;
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) return s.hs ? s.hs.players[s.hs.cur].run : s.run; } catch (e) { }
    return null;
  }
  function myTeam() {
    const r = myRun();
    if (!r) return { err: '還沒有進行中的單人局：請先「單人新遊戲」，在商店把前台佈好再來。' };
    let code = null; try { code = RUN.exportTeam(r, mem.name); } catch (e) { }
    const t = code && RUN.importTeam(code);
    if (!t || !t.front.length) return { err: '單人局的前台是空的：請先回單人局在商店把前台佈好。' };
    return { code, team: t };
  }

  function renderLobby() {
    const box = $('netBox');
    if (!configured()) {
      box.innerHTML = `<h2>🌐 連線對戰</h2><p class="netwarn">尚未設定連線</p>
        <p class="nethint">連線對戰用免費的 Firebase 即時資料庫。請照 <b>docs/firebase-setup.md</b> 的步驟（只要手機＋Google 帳號）：建立 Firebase 專案 → 開 Realtime Database → 新增 Web 應用，
        把拿到的 <b>firebaseConfig</b> 整段貼給 Claude，填進 data/netconfig.js 就能用了。</p>
        <button id="netBack">返回</button>`;
      $('netBack').onclick = toTitle; return;
    }
    if (!ensureDb()) { box.innerHTML = `<h2>🌐 連線對戰</h2><p class="netwarn">Firebase 載入失敗，請確認網路後重開。</p><button id="netBack">返回</button>`; $('netBack').onclick = toTitle; return; }
    const e = err ? `<p class="netwarn">${esc(err)}</p>` : '';
    if (!R.code) {
      const t = myTeam();
      box.innerHTML = `<h2>🌐 連線對戰</h2>
        <label class="netrow">名稱 <input id="netName" maxlength="12" value="${esc(mem.name)}"></label>
        <p class="nethint">${t.err ? `<span class="netwarn">${esc(t.err)}</span>` : `出戰隊伍：目前單人局的前台 ${t.team.front.length} 隻＋後台 ${t.team.back.length} 隻`}</p>
        <button id="netCreate" class="big go" ${t.err || lobbyBusy ? 'disabled' : ''}>建立房間</button>
        <div class="netrow"><input id="netCode" inputmode="numeric" maxlength="4" placeholder="4 碼房號"><button id="netJoin" ${t.err || lobbyBusy ? 'disabled' : ''}>加入</button></div>
        ${e}<button id="netBack">返回</button>`;
      $('netName').onchange = ev => { mem.name = (ev.target.value || '').trim().slice(0, 12) || mem.name; saveMem(); renderLobby(); };
      $('netCreate').onclick = createRoom;
      $('netJoin').onclick = () => joinRoom(($('netCode').value || '').trim());
      $('netBack').onclick = toTitle; return;
    }
    const ps = sorted(), me = R.players[pid];
    box.innerHTML = `<h2>🌐 房號 <span class="netcode">${esc(R.code)}</span></h2>
      <p class="nethint">把房號告訴朋友，對方在「🌐 連線對戰」輸入房號加入。兩人都按「準備」就開始。</p>
      <div class="netplayers">${ps.map(p => `<div class="netp${p.id === pid ? ' me' : ''}">${p.id === R.hostId ? '👑' : ''}${esc(p.name)}${p.id === pid ? '（你）' : ''}
        <span>${p.online ? '🟢 在線' : '⚪ 離線'}　${p.ready ? '✅ 準備' : '⏳'}</span></div>`).join('')}
        ${ps.length < NEED ? '<div class="netp wait">等待對手加入…</div>' : ''}</div>
      ${e}<button id="netReady" class="big ${me && me.ready ? '' : 'go'}">${me && me.ready ? '取消準備' : '準備'}</button>
      <button id="netLeave">離開房間</button>`;
    $('netReady').onclick = () => setReady(!(me && me.ready));
    $('netLeave').onclick = leaveRoom;
  }
  function toTitle() { showScreen('title'); }

  // ---------- 房間：建立／加入／離開 ----------
  function newPlayer(seat, code) { return { name: mem.name, team: code, ready: false, online: true, seat, joinedAt: TS, lastSeen: TS }; }
  async function createRoom() {
    const t = myTeam(); if (t.err) { err = t.err; return renderLobby(); }
    lobbyBusy = true; err = ''; renderLobby();
    try {
      for (let k = 0; k < 25; k++) {
        const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0'), ref = db.ref('rooms/' + code);
        const s = await ref.once('value'), v = s.val();
        if (v && Date.now() - (v.createdAt || 0) < ROOM_TTL) continue;
        const res = await ref.transaction(cur => (cur && Date.now() - (cur.createdAt || 0) < ROOM_TTL) ? undefined :
          { v: 1, createdAt: TS, hostId: pid, state: 'lobby', players: { [pid]: newPlayer(0, t.code) } }, null, false).catch(() => null);
        if (res && res.committed) { lobbyBusy = false; return enterRoom(code, false); }
      }
      err = '建立房間失敗，請再試一次';
    } catch (e) { err = '建立房間失敗：' + (e.message || e); }
    lobbyBusy = false; renderLobby();
  }
  async function joinRoom(code) {
    if (!/^\d{4}$/.test(code)) { err = '房號是 4 位數字'; return renderLobby(); }
    lobbyBusy = true; err = ''; renderLobby();
    try {
      const ref = db.ref('rooms/' + code), v = (await ref.once('value')).val();
      if (!v || !v.players || Date.now() - (v.createdAt || 0) > ROOM_TTL) throw new Error('找不到房間 ' + code);
      if (v.players[pid]) { lobbyBusy = false; return enterRoom(code, true); } // 同一支手機回來
      const t = myTeam(); if (t.err) throw new Error(t.err);
      const pref = ref.child('players'); let warm; await new Promise(r => { warm = () => r(); pref.on('value', warm); }); // 先等快取載入，transaction 才不會拿到 null
      let why = '';
      const res = await pref.transaction(ps => {
        if (!ps) { why = '找不到房間'; return null; } // 本地還是空的：回 null 讓伺服器比對，有資料會用真值重跑
        const n = Object.keys(ps).length; if (n >= Math.min(NEED, MAXP)) { why = '房間已滿'; return undefined; }
        const used = Object.values(ps).map(p => p.seat); let seat = 0; while (used.includes(seat)) seat++;
        ps[pid] = newPlayer(seat, t.code); return ps;
      }, null, false);
      pref.off('value', warm);
      if (!res.committed || !res.snapshot.val() || !res.snapshot.val()[pid]) throw new Error(why || '加入失敗');
      lobbyBusy = false; return enterRoom(code, false);
    } catch (e) { err = e.message || String(e); }
    lobbyBusy = false; renderLobby();
  }
  async function rejoin(code) { // 記住的房號：房間還在且自己還在名單裡就自動接回
    if (!ensureDb() || R.code) return;
    try {
      const v = (await db.ref('rooms/' + code).once('value')).val();
      if (v && v.players && v.players[pid]) return enterRoom(code, true);
    } catch (e) { }
    mem.code = null; saveMem(); renderLobby();
  }
  async function leaveRoom() {
    const ref = R.ref; if (!ref) return;
    const others = sorted().filter(p => p.id !== pid);
    try {
      ref.child('players/' + pid).onDisconnect().cancel();
      const up = { ['players/' + pid]: null };
      if (isHost() && others.length) up.hostId = (others.find(p => p.online) || others[0]).id;
      await ref.update(up);
    } catch (e) { }
    detach(); mem.code = null; saveMem(); B = null; err = '';
    showScreen('net'); renderLobby();
  }
  function setReady(on) {
    if (!R.ref) return;
    const up = { ready: !!on };
    if (on) { const t = myTeam(); if (!t.err) up.team = t.code; else if (!(R.players[pid] && R.players[pid].team)) { err = t.err; return renderLobby(); } }
    R.ref.child('players/' + pid).update(up);
  }

  // ---------- 進房：監聽 ----------
  function detach() { R.offs.forEach(([r, ev, cb]) => r.off(ev, cb)); R.offs = []; Object.assign(R, { code: null, ref: null, hostId: null, players: {}, state: null, battle: null, result: null, ld: {} }); }
  function listen(ref, ev, cb) { ref.on(ev, cb); R.offs.push([ref, ev, cb]); }
  function enterRoom(code, rebuild) {
    detach();
    R.code = code; R.ref = db.ref('rooms/' + code); mem.code = code; saveMem();
    B = null; gen = 0; applied = 0; moveMap = {}; snapInfo = null; writing = false; overShown = false; err = '';
    R.rebuild = !!rebuild;
    const me = R.ref.child('players/' + pid);
    listen(db.ref('.info/connected'), 'value', s => { // 在線狀態：連上就標記在線，斷線由伺服器標記離線
      if (s.val() !== true || !R.ref) return;
      me.onDisconnect().update({ online: false, lastSeen: TS });
      me.once('value').then(x => { if (x.exists()) me.update({ online: true, lastSeen: TS }); });
    });
    listen(R.ref.child('players'), 'value', s => { R.players = s.val() || {}; if (R.code && !R.players[pid] && R.ld.players) return kicked(); R.ld.players = 1; checkHost(); maybeStart(); refresh(); });
    listen(R.ref.child('hostId'), 'value', s => { R.hostId = s.val(); R.ld.host = 1; checkHost(); maybeStart(); refresh(); });
    listen(R.ref.child('state'), 'value', s => { R.state = s.val(); R.ld.state = 1; maybeStart(); refresh(); });
    listen(R.ref.child('result'), 'value', s => { R.result = s.val(); });
    listen(R.ref.child('moves'), 'child_added', s => { moveMap[s.key] = s.val(); pump(); });
    listen(R.ref.child('moves'), 'child_removed', s => { delete moveMap[s.key]; });
    listen(R.ref.child('snap'), 'value', s => { snapInfo = s.val(); checkSnap(); });
    listen(R.ref.child('battle'), 'value', s => { R.ld.battle = 1; onBattle(s.val()); maybeStart(); });
    showScreen('net'); renderLobby();
  }
  function kicked() { try { R.ref.child('players/' + pid).onDisconnect().cancel(); } catch (e) { } detach(); mem.code = null; saveMem(); B = null; err = '你已不在房間裡'; showScreen('net'); renderLobby(); }
  function refresh() { if (!$('net').classList.contains('hidden')) renderLobby(); if (B && overShown) renderOver(); }

  // 房主不在線 → 在線玩家裡座位最前面的接手房主
  function checkHost() {
    if (!R.ref || !R.ld.players || !R.ld.host) return;
    const h = R.hostId; if (h && online(h)) return;
    const c = sorted().filter(p => online(p.id))[0];
    if (!c || c.id !== pid || !R.players[pid]) return;
    R.ref.child('hostId').transaction(cur => cur === h ? pid : undefined, null, false).catch(() => { });
  }
  // 房主：大家都準備好就開打（寫 battle，清掉舊 moves/snap，重置準備）
  let starting = 0;
  function maybeStart() {
    const L = R.ld; if (!isHost() || !L.players || !L.state || !L.battle || R.state === 'battle') return;
    const ps = sorted().slice(0, NEED);
    if (ps.length < NEED || !ps.every(p => p.ready && online(p.id) && p.team)) return;
    const g = ((R.battle && R.battle.gen) || 0) + 1; if (starting === g) return; starting = g;
    const teams = ps.map(p => RUN.importTeam(p.team)); if (teams.some(t => !t || !t.front.length)) return;
    const up = { state: 'battle', battle: { gen: g, seed: Math.floor(Math.random() * 2 ** 31), seats: ps.map(p => p.id), teams: ps.map(p => p.team), names: ps.map(p => p.name), at: TS },
      snap: null, snapData: null, result: null };
    Object.keys(moveMap).forEach(k => up['moves/' + k] = null);
    ps.forEach(p => up['players/' + p.id + '/ready'] = false);
    R.ref.update(up);
  }

  // ---------- 戰鬥：建立／重建 ----------
  const ext = strats => { const s = RUN.sfx({ strats: strats || [] }); return { mods: s.mods, shots: s.shots, chainAll: s.chainAll, revive: s.revive, echo: s.echo, blastGold: s.blastGold, openFreeze: s.openFreeze, stormZap: s.stormZap }; };
  function makeBattle(bv) { // 雙方都由隊伍代碼建立（兩邊算出同一場）
    const t = bv.teams.map(c => RUN.importTeam(c));
    return BT.create({ pFront: t[0].front, pBack: t[0].back, eFront: t[1].front, eBack: t[1].back, rules: [], env: {}, pExt: ext(t[0].strats), eExt: ext(t[1].strats), seed: bv.seed });
  }
  async function onBattle(bv) {
    R.battle = bv;
    if (!bv) { if (B) { B = null; showScreen('net'); renderLobby(); } return; }
    if (bv.gen === gen && B) return;
    building = true; gen = bv.gen; mySeat = bv.seats.indexOf(pid); overShown = false; $('netOver').classList.add('hidden');
    let nb = makeBattle(bv), n = 0;
    if (R.rebuild) { // 重連：讀快照，之後的 moves 由 pump 快轉補上
      try { const sd = (await R.ref.child('snapData').once('value')).val(); if (sd && sd.g === gen && sd.n > 0) { nb = JSON.parse(sd.data); n = sd.n; } } catch (e) { }
    }
    R.rebuild = true; // 之後再收到同一場（例如重新整理）一律走重建
    if (gen !== bv.gen) return;
    B = nb; applied = n; ui.aim = null; ui.ultArmed = false; writing = false; aiT = 0; building = false;
    showScreen('netb');
    if (B.phase === 'over') showOver();
    V.banner = { txt: (bv.names[0] || '') + ' VS ' + (bv.names[1] || ''), life: 1.4 };
    pump();
  }
  // 套用已收到的 moves：中間的直接算完（快轉），最後一發播動畫
  function pump() {
    if (!B || building) return;
    while (B.phase === 'aim') {
      const m = mv(applied); if (!m) break;
      const instant = !!mv(applied + 1) || document.hidden;
      if (!BT.launch(B, m.idx, m.angle, m.power, !!m.ult)) { console.warn('[net] 無效的一發', m); applied++; afterShot(); continue; }
      if (!instant) break;
      BT.runShot(B); BT.endShot(B); B.events = []; applied++; afterShot(true);
    }
  }
  // 每發結束：房主寫 hash＋快照；其他人比對
  function afterShot(quiet) {
    aiT = 0;
    if (isHost() && !mv(applied)) {
      const h = hashB(B), data = JSON.stringify(B, (k, v) => k === 'events' ? [] : k === 'hurt' ? 0 : v), up = { snap: { g: gen, n: applied, hash: h }, snapData: { g: gen, n: applied, data } };
      if (B.phase === 'over') { up.result = { g: gen, winner: B.winner, n: applied, hash: h }; up.state = 'over'; }
      R.ref.update(up);
    } else checkSnap();
    if (B.phase === 'over' && !quiet) setTimeout(showOver, 900); else if (B.phase === 'over') showOver();
  }
  function checkSnap() {
    if (!B || building || isHost() || !snapInfo || snapInfo.g !== gen || snapInfo.n !== applied || B.phase === 'moving') return;
    if (snapInfo.hash !== hashB(B)) resync();
  }
  async function resync() {
    const sd = (await R.ref.child('snapData').once('value')).val();
    if (!sd || sd.g !== gen || sd.n < applied || (B && B.phase === 'moving')) return;
    console.warn('[net] 狀態不一致，讀房主快照覆蓋', applied, '→', sd.n);
    B = JSON.parse(sd.data); applied = sd.n; resyncs++; V.reset();
    if (B.phase === 'over') showOver();
    pump();
  }
  function hashB(b) { // 狀態 hash（位置取到 0.1、血量取到 0.1）
    const r = v => Math.round(v * 10);
    let s = [b.turn, b.round, b.phase, b.winner, b.shotCount, b.moves.join(',')].join('|');
    b.bodies.forEach(o => { s += '|' + [o.id, o.team, o.alive ? 1 : 0, r(o.x), r(o.y), r(o.hp), r(o.shield), Math.round(o.energy), o.stunned ? 1 : 0, o.acted ? 1 : 0].join(','); });
    let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  // ---------- 出手 ----------
  const ctrlOf = t => R.battle && R.battle.seats[t];
  const myTurn = () => B && !building && B.phase === 'aim' && mySeat >= 0 && B.turn === mySeat && !mv(applied) && !writing;
  function writeMove(m) {
    return R.ref.child('moves/' + mkey(m.g, m.n)).transaction(cur => cur ? undefined : m, null, false);
  }
  function shoot(idx, angle, power, ult) {
    if (!myTurn()) return false;
    writing = true; ui.aim = null;
    writeMove({ g: gen, n: applied, by: pid, idx, angle, power, ult: !!ult }).catch(e => console.warn('[net] 送出失敗', e)).then(() => { writing = false; });
    return true;
  }
  // 房主：輪到離線玩家 → 等一下（給對方回來的機會）再用 AI 代打
  let turnT = 0, turnKey = ''; // 回合計時：每發各自計，超過 TURN_LIMIT 秒沒出手由房主 AI 代打這一發
  function aiTick(dt) {
    if (!B || building || B.phase !== 'aim') return;
    const key = gen + '_' + applied; if (key !== turnKey) { turnKey = key; turnT = 0; aiT = 0; }
    turnT += dt;
    if (!isHost() || mv(applied) || aiBusy) return;
    const c = ctrlOf(B.turn);
    if (online(c)) { aiT = 0; if (turnT < TURN_LIMIT) return; }
    else if ((aiT += dt) < AI_DELAY) return;
    aiBusy = true;
    const n = applied, ch = FA.ai.choose(B, B.turn, D.enemies.difficulty(AI_LV), { s: (R.battle.seed ^ Math.imul(n + 1, 0x9e3779b1) ^ gen) | 0 }); // 獨立亂數，不動到戰鬥本身的 rng
    if (!ch) { aiBusy = false; return; }
    writeMove({ g: gen, n, by: 'ai:' + c, idx: ch.idx, angle: ch.angle, power: ch.power, ult: !!ch.ult }).catch(() => { }).then(() => { aiBusy = false; });
  }

  // ---------- 畫面：客人（seat1）上下翻轉，讓自己永遠在下方 ----------
  const flip = () => mySeat === 1;
  const sw = a => a ? [a[1], a[0]] : a;
  function flipB(b) {
    const v = Object.assign({}, b);
    v.bodies = b.bodies.map(o => Object.assign({}, o, { x: -o.x, y: -o.y, vx: -o.vx, vy: -o.vy, sx: -o.sx, sy: -o.sy, team: 1 - o.team }));
    v.pillars = b.pillars.map(p => Object.assign({}, p, { x: -p.x, y: -p.y }));
    v.zones = b.zones.map(z => Object.assign({}, z, { x: -z.x, y: -z.y, team: 1 - z.team }));
    v.pending = b.pending.map(p => Object.assign({}, p, { x: -p.x, y: -p.y, team: 1 - p.team }));
    v.turn = 1 - b.turn; v.sides = sw(b.sides); v.moves = sw(b.moves); v.movesMax = sw(b.movesMax); v.bonus = sw(b.bonus); v.deaths = sw(b.deaths); v.shots = sw(b.shots);
    v.winner = b.winner == null ? null : 1 - b.winner;
    if (b.lot) v.lot = Object.assign({}, b.lot, { dmg: sw(b.lot.dmg), stack: sw(b.lot.stack), shotN: sw(b.lot.shotN) });
    v.events = [];
    return v;
  }
  const flipEv = e => { const o = Object.assign({}, e); ['x', 'y', 'x1', 'y1', 'x2', 'y2'].forEach(k => { if (typeof o[k] === 'number') o[k] = -o[k]; }); if (typeof o.team === 'number') o.team = 1 - o.team; if (typeof o.winner === 'number') o.winner = 1 - o.winner; return o; };
  function consumeEv() {
    if (!B || !B.events.length) return;
    if (flip()) { V.consume(Object.assign({}, B, { events: B.events.map(flipEv), pillars: (B.pillars || []).map(flipEv) })); B.events = []; } else V.consume(B); // 翻轉視角：事件和柱子座標一起翻，其他欄位（bodies、mover）照用
  }
  let vb = null;

  // ---------- 輸入（翻轉時角度 +180°） ----------
  const cv = $('netcv');
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    if (!myTurn() || !vb) return;
    const w = V.toWorld(e.clientX, e.clientY), me = 0; // 畫面上自己永遠是 team0（翻轉後）
    let best = null, bd = 1e9;
    vb.bodies.forEach(o => { if (o.alive && !o.temp && o.team === me && BT.avail(vb, me).includes(o)) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < o.r + 22 && d < bd) { bd = d; best = o; } } });
    if (best) { drag = best.i; try { cv.setPointerCapture(e.pointerId); } catch (x) { } }
  });
  cv.addEventListener('pointermove', e => {
    if (drag == null || !vb) return;
    const w = V.toWorld(e.clientX, e.clientY), o = vb.bodies[drag], vx = o.x - w.x, vy = o.y - w.y, len = Math.hypot(vx, vy);
    ui.aim = len < 12 ? null : { idx: drag, angle: Math.atan2(vy, vx), power: Math.min(1, len / 140) };
  });
  const up = () => {
    if (drag != null && ui.aim && ui.aim.power > 0.1 && myTurn()) shoot(ui.aim.idx, ui.aim.angle + (flip() ? Math.PI : 0), ui.aim.power, ui.ultArmed), ui.ultArmed = false;
    ui.aim = null; drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { ui.aim = null; drag = null; });
  $('netUlt').onclick = () => { ui.ultArmed = !ui.ultArmed; };
  $('netMenu').onclick = () => {
    $('netOver').innerHTML = `<h2>☰ 連線對戰</h2><p class="nethint">房號 ${esc(R.code)}。離開後對手會由 AI 代打你的棋子。</p><button id="nmBack" class="go">繼續</button><button id="nmLeave">離開房間</button>`;
    $('netOver').classList.remove('hidden');
    $('nmBack').onclick = () => { $('netOver').classList.add('hidden'); if (B && B.phase === 'over') showOver(); };
    $('nmLeave').onclick = leaveRoom;
  };

  // ---------- HUD／結算 ----------
  function hud() {
    const b = B, bv = R.battle; if (!b || !bv) return;
    const me = mySeat >= 0 ? mySeat : 0, op = 1 - me, opId = bv.seats[op], opP = R.players[opId];
    const st = !opP ? '<span class="netoff">已離開－AI 代打</span>' : opP.online ? '<span class="neton">在線</span>' : '<span class="netoff">離線－AI 代打</span>';
    $('netHud').innerHTML = `房號 ${esc(R.code)}｜第 ${b.round} 輪${isHost() ? '　👑' : ''}<br>` +
      `<span style="color:#5cf">${esc(bv.names[me])}${mySeat >= 0 ? '（你）' : ''} 動數 ${Math.max(0, b.moves[me])}/${b.movesMax[me]}</span><br>` +
      `<span style="color:#f77">${esc(bv.names[op])} 動數 ${Math.max(0, b.moves[op])}/${b.movesMax[op]}</span>　${st}`;
    const opOff = !online(opId);
    ui.msg = b.phase === 'over' ? (b.winner === mySeat ? '勝利！' : '落敗…') : b.phase !== 'aim' ? '' :
      b.turn === mySeat ? (writing || mv(applied) ? '傳送中…' : '輪到你：按住棋子往後拉' + (TURN_LIMIT - turnT < 10 ? `（${Math.max(0, Math.ceil(TURN_LIMIT - turnT))} 秒後自動出手）` : '')) : opOff ? `${bv.names[b.turn]} 離線，AI 代打中…` : `輪到 ${bv.names[b.turn]}…`;
    ui.msgCol = b.turn === mySeat ? '#ffe066' : '#f99';
    FA.sound && FA.sound.edge('turn', b.phase === 'aim' && b.turn === mySeat);
    const ready = myTurn() && BT.avail(b, mySeat).some(o => o.energy >= C.ult.max);
    if (!ready) ui.ultArmed = false;
    $('netUlt').classList.toggle('hidden', !ready); $('netUlt').classList.toggle('on', !!ui.ultArmed);
    $('netUlt').textContent = ui.ultArmed ? '⚡ 大招就緒（彈發光的棋子）' : '⚡ 大招';
  }
  function showOver() { if (!B || B.phase !== 'over') return; overShown = true; if (FA.sound && mySeat >= 0) FA.sound.music(B.winner === mySeat ? 'win' : 'lose'); renderOver(); }
  function renderOver() {
    if (!B || B.phase !== 'over' || !R.battle) return;
    const bv = R.battle, win = B.winner === mySeat, ps = R.battle.seats.map(id => R.players[id]);
    $('netOver').innerHTML = `<h2>${mySeat < 0 ? '🏁 ' + esc(bv.names[B.winner]) + ' 獲勝' : win ? '🏆 勝利！' : '💥 落敗…'}</h2>
      <p class="nethint">${bv.names.map((n, i) => `${esc(n)}：剩 ${Math.max(0, B.moves[i])} 動・陣亡 ${B.deaths[i]}`).join('<br>')}</p>
      <p class="nethint">${ps.map((p, i) => p ? `${esc(bv.names[i])} ${p.ready ? '✅ 想再來一場' : p.online ? '' : '⚪ 離線'}` : `${esc(bv.names[i])} 已離開`).join('　')}</p>
      <button id="noAgain" class="go">${R.players[pid] && R.players[pid].ready ? '等待對手…（取消）' : '再來一場'}</button><button id="noLeave">離開</button>`;
    $('netOver').classList.remove('hidden');
    $('noAgain').onclick = () => setReady(!(R.players[pid] && R.players[pid].ready));
    $('noLeave').onclick = leaveRoom;
  }

  // ---------- 主迴圈（只在連線戰鬥畫面跑；main.js 只在 #battle 時畫，不會重疊） ----------
  let loopOn = false, last = 0, acc = 0;
  function startLoop() { if (loopOn) return; loopOn = true; last = performance.now(); acc = 0; sched(); }
  // 假 Firebase 測試時：背景分頁不跑 requestAnimationFrame，用 setTimeout 補（真機只用 rAF）
  function sched() { let done = false; const go = () => { if (!done) { done = true; frame(performance.now()); } }; requestAnimationFrame(go); if (MOCK) setTimeout(go, 40); }
  function frame(now) {
    if (!loopOn) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (B && !building) {
      if (B.phase === 'moving') {
        if (V.hitstop > 0) V.hitstop -= dt;
        else {
          acc += dt; let n = 0;
          while (acc >= C.dt && n++ < 16) {
            acc -= C.dt;
            if (BT.step(B)) { BT.endShot(B); acc = 0; consumeEv(); applied++; afterShot(); pump(); break; }
          }
        }
      } else pump();
      aiTick(dt);
      consumeEv(); V.update(dt); hud();
      vb = flip() ? flipB(B) : B;
      V.draw(vb, ui, dt);
      if (vb !== B) vb.bodies.forEach((o, i) => { if (B.bodies[i]) B.bodies[i].hurt = o.hurt; });
    }
    sched();
  }

  // ---------- 切出 App 再回來：重新讀房間、從快照＋後續 moves 重建 ----------
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); if (R.ref && R.players[pid]) R.ref.child('players/' + pid).update({ online: false, lastSeen: TS }); return; } // 先標離線，對手那邊馬上由 AI 代打
    if (!R.code) return;
    if (Date.now() - hiddenAt > 3000) { const c = R.code; detach(); B = null; enterRoom(c, true); }
    else if (R.players[pid]) R.ref.child('players/' + pid).update({ online: true, lastSeen: TS });
  });

  // ---------- 啟動：假 Firebase（?netmock=1）、記住的房號自動重連 ----------
  function boot() { if (configured() && ensureDb() && mem.code) { showScreen('net'); rejoin(mem.code); } }
  if (MOCK) { const s = document.createElement('script'); s.src = 'src/netmock.js'; s.onload = boot; document.head.appendChild(s); }
  else setTimeout(boot, 0);

  // 測試／除錯用
  FA.online = {
    state: () => ({ code: R.code, host: R.hostId, pid, mySeat, gen, applied, phase: B && B.phase, turn: B && B.turn, winner: B && B.winner, hash: B && hashB(B), moves: B && B.moves.slice(), resyncs, state: R.state, players: R.players, myTurn: !!myTurn(), result: R.result, building }),
    shoot, myTurn, hash: () => B && hashB(B), battle: () => B,
    autoShoot() { if (!myTurn()) return false; const c = FA.ai.choose(B, mySeat, D.enemies.difficulty(AI_LV), { s: (applied * 131 + 7) | 0 }); return c ? shoot(c.idx, c.angle, c.power, c.ult) : false; },
    create: createRoom, join: joinRoom, ready: setReady, leave: leaveRoom, setName: n => { mem.name = n; saveMem(); }
  };
})();
