// 連線自走棋模式（2～4 人，Firebase Realtime Database）：每回合 商店 45 秒 → 兩兩對戰 → 結算扣血，剩 1 人或 15 回合結束
// 商店在自己手機算（src/core/league.js＋run.js，獨立亂數），只把隊伍代碼寫進 Firebase；對戰沿用 1v1 的「同步輸入」做法，
// 每一對各自的 moves／snap；權威端（該對第一位在線玩家，都不在由房主）負責寫快照、結果，並替離線／超時／幽靈 AI 代打。
// 房主：商店時間到（或大家都準備）→ 配對開戰；全部對戰有結果 → 扣血、淘汰、下一回合。房主掉線由下一位在線玩家接手。
// 資料：leagues/{4 碼} = { v, createdAt, hostId, state(lobby|play|over), players/{pid}, lg, pairs/{i}, pm/{i}/{r?_n}, ps/{i}, psd/{i}, pr/{i}, res/{pid} }
(function () {
  const FA = globalThis.FA, D = FA.DATA, C = D.config, LD = D.league, V = FA.view, RUN = FA.run, BT = FA.battle, LG = FA.league;
  const U = FA.online && FA.online.util; if (!U || !LG) return;
  const $ = id => document.getElementById(id);
  const QS = new URLSearchParams(location.search), MOCK = U.MOCK;
  const FAST = MOCK && QS.get('fast') === '1'; // 測試：畫面上的對戰也直接算完、AI 不等待
  const TEST_HP = MOCK ? +QS.get('lghp') || 0 : 0; // 測試：起始血量
  const mem = U.mem, GH = LG.GHOST;
  // 換裝置接手連結 ?lgtake=房號.pid.金鑰：這台改用那位玩家的身分（重新載入後自動接回房間、從 Firebase 還原商店進度）
  { const m = /^(\d{4})\.(p[a-z0-9]{4,20})\.([a-z0-9]{16,32})$/.exec(QS.get('lgtake') || '');
    if (m) {
      const clean = () => { const q = new URLSearchParams(location.search); q.delete('lgtake'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); };
      if (mem.pid === m[2] || confirm(`用這個連結接手房間 ${m[1]} 的玩家？\n這台裝置原本的連線身分會被取代。`)) {
        const sw = mem.pid !== m[2]; mem.pid = m[2]; mem.lgKey = m[3]; mem.lgCode = m[1]; U.saveMem(); clean();
        if (sw) { location.reload(); return; }
      } else clean();
    } }
  const pid = mem.pid;
  const RUN_KEY = 'fa_lg_run' + (QS.get('who') ? '_' + QS.get('who') : (MOCK ? '_x' : ''));
  const ROOM_TTL = 12 * 3600e3, AI_LV = 15, MAXPAIR = Math.ceil(LD.maxPlayers / 2);
  const AI_DELAY = FAST ? 0.15 : LD.aiDelay;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mkey = (r, n) => 'r' + r + '_' + String(n).padStart(4, '0');
  const hstr = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };

  // ---------- Firebase ----------
  let db = null, TS = null, off = 0;
  const now = () => Date.now() + off;
  function ensureDb() { if (db) return true; const x = U.configured() && U.ensureDb(); if (!x) return false; db = x.db; TS = x.TS; db.ref('.info/serverTimeOffset').on('value', s => { off = +s.val() || 0; }); return true; }

  // ---------- 狀態 ----------
  const R = { code: null, ref: null, hostId: null, players: {}, state: null, lg: null, pairs: {}, res: {}, snaps: {}, results: {}, offs: [], ld: {} };
  let restored = null, takeOpen = false, run = null, view = -1, scr = 'title', err = '', busy = false, menu = false, overT = 0, lastRes = null;
  const BS = {}; // 每一對：{ pv, r, B, applied, mv:{}, building, writing, turnT, aiT, aiBusy, key }
  const ui = { aim: null, msg: '', ultArmed: false };
  const isHost = () => R.hostId === pid;
  const me = () => R.players[pid];
  const round = () => (R.lg && R.lg.round) || 0;
  const online = id => id === pid ? true : !!(R.players[id] && R.players[id].online && !R.players[id].quit);
  const sorted = () => Object.entries(R.players).map(([id, p]) => Object.assign({ id }, p)).sort((a, b) => (a.seat - b.seat) || ((a.joinedAt || 0) - (b.joinedAt || 0)));
  const alive = () => sorted().filter(p => !p.out);
  const nameOf = id => id === GH ? '幽靈' : (R.players[id] ? R.players[id].name : '？');
  const playing = () => R.state === 'play' && R.lg;
  const amAlive = () => playing() && me() && !me().out && !me().quit;

  // ---------- 介面 ----------
  const app = $('app');
  app.insertAdjacentHTML('beforeend', `
  <section id="lg" class="screen hidden"><div id="lgBox" class="netbox"></div></section>
  <section id="lgb" class="screen hidden">
    <canvas id="lgcv"></canvas>
    <div id="lgHud" class="bhud nethud"></div>
    <button id="lgMenu" class="pausebtn">☰</button>
    <button id="lgUlt" class="ultbtn hidden">⚡ 大招</button>
    <div id="lgOver" class="netover hidden"></div>
    <div id="lgSpec" class="lgspec hidden"></div>
  </section>`);
  $('shop').insertAdjacentHTML('afterbegin', '<div id="lgBar" class="lgbar hidden"></div>');
  const tb = document.createElement('button');
  tb.id = 'btnLeague'; tb.className = 'big'; tb.textContent = '🏆 連線自走棋（2～4 人）';
  ($('btnNet') || $('btnHot')).after(tb);
  tb.onclick = () => { err = ''; menu = false; if (ensureDb() && mem.lgCode && !R.code) rejoin(mem.lgCode); show('lg'); };

  // 畫面切換：title／lg／lgb 是自己的，shop 借 main.js（FA.shopHost）
  function show(id) {
    if (id !== 'shop' && FA.shopHost.active()) FA.shopHost.close();
    ['title', 'net', 'netb', 'shop', 'battle', 'lg', 'lgb'].forEach(s => { const el = $(s); if (el && s !== 'shop') el.classList.toggle('hidden', s !== id); });
    if (id !== 'shop') $('shop').classList.add('hidden');
    $('lgBar').classList.toggle('hidden', id !== 'shop');
    const was = scr; scr = id;
    if (id === 'lgb' && was !== 'lgb') { V.init($('lgcv')); V.reset(); V.resize(); }
    if (id !== 'lgb' && was === 'lgb') { V.init($('cv')); V.resize(); }
    if (id === 'shop') FA.shopHost.open(run, shopHost);
    if (id === 'lg') renderLobby();
  }
  const shopHost = {
    save: r => saveRun(r),
    ready: () => submit(true),
    quit: () => { menu = true; show('lg'); },
    title: () => `🏆 第 ${round()}/${LD.maxRounds} 回合・商店`,
    fightText: () => '準備 ✓',
    locked: () => false,
    decorate: () => { bar(); const inf = $('info'); if (inf && inf.innerHTML.includes('佈好陣按「前進」選路線。')) inf.innerHTML = inf.innerHTML.replace('佈好陣按「前進」選路線。', `佈好陣按「準備」；${LD.shopSec} 秒到會自動送出目前的前台＋後台。`); }
  };

  // ---------- 自己的 run（存在 localStorage，重新整理接回） ----------
  function saveRun(r) { if (!r || !R.code) return; try { localStorage.setItem(RUN_KEY, JSON.stringify({ code: R.code, created: R.created, pid, run: r })); } catch (e) { } }
  function loadRun() {
    try { const s = JSON.parse(localStorage.getItem(RUN_KEY)); if (s && s.code === R.code && s.pid === pid && s.created === R.created && s.run && s.run.league) return FA.run.migrate ? FA.run.migrate(s.run) : s.run; } catch (e) { } // 舊版存檔先遷移
    return null;
  }
  function ensureRun() {
    if (run) return run;
    run = loadRun() || R.bk || LG.newRun(((R.lg && R.lg.seed) || 1) ^ hstr(pid));
    R.bk = null; saveRun(run); return run;
  }
  // ---------- run 備份到 Firebase：lgrun/{房號}/{pid}/{金鑰}，換裝置（本機沒有進度）時還原 ----------
  // 金鑰只存在自己手機與「換手機接續」連結裡；規則不開放列出 {pid} 底下的鍵，別人讀不到也寫不了
  const BK_MAX = 20000; // 壓縮後字數上限（規則也限制）
  const rid = n => { let x = ''; while (x.length < n) x += Math.random().toString(36).slice(2); return x.slice(0, n); };
  const lgKey = () => { if (!mem.lgKey) { mem.lgKey = rid(20); U.saveMem(); } return mem.lgKey; };
  const bkRef = () => db.ref('lgrun/' + R.code + '/' + pid + '/' + lgKey());
  const b64 = u8 => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(t); };
  async function zip(str) { // 'z' + deflate-raw base64（瀏覽器內建 CompressionStream）；不支援就 'j' + 原 JSON
    if (typeof CompressionStream !== 'function') return 'j' + str;
    try { const b = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer(); return 'z' + b64(new Uint8Array(b)); } catch (e) { return 'j' + str; }
  }
  async function unzip(d) {
    if (d[0] === 'j') return d.slice(1);
    const u8 = Uint8Array.from(atob(d.slice(1)), c => c.charCodeAt(0));
    return await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  let bkLast = '';
  async function backupRun(r) {
    if (!r || !R.ref || !r.league) return;
    const code = R.code, json = JSON.stringify(r); if (json === bkLast) return; bkLast = json;
    const d = await zip(json); if (R.code !== code) return;
    if (d.length > BK_MAX) { console.warn('[lg] 進度太大，未備份', d.length); return; }
    bkRef().set({ r: r.league.round, c: R.created || 0, d }).catch(e => console.warn('[lg] 備份失敗', e));
  }
  async function fetchBackup() {
    try {
      const v = (await bkRef().once('value')).val(); if (!v || !v.d || v.c !== (R.created || 0)) return null;
      const r = JSON.parse(await unzip(v.d)); return r && r.league && Array.isArray(r.front) ? r : null;
    } catch (e) { console.warn('[lg] 還原失敗', e); return null; }
  }
  const runSum = r => ({ gold: r.gold, level: r.level, hp: r.hp, round: r.league.round, applied: r.league.applied, strats: r.strats.length, pending: r.pending && r.pending.type, front: r.front.filter(Boolean).length });
  const takeLink = () => location.origin + location.pathname + '?lgtake=' + R.code + '.' + pid + '.' + lgKey();

  // ---------- 大廳 ----------
  function renderLobby() {
    const box = $('lgBox'), e = err ? `<p class="netwarn">${esc(err)}</p>` : '';
    if (!U.configured()) { box.innerHTML = `<h2>🏆 連線自走棋</h2><p class="netwarn">尚未設定連線</p><p class="nethint">請照 docs/firebase-setup.md 設定 Firebase。</p><button id="lgBack">返回</button>`; $('lgBack').onclick = toTitle; return; }
    if (!ensureDb()) { box.innerHTML = `<h2>🏆 連線自走棋</h2><p class="netwarn">連線元件載入失敗：請確認網路，再重新開啟遊戲。</p><button id="lgBack">返回</button>`; $('lgBack').onclick = toTitle; return; }
    if (!R.code) {
      box.innerHTML = `<h2>🏆 連線自走棋</h2>
        <p class="nethint">2～${LD.maxPlayers} 人各自經營商店，每回合兩兩對戰，輸了扣小隊血量（${LD.hp}）。血量歸零淘汰，剩 1 人或 ${LD.maxRounds} 回合結束時依血量排名。</p>
        <label class="netrow">名稱 <input id="lgName" maxlength="12" value="${esc(mem.name)}"></label>
        <button id="lgCreate" class="big go" ${busy ? 'disabled' : ''}>建立房間</button>
        <div class="netrow"><input id="lgCode" inputmode="numeric" maxlength="4" placeholder="4 碼房號"><button id="lgJoin" ${busy ? 'disabled' : ''}>加入</button></div>
        ${e}<button id="lgBack">返回</button>`;
      $('lgName').onchange = ev => { mem.name = (ev.target.value || '').trim().slice(0, 12) || mem.name; U.saveMem(); };
      $('lgCreate').onclick = createRoom;
      $('lgJoin').onclick = () => joinRoom(($('lgCode').value || '').trim());
      $('lgBack').onclick = toTitle; return;
    }
    const ps = sorted(), host = R.hostId;
    const row = p => `<div class="netp${p.id === pid ? ' me' : ''}${p.out ? ' lgout' : ''}">${p.id === host ? '👑' : ''}${esc(p.name)}${p.id === pid ? '（你）' : ''}
      <span>${playing() || R.state === 'over' ? `❤${p.hp}${p.out ? `　☠ 第 ${p.place} 名` : ''}　` : ''}${p.quit ? '🚪 已離開' : p.online ? '🟢' : '⚪ 離線'}${R.lg && R.lg.phase === 'shop' && !p.out ? (p.rdy === round() ? '　✅' : '　⏳') : ''}</span></div>`;
    if (R.state === 'lobby' || !R.state || (R.state === 'play' && !R.lg)) {
      box.innerHTML = `<h2>🏆 房號 <span class="netcode">${esc(R.code)}</span></h2>
        <p class="nethint">把房號告訴朋友，對方在「🏆 連線自走棋」輸入房號加入（最多 ${LD.maxPlayers} 人）。${isHost() ? `${LD.minPlayers} 人以上就能開始。` : '等房主開始。'}</p>
        <div class="netplayers">${ps.map(row).join('')}${ps.length < LD.maxPlayers ? '<div class="netp wait">等待玩家加入…</div>' : ''}</div>
        ${e}${isHost() ? `<button id="lgStart" class="big go" ${ps.length < LD.minPlayers ? 'disabled' : ''}>開始（${ps.length} 人）</button>` : ''}<button id="lgLeave">離開房間</button>`;
      if ($('lgStart')) $('lgStart').onclick = startGame;
      $('lgLeave').onclick = leaveRoom; return;
    }
    if (R.state === 'over' || (R.lg && R.lg.phase === 'over')) {
      const rk = ps.slice().sort((a, b) => (a.place || 99) - (b.place || 99));
      const mine = me() && me().place;
      box.innerHTML = `<h2>${mine === 1 ? '🏆 你獲勝了！' : mine ? `🏁 你是第 ${mine} 名` : '🏁 遊戲結束'}</h2>
        <p class="nethint">共 ${round()} 回合</p>
        <div class="netplayers">${rk.map(p => `<div class="netp${p.id === pid ? ' me' : ''}"><b>${['🥇', '🥈', '🥉'][p.place - 1] || p.place + '.'} ${esc(p.name)}</b><span>❤${p.hp}${p.out ? `　第 ${p.out} 回合淘汰` : ''}</span></div>`).join('')}</div>
        <button id="lgLeave" class="go">離開房間</button>`;
      $('lgLeave').onclick = leaveRoom; return;
    }
    // 遊戲中：準備完等待／選單／淘汰觀戰
    const lg = R.lg, left = Math.max(0, Math.ceil((lg.ends - now()) / 1000));
    const ready = me() && me().rdy === round();
    let head = '', btns = '';
    if (me() && me().out) { head = `<h2>☠ 你已淘汰（第 ${me().place} 名）</h2><p class="nethint">可以留下觀戰，或離開房間。</p>`; }
    else if (lg.phase === 'shop') {
      head = `<h2>第 ${round()}/${LD.maxRounds} 回合・商店</h2><p class="nethint">${ready ? '已送出隊伍，等待其他人…' : menu ? '已暫離商店' : ''}　剩 <b id="lgLeft">${left}</b> 秒</p>`;
      btns = `<button id="lgShop" class="big go">${ready ? '回商店修改（取消準備）' : '回商店'}</button>`;
    } else { head = `<h2>第 ${round()}/${LD.maxRounds} 回合・對戰中</h2>`; btns = `<button id="lgWatch" class="big go">回到對戰</button>`; }
    const take = me() && !me().out && !me().quit ? `<button id="lgTake">📱 換手機接續</button><div id="lgTakeBox" class="nethint${takeOpen ? '' : ' hidden'}">在另一支手機（或主畫面 App）打開這個連結，就會用你的身分接回、商店進度從雲端還原；這支手機之後就不要再用。<input id="lgTakeUrl" readonly value="${takeOpen ? esc(takeLink()) : ''}"><button id="lgTakeCopy">複製連結</button></div>` : '';
    box.innerHTML = `${head}<div class="netplayers">${ps.map(row).join('')}</div>${lastResHTML()}${e}${btns}${take}<button id="lgLeave">離開房間</button>`;
    if ($('lgTake')) $('lgTake').onclick = () => { if (run) { bkLast = ''; backupRun(run); } takeOpen = !takeOpen; renderLobby(); if (takeOpen) $('lgTakeUrl').select(); };
    if ($('lgTakeCopy')) $('lgTakeCopy').onclick = () => { const v = $('lgTakeUrl').value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => { $('lgTakeCopy').textContent = '已複製 ✓'; }, () => { $('lgTakeUrl').select(); document.execCommand && document.execCommand('copy'); }); };
    if ($('lgShop')) $('lgShop').onclick = () => { menu = false; if (ready) R.ref.child('players/' + pid).update({ rdy: 0 }); else sync(); };
    if ($('lgWatch')) $('lgWatch').onclick = () => { menu = false; sync(true); };
    $('lgLeave').onclick = () => { if (confirm('離開後由 AI 用你最後的隊伍代打，確定離開？')) leaveRoom(); };
  }
  function lastResHTML() {
    const x = lastRes; if (!x) return '';
    return `<p class="nethint">上回合 vs ${esc(x.oppName)}：${x.win ? '<b style="color:#7cf05a">勝利</b>' : `<b style="color:#ff8a7a">落敗 ❤-${x.dmg}</b>`}${x.gold ? `　💰+${x.gold}` : ''}${x.drop ? '　🎁' + esc(x.drop) : ''}</p>`;
  }
  function toTitle() { show('title'); }
  // 商店上方的回合列：回合、倒數、各家血量、上回合結果
  function bar() {
    if (!R.lg) return;
    const left = Math.max(0, Math.ceil((R.lg.ends - now()) / 1000));
    $('lgBar').innerHTML = `<div><b>🏆 第 ${round()}/${LD.maxRounds} 回合</b>　⏱ <b id="lgBarT" class="${left <= 10 ? 'lgwarn' : ''}">${left}</b> 秒後開戰</div><div class="lghp">${alive().concat(sorted().filter(p => p.out)).map(p => `<span class="${p.id === pid ? 'me' : ''}${p.out ? ' out' : ''}">${esc(p.name)} ❤${p.hp}${p.rdy === round() && !p.out ? '✅' : ''}</span>`).join('')}</div>` +
      (lastRes && lastRes.round === round() - 1 ? `<div class="lgres">上回合 vs ${esc(lastRes.oppName)}：${lastRes.win ? '<b style="color:#7cf05a">勝</b>' : `<b style="color:#ff8a7a">敗 ❤-${lastRes.dmg}</b>`}${lastRes.gold ? `　💰+${lastRes.gold}` : ''}${lastRes.drop ? '　🎁' + esc(lastRes.drop) : ''}</div>` : '');
  }

  // ---------- 房間：建立／加入／離開／開始 ----------
  const newPlayer = seat => ({ name: mem.name, seat, online: true, joinedAt: TS, lastSeen: TS, hp: LD.hp, out: 0, rdy: 0, team: '' });
  async function createRoom() {
    busy = true; err = ''; renderLobby();
    try {
      for (let k = 0; k < 25; k++) {
        const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0'), ref = db.ref('leagues/' + code);
        const v = (await ref.once('value')).val();
        if (v && Date.now() - (v.createdAt || 0) < ROOM_TTL) continue;
        const res = await ref.transaction(cur => (cur && Date.now() - (cur.createdAt || 0) < ROOM_TTL) ? undefined :
          { v: 1, createdAt: TS, hostId: pid, state: 'lobby', players: { [pid]: newPlayer(0) } }, null, false).catch(() => null);
        if (res && res.committed) { busy = false; return enterRoom(code); }
      }
      err = '建立房間失敗：連線不穩，請稍後再試';
    } catch (e) { err = '建立房間失敗：請檢查網路後再試（' + (e.message || e) + '）'; }
    busy = false; renderLobby();
  }
  async function joinRoom(code) {
    if (!/^\d{4}$/.test(code)) { err = '房號是 4 位數字，例如 0427'; return renderLobby(); }
    busy = true; err = ''; renderLobby();
    try {
      const ref = db.ref('leagues/' + code), v = (await ref.once('value')).val();
      if (!v || !v.players || Date.now() - (v.createdAt || 0) > ROOM_TTL) throw new Error(`找不到房號 ${code}：請確認號碼，或房間已過期，請朋友重開一間`);
      if (v.players[pid]) { busy = false; return enterRoom(code); }
      if (v.state !== 'lobby') throw new Error('這個房間已經開打，無法中途加入，請朋友再開一間');
      const pref = ref.child('players'); let warm; await new Promise(r => { warm = () => r(); pref.on('value', warm); });
      let why = '';
      const res = await pref.transaction(ps => {
        if (!ps) { why = '找不到這個房間，請確認房號'; return null; }
        if (Object.keys(ps).length >= LD.maxPlayers) { why = `房間已滿（最多 ${LD.maxPlayers} 人），請朋友另開一間`; return undefined; }
        const used = Object.values(ps).map(p => p.seat); let seat = 0; while (used.includes(seat)) seat++;
        ps[pid] = newPlayer(seat); return ps;
      }, null, false);
      pref.off('value', warm);
      if (!res.committed || !res.snapshot.val() || !res.snapshot.val()[pid]) throw new Error(why || '加入失敗');
      busy = false; return enterRoom(code);
    } catch (e) { const m = e.message || String(e); err = /[\u4e00-\u9fff]/.test(m) ? m : '連線失敗：請檢查網路後再試（' + m + '）'; }
    busy = false; renderLobby();
  }
  async function rejoin(code) {
    if (!ensureDb() || R.code) return;
    try { const v = (await db.ref('leagues/' + code).once('value')).val(); if (v && v.players && v.players[pid] && !v.players[pid].quit) return enterRoom(code); } catch (e) { }
    mem.lgCode = null; U.saveMem(); if (scr === 'lg') renderLobby();
  }
  async function leaveRoom() {
    const ref = R.ref; if (!ref) return;
    try { bkRef().remove().catch(() => { }); } catch (e) { }
    try {
      ref.child('players/' + pid).onDisconnect().cancel();
      if (R.state === 'lobby') {
        const others = sorted().filter(p => p.id !== pid), up = { ['players/' + pid]: null };
        if (isHost() && others.length) up.hostId = (others.find(p => p.online) || others[0]).id;
        await ref.update(up);
      } else {
        const up = { ['players/' + pid + '/quit']: true, ['players/' + pid + '/online']: false };
        const nh = sorted().find(p => p.id !== pid && p.online && !p.quit);
        if (isHost() && nh) up.hostId = nh.id;
        await ref.update(up);
      }
    } catch (e) { }
    detach(); mem.lgCode = null; U.saveMem(); run = null; try { localStorage.removeItem(RUN_KEY); } catch (e) { }
    err = ''; show('lg');
  }
  function startGame() {
    const ps = sorted(); if (!isHost() || ps.length < LD.minPlayers || R.state !== 'lobby') return;
    const hp = TEST_HP || LD.hp, up = { state: 'play', lg: { round: 1, phase: 'shop', ends: now() + LD.shopSec * 1000, seed: Math.floor(Math.random() * 2 ** 31), np: 0 } };
    ps.forEach(p => Object.assign(up, { ['players/' + p.id + '/hp']: hp, ['players/' + p.id + '/out']: 0, ['players/' + p.id + '/rdy']: 0, ['players/' + p.id + '/opps']: '' }));
    R.ref.update(up);
  }

  // ---------- 進房：監聽 ----------
  function detach() {
    R.offs.forEach(([r, ev, cb]) => r.off(ev, cb));
    Object.assign(R, { code: null, ref: null, hostId: null, players: {}, state: null, lg: null, pairs: {}, res: {}, snaps: {}, results: {}, offs: [], ld: {}, created: null, bk: null });
    for (const k in BS) delete BS[k]; bkLast = ''; takeOpen = false;
    run = null; view = -1; lastRes = null;
  }
  function listen(ref, ev, cb) { ref.on(ev, cb); R.offs.push([ref, ev, cb]); }
  async function enterRoom(code) {
    detach();
    R.code = code; R.ref = db.ref('leagues/' + code); mem.lgCode = code; U.saveMem();
    try { R.created = (await R.ref.child('createdAt').once('value')).val(); } catch (e) { }
    if (R.code !== code) return;
    if (!loadRun()) { const bk = await fetchBackup(); if (R.code !== code) return; R.bk = bk; if (bk) { restored = runSum(bk); console.log('[lg] 從雲端備份還原商店進度：第', bk.league.round, '回合'); } }
    const meRef = R.ref.child('players/' + pid);
    listen(db.ref('.info/connected'), 'value', s => {
      if (s.val() !== true || !R.ref) return;
      meRef.onDisconnect().update({ online: false, lastSeen: TS });
      meRef.once('value').then(x => { if (x.exists() && !(x.val() || {}).quit) meRef.update({ online: true, lastSeen: TS }); });
    });
    listen(R.ref.child('players'), 'value', s => { R.players = s.val() || {}; if (R.ld.players && !R.players[pid]) return kicked(); R.ld.players = 1; sync(); });
    listen(R.ref.child('hostId'), 'value', s => { R.hostId = s.val(); R.ld.host = 1; sync(); });
    listen(R.ref.child('state'), 'value', s => { R.state = s.val(); R.ld.state = 1; sync(); });
    listen(R.ref.child('lg'), 'value', s => { R.lg = s.val(); R.ld.lg = 1; sync(); });
    listen(R.ref.child('res'), 'value', s => { R.res = s.val() || {}; R.ld.res = 1; sync(); });
    listen(R.ref.child('pairs'), 'value', s => { R.pairs = s.val() || {}; R.ld.pairs = 1; for (const i in R.pairs) setupPair(+i); sync(); });
    listen(R.ref.child('pr'), 'value', s => { R.results = s.val() || {}; R.ld.pr = 1; sync(); });
    listen(R.ref.child('ps'), 'value', s => { R.snaps = s.val() || {}; for (const i in BS) checkSnap(+i); });
    for (let i = 0; i < MAXPAIR; i++) {
      listen(R.ref.child('pm/' + i), 'child_added', s => { const x = bs(i); x.mv[s.key] = s.val(); pump(i); });
      listen(R.ref.child('pm/' + i), 'child_removed', s => { delete bs(i).mv[s.key]; });
    }
    startLoop(); show('lg');
  }
  function kicked() { detach(); mem.lgCode = null; U.saveMem(); err = '你已不在房間裡'; show('lg'); }

  // 依房間狀態決定畫面；房主推進流程
  function sync(forceBattle) {
    if (!R.code || !R.ld.players || !R.ld.state || !R.ld.lg) return;
    checkHost();
    if (!playing() || R.lg.phase === 'over' || R.state === 'over') { if (scr === 'shop' || scr === 'lgb') show('lg'); else if (scr === 'lg') renderLobby(); return; }
    const lg = R.lg, p = me(); if (!p) return;
    if (!p.out && !p.quit) { ensureRun(); applyRes(); }
    if (lg.phase === 'shop') {
      if (p.out || menu || p.rdy === round() || !resReady()) { if (scr !== 'lg') show('lg'); else renderLobby(); }
      else if (scr !== 'shop') show('shop');
      else bar();
    } else if (lg.phase === 'battle') {
      const mine = myPairIdx();
      if (view < 0 || !R.pairs[view] || (mine >= 0 && view !== mine && !watching)) view = mine >= 0 ? mine : firstPair();
      if (scr === 'shop') { if (p.rdy !== round()) submit(false); show('lgb'); }
      else if (scr !== 'lgb' && (!menu || forceBattle) && scr !== 'title' && scr !== 'net') show('lgb');
      else if (scr === 'lg') renderLobby();
    }
    if (scr === 'lgb') renderOver();
  }
  let watching = false;
  const firstPair = () => { const ks = Object.keys(R.pairs).map(Number).filter(i => R.pairs[i] && R.pairs[i].r === round()); return ks.length ? ks[0] : -1; };
  const myPairIdx = () => { for (const i in R.pairs) { const v = R.pairs[i]; if (v && v.r === round() && (v.a === pid || v.b === pid)) return +i; } return -1; };
  // 上回合的結算已經到了（多路徑更新的監聽順序不一定，商店要等 res 到才開）
  const resReady = () => round() <= 1 || !me() || (me().opps || '').split(',').filter(Boolean).length < round() - 1 || (R.res[pid] && R.res[pid].r >= round() - 1) || (run && run.league.applied >= round() - 1);
  function applyRes() {
    const x = R.res[pid]; if (!x || !run || run.league.applied >= x.r) return;
    const out = LG.finishRound(run, { round: x.r, win: !!x.win, left: x.left || 0, hp: x.hp, dmg: x.dmg || 0, st: x.st || localStats(x.r) });
    saveRun(run); backupRun(run);
    if (out) lastRes = { round: x.r, win: !!x.win, dmg: x.dmg || 0, oppName: x.opp || '', gold: out.gold + (out.income || 0) + (out.interest || 0) + (out.streakBonus || 0), drop: out.drops.map(it => D.items[it.id].icon + D.items[it.id].name).join('、') };
  }
  // res 沒帶戰鬥資料（舊房主）時，用自己這台算完的那場補
  function localStats(r) {
    for (const k in BS) { const x = BS[k]; if (x.r === r && x.B && x.B.phase === 'over' && mySeat(x) >= 0) return LG.battleStats(x.B, mySeat(x)); }
    return null;
  }
  // 送出隊伍（按準備或時間到）
  function submit(readyClick) {
    if (!amAlive() || !run || R.lg.phase !== 'shop') return;
    const code = LG.teamCode(run, mem.name); saveRun(run); backupRun(run);
    R.ref.child('players/' + pid).update({ team: code, rdy: round() });
    if (readyClick) { menu = false; show('lg'); }
  }

  // 房主不在線 → 在線玩家裡座位最前面的接手
  function checkHost() {
    if (!R.ref || !R.ld.players || !R.ld.host) return;
    const h = R.hostId; if (h && online(h)) return;
    const c = sorted().filter(p => online(p.id))[0];
    if (!c || c.id !== pid) return;
    R.ref.child('hostId').transaction(cur => cur === h ? pid : undefined, null, false).catch(() => { });
  }
  // ---------- 房主：商店結束 → 配對開戰；對戰全部結束 → 結算 ----------
  let hostBusy = '';
  function hostTick() {
    if (!isHost() || !playing() || !R.ld.pairs || !R.ld.pr) return;
    const lg = R.lg, r = lg.round;
    if (lg.phase === 'shop') {
      const wait = alive().filter(p => online(p.id) && p.rdy !== r);
      if (wait.length && now() < lg.ends + LD.shopGrace * 1000) return;
      if (hostBusy === 'b' + r) return; hostBusy = 'b' + r;
      startBattles(r);
    } else if (lg.phase === 'battle') {
      const np = lg.np || 0; if (!np) return;
      for (let i = 0; i < np; i++) { const x = R.results[i]; if (!x || x.r !== r) return; }
      if (hostBusy === 's' + r) return; hostBusy = 's' + r;
      settleRound(r);
    }
  }
  function fallbackTeam(id) { const rr = LG.newRun(hstr(id) ^ 77); LG.ensureFront(rr); return RUN.exportTeam(rr, nameOf(id)); }
  function startBattles(r) {
    const al = alive().map(p => p.id), all = sorted().map(p => p.id), hist = {}, rng = { s: (R.lg.seed ^ Math.imul(r, 0x9e3779b1)) | 0 };
    all.forEach(id => { hist[id] = (R.players[id].opps || '').split(',').filter(Boolean); });
    const team = id => R.players[id].team || R.players[id].prev || fallbackTeam(id);
    const pairs = LG.pair(al, hist, rng), pobj = {}, up = { pm: null, ps: null, psd: null, pr: null, pairs: pobj }; // 不能同時寫 pairs 和 pairs/0（祖先路徑衝突）
    pairs.forEach(([a, b], i) => {
      let tb, nb, src = '';
      if (b === GH) { src = LG.ghostSource(a, al, all, hist, rng) || a; tb = R.players[src].prev || team(src); nb = '👻' + nameOf(src); }
      else { tb = team(b); nb = nameOf(b); }
      pobj[i] = { r, a, b, src, seed: Math.floor(RUN_RNG(rng) * 2 ** 31), teams: { 0: team(a), 1: tb }, names: { 0: nameOf(a), 1: nb } };
      up['players/' + a + '/opps'] = hist[a].concat([b]).join(',');
      if (b !== GH) up['players/' + b + '/opps'] = hist[b].concat([a]).join(',');
    });
    al.forEach(id => { up['players/' + id + '/prev'] = team(id); });
    up.lg = Object.assign({}, R.lg, { phase: 'battle', np: pairs.length });
    R.ref.update(up);
  }
  const RUN_RNG = o => FA.rng.next(o);
  function settleRound(r) {
    const ps = {}, results = [];
    sorted().forEach(p => { ps[p.id] = { hp: p.hp, out: p.out || 0, place: p.place || 0 }; });
    const bst = {}; // 各家這場的戰鬥資料（金幣、陣亡、羈絆），轉進 res/{pid}.st 給本人結算商店
    for (let i = 0; i < (R.lg.np || 0); i++) { const v = R.pairs[i], x = R.results[i]; results.push({ a: v.a, b: v.b, winner: x.winner, left: x.left }); if (x.st) { if (x.st[0]) bst[v.a] = x.st[0]; if (x.st[1] && v.b !== GH) bst[v.b] = x.st[1]; } }
    const st = LG.settle(r, ps, results), up = {};
    for (const id in st.ps) { const a = st.ps[id]; up['players/' + id + '/hp'] = a.hp; up['players/' + id + '/out'] = a.out || 0; if (a.place) up['players/' + id + '/place'] = a.place; }
    for (const id in st.res) { const x = st.res[id]; up['res/' + id] = { r, win: x.win, dmg: x.dmg, left: x.left, hp: x.hp, opp: x.opp === GH ? '幽靈' : nameOf(x.opp).slice(0, 12), st: bst[id] || null }; }
    if (st.over) { up.lg = Object.assign({}, R.lg, { phase: 'over' }); up.state = 'over'; }
    else up.lg = Object.assign({}, R.lg, { round: r + 1, phase: 'shop', ends: now() + LD.shopSec * 1000, np: 0 });
    R.ref.update(up);
  }

  // ---------- 每一對的戰鬥 ----------
  const bs = i => BS[i] || (BS[i] = { pv: null, r: 0, B: null, applied: 0, mv: {}, building: false, writing: false, turnT: 0, aiT: 0, aiBusy: false, key: '', shown: false, pre: null }); // pre：自己這一發的本機預演（二次操作，見 online.js）
  const ext = strats => { const s = RUN.sfx({ strats: strats || [] }); return { mods: s.mods, shots: s.shots, chainAll: s.chainAll, revive: s.revive, echo: s.echo, blastGold: s.blastGold, openFreeze: s.openFreeze, stormZap: s.stormZap }; };
  function makeBattle(pv) {
    const t = [pv.teams[0], pv.teams[1]].map(c => RUN.importTeam(c));
    if (t.some(x => !x || !x.front.length)) return null;
    return BT.create({ pFront: t[0].front, pBack: t[0].back, eFront: t[1].front, eBack: t[1].back, rules: [], env: {}, pExt: ext(t[0].strats), eExt: ext(t[1].strats), seed: pv.seed, goldBoth: true });
  }
  async function setupPair(i) {
    const pv = R.pairs[i]; if (!pv) return;
    const x = bs(i); if (x.r === pv.r && x.B) return;
    x.r = pv.r; x.pv = pv; x.building = true; x.shown = false; x.applied = 0; x.writing = false; x.aiBusy = false; x.pre = null;
    let nb = makeBattle(pv), n = 0;
    try { const sd = (await R.ref.child('psd/' + i).once('value')).val(); if (sd && sd.r === pv.r && sd.n > 0) { nb = JSON.parse(sd.data); n = sd.n; } } catch (e) { }
    if (!R.pairs[i] || R.pairs[i].r !== x.r) return;
    if (!nb) { console.warn('[lg] 隊伍代碼無效', i); x.building = false; return; }
    x.B = nb; x.applied = n; x.building = false;
    if (i === view) { V.reset(); ui.aim = null; }
    pump(i);
  }
  const ctrl = (x, t) => t === 0 ? x.pv.a : x.pv.b;
  const authOf = x => [x.pv.a, x.pv.b].filter(id => id !== GH && online(id))[0] || R.hostId;
  const isAuth = x => x.pv && authOf(x) === pid;
  const mvAt = (x, n) => x.mv[mkey(x.r, n)];
  function pump(i) {
    const x = BS[i]; if (!x || !x.B || x.building) return;
    const B = x.B;
    while (B.phase === 'aim') {
      const m = mvAt(x, x.applied); if (!m) break;
      const p = x.pre, mine = !!p && p.n === x.applied && p.r === x.r && m.by === pid;
      if (p && p.n === x.applied && !mine) { x.pre = null; if (i === view) V.reset(); } // 預演中被 AI 代打搶先
      if (mine && !p.done) break;
      const instant = mine || FAST || i !== view || scr !== 'lgb' || !!mvAt(x, x.applied + 1) || document.hidden;
      if (mine) x.pre = null;
      if (!BT.launch(B, m.idx, m.angle, m.power, !!m.ult, m.tap)) { console.warn('[lg] 無效的一發', m); x.applied++; afterShot(i); continue; }
      if (!instant) break;
      BT.runShot(B); BT.endShot(B); B.events = []; x.applied++; afterShot(i, true);
    }
  }
  function afterShot(i) {
    const x = BS[i]; x.aiT = 0;
    if (isAuth(x) && !mvAt(x, x.applied)) {
      const B = x.B, h = U.hashB(B), up = { ['ps/' + i]: { r: x.r, n: x.applied, hash: h } };
      up['psd/' + i] = { r: x.r, n: x.applied, data: JSON.stringify(B, (k, v) => k === 'events' ? [] : k === 'hurt' ? 0 : v) };
      if (B.phase === 'over') up['pr/' + i] = { r: x.r, winner: B.winner, left: Math.max(0, B.moves[B.winner]), n: x.applied, hash: h, st: [LG.battleStats(B, 0), LG.battleStats(B, 1)] };
      R.ref.update(up);
    } else checkSnap(i);
    if (x.B.phase === 'over') overT = i === view ? 0.9 : overT;
  }
  function checkSnap(i) {
    const x = BS[i], s = R.snaps[i];
    if (!x || !x.B || x.building || isAuth(x) || !s || s.r !== x.r || s.n !== x.applied || x.B.phase === 'moving') return;
    if (s.hash !== U.hashB(x.B)) resync(i);
  }
  async function resync(i) {
    const x = BS[i], sd = (await R.ref.child('psd/' + i).once('value')).val();
    if (!sd || sd.r !== x.r || sd.n < x.applied || (x.B && x.B.phase === 'moving')) return;
    console.warn('[lg] 狀態不一致，讀快照覆蓋', i, x.applied, '→', sd.n);
    x.B = JSON.parse(sd.data); x.applied = sd.n; x.resyncs = (x.resyncs || 0) + 1; x.pre = null; if (i === view) V.reset();
    pump(i);
  }
  function writeMove(i, m) { return R.ref.child('pm/' + i + '/' + mkey(m.r, m.n)).transaction(cur => cur ? undefined : m, null, false); }
  const mySeat = x => !x || !x.pv ? -1 : x.pv.a === pid ? 0 : x.pv.b === pid ? 1 : -1;
  const myTurn = () => { const x = BS[view]; return !!(x && x.B && !x.building && x.r === round() && x.B.phase === 'aim' && mySeat(x) >= 0 && x.B.turn === mySeat(x) && !mvAt(x, x.applied) && !x.writing && !x.pre); };
  const withTap = (m, tap) => { if (tap) m.tap = { t: tap.t, x: tap.x, y: tap.y }; return m; };
  function shoot(idx, angle, power, ult, tap) {
    if (!myTurn()) return false;
    const x = BS[view], i = view; x.writing = true; ui.aim = null;
    writeMove(i, withTap({ r: x.r, n: x.applied, by: pid, idx, angle, power, ult: !!ult }, tap)).catch(e => console.warn('[lg] 送出失敗', e)).then(() => { x.writing = false; });
    return true;
  }
  // ---- 二次操作 ----：可點的角色先本機預演，點擊（或飛完）才送出 move（帶 tap）
  function aimRelease(idx, angle, power, ult) {
    if (!myTurn()) return false;
    const x = BS[view]; if (!BT.tapAbility(x.B.bodies[idx])) return shoot(idx, angle, power, ult);
    const P = JSON.parse(JSON.stringify(x.B)); P.events = [];
    if (!BT.launch(P, idx, angle, power, !!ult)) return false;
    x.pre = { P, i: view, r: x.r, n: x.applied, idx, angle, power, ult: !!ult, sent: false, done: false }; ui.aim = null;
    return true;
  }
  function sendPre(x, tap) {
    const p = x.pre; if (!p || p.sent) return; p.sent = true; x.writing = true;
    writeMove(p.i, withTap({ r: p.r, n: p.n, by: pid, idx: p.idx, angle: p.angle, power: p.power, ult: p.ult }, tap)).catch(e => console.warn('[lg] 送出失敗', e)).then(() => { x.writing = false; });
  }
  function tapAt(wx, wy) {
    const x = BS[view], p = x && x.pre; if (!p || p.sent || !BT.canTap(p.P)) return false;
    const rec = flip() ? BT.tap(p.P, -wx, -wy) : BT.tap(p.P, wx, wy);
    if (rec) sendPre(x, rec);
    return !!rec;
  }
  // 權威端：幽靈／離線玩家等一下就由 AI 出手；在線玩家超過 turnSec 秒沒出手也由 AI 代打
  function aiTick(i, dt) {
    const x = BS[i]; if (!x || !x.B || x.building || x.B.phase !== 'aim' || x.r !== round()) return;
    const key = x.r + '_' + x.applied; if (key !== x.key) { x.key = key; x.turnT = 0; x.aiT = 0; }
    x.turnT += dt;
    if (!isAuth(x) || mvAt(x, x.applied) || x.aiBusy) return;
    const c = ctrl(x, x.B.turn);
    if (c !== GH && online(c)) { if (x.turnT < LD.turnSec) return; }
    else if ((x.aiT += dt) < AI_DELAY) return;
    x.aiBusy = true;
    const n = x.applied, ch = FA.ai.choose(x.B, x.B.turn, D.enemies.difficulty(AI_LV), { s: (x.pv.seed ^ Math.imul(n + 1, 0x9e3779b1) ^ x.r) | 0 });
    if (!ch) { x.aiBusy = false; return; }
    writeMove(i, withTap({ r: x.r, n, by: 'ai:' + (c === GH ? 'ghost' : c), idx: ch.idx, angle: ch.angle, power: ch.power, ult: !!ch.ult }, ch.tap)).catch(() => { }).then(() => { x.aiBusy = false; });
  }

  // ---------- 畫面：自己在紅方（seat1）時上下翻轉 ----------
  let vb = null;
  const flip = () => mySeat(BS[view]) === 1;
  function consumeEv(B) {
    if (!B || !B.events.length) return;
    if (flip()) { V.consume(Object.assign({}, B, { events: B.events.map(U.flipEv), pillars: (B.pillars || []).map(U.flipEv) })); B.events = []; } else V.consume(B);
  }
  const cv = $('lgcv'); let drag = null;
  cv.addEventListener('pointerdown', e => {
    { const x = BS[view]; if (x && x.pre && !x.pre.sent) { const w = V.toWorld(e.clientX, e.clientY); tapAt(w.x, w.y); return; } } // 飛行中點畫面
    if (!myTurn() || !vb) return;
    const w = V.toWorld(e.clientX, e.clientY);
    let best = null, bd = 1e9;
    vb.bodies.forEach(o => { if (o.alive && !o.temp && o.team === 0 && BT.avail(vb, 0).includes(o)) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < o.r + 22 && d < bd) { bd = d; best = o; } } });
    if (best) { drag = best.i; try { cv.setPointerCapture(e.pointerId); } catch (x) { } }
  });
  cv.addEventListener('pointermove', e => {
    if (drag == null || !vb) return;
    const w = V.toWorld(e.clientX, e.clientY), o = vb.bodies[drag], vx = o.x - w.x, vy = o.y - w.y, len = Math.hypot(vx, vy);
    ui.aim = len < 12 ? null : { idx: drag, angle: Math.atan2(vy, vx), power: Math.min(1, len / 140) };
  });
  cv.addEventListener('pointerup', () => {
    if (drag != null && ui.aim && ui.aim.power > 0.1 && myTurn()) { aimRelease(ui.aim.idx, ui.aim.angle + (flip() ? Math.PI : 0), ui.aim.power, ui.ultArmed); ui.ultArmed = false; }
    ui.aim = null; drag = null;
  });
  cv.addEventListener('pointercancel', () => { ui.aim = null; drag = null; });
  $('lgUlt').onclick = () => { ui.ultArmed = !ui.ultArmed; };
  $('lgMenu').onclick = () => { menu = true; show('lg'); };

  function hud() {
    const x = BS[view]; if (!x || !x.B || !x.pv) { $('lgHud').innerHTML = `第 ${round()} 回合｜等待對戰…`; return; }
    const b = x.B, s = mySeat(x), me0 = s === 1 ? 1 : 0, op = 1 - me0, nm = t => esc(x.pv.names[t]);
    const st = t => { const id = ctrl(x, t); return id === GH ? '<span class="netoff">AI</span>' : online(id) ? '' : '<span class="netoff">離線－AI 代打</span>'; };
    const hp = t => { const id = ctrl(x, t); return id === GH || !R.players[id] ? '' : ' ❤' + R.players[id].hp; };
    $('lgHud').innerHTML = `🏆 第 ${round()}/${LD.maxRounds} 回合${isHost() ? '　👑' : ''}${s < 0 ? '　👀 觀戰' : ''}<br>` +
      `<span style="color:#5cf">${nm(me0)}${s >= 0 ? '（你）' : ''}${hp(me0)} 動數 ${Math.max(0, b.moves[me0])}/${b.movesMax[me0]}</span> ${st(me0)}<br>` +
      `<span style="color:#f77">${nm(op)}${hp(op)} 動數 ${Math.max(0, b.moves[op])}/${b.movesMax[op]}</span> ${st(op)}`;
    const c = ctrl(x, b.turn), turnName = x.pv.names[b.turn], left = LD.turnSec - x.turnT;
    ui.msg = x.pre ? (!x.pre.sent && BT.canTap(x.pre.P) ? V.tapHint(x.pre.P) : '') : b.phase === 'over' ? (s < 0 ? x.pv.names[b.winner] + ' 獲勝' : b.winner === s ? '勝利！' : '落敗…') : b.phase !== 'aim' ? '' :
      b.turn === s ? (x.writing || mvAt(x, x.applied) ? '傳送中…' : '輪到你：按住棋子往後拉' + (left < 10 ? `（${Math.max(0, Math.ceil(left))} 秒後自動出手）` : '')) :
        (c === GH || !online(c)) ? `${turnName} AI 出手中…` : `輪到 ${turnName}…`;
    ui.msgCol = b.turn === s ? '#ffe066' : '#f99';
    const ready = myTurn() && BT.avail(b, s).some(o => o.energy >= C.ult.max);
    if (!ready) ui.ultArmed = false;
    $('lgUlt').classList.toggle('hidden', !ready); $('lgUlt').classList.toggle('on', !!ui.ultArmed);
    $('lgUlt').textContent = ui.ultArmed ? '⚡ 大招就緒（彈發光的棋子）' : '⚡ 大招';
  }
  // 對戰結束（或淘汰觀戰）時的面板：等待其他對戰、觀戰切換
  function renderOver() {
    const x = BS[view], p = me(); if (!p || !R.lg || R.lg.phase !== 'battle') { $('lgOver').classList.add('hidden'); return; }
    const done = x && x.B && x.B.phase === 'over' && overT <= 0, spect = !!p.out || p.quit;
    if (!done && !(spect && !x)) { $('lgOver').classList.add('hidden'); return; }
    const np = R.lg.np || 0, fin = [...Array(np)].filter((_, i) => R.results[i] && R.results[i].r === round()).length;
    const s = mySeat(x), b = x && x.B;
    const head = spect ? `<h2>👀 觀戰中</h2><p class="nethint">你已淘汰（第 ${p.place} 名）</p>` : s >= 0 && b ? `<h2>${b.winner === s ? '🏆 勝利！' : '💥 落敗…'}</h2>` : `<h2>🏁 ${esc(x.pv.names[b.winner])} 獲勝</h2>`;
    const others = Object.keys(R.pairs).map(Number).filter(i => i !== view && R.pairs[i] && R.pairs[i].r === round() && !(R.results[i] && R.results[i].r === round()));
    const html = `${head}${b ? `<p class="nethint">${x.pv.names.map((n, t) => `${esc(n)}：剩 ${Math.max(0, b.moves[t])} 動`).join('<br>')}</p>` : ''}
      <p class="nethint">對戰完成 ${fin}/${np}${fin < np ? '，等待其他對戰…' : '，結算中…'}</p>
      ${others.map(i => `<button data-w="${i}">👀 看 ${esc(R.pairs[i].names[0])} vs ${esc(R.pairs[i].names[1])}</button>`).join('')}
      ${spect ? '<button id="lgOLeave">離開房間</button>' : ''}`;
    if ($('lgOver').dataset.h !== html) { $('lgOver').innerHTML = html; $('lgOver').dataset.h = html; }
    $('lgOver').classList.remove('hidden');
    $('lgOver').onclick = e => {
      const t = e.target.closest('[data-w]'); if (t) { view = +t.dataset.w; watching = true; V.reset(); $('lgOver').classList.add('hidden'); $('lgOver').dataset.h = ''; return; }
      if (e.target.id === 'lgOLeave') leaveRoom();
    };
  }

  // 觀戰列（看的不是自己的對戰時）：切換看哪一場、回自己的對戰、離開
  function specBar() {
    const el = $('lgSpec'), x = BS[view], p = me();
    const on = scr === 'lgb' && playing() && R.lg.phase === 'battle' && p && x && x.pv && x.r === round() && mySeat(x) < 0;
    if (!on) { if (!el.classList.contains('hidden')) { el.classList.add('hidden'); el.dataset.h = ''; } return; }
    const ks = Object.keys(R.pairs).map(Number).filter(i => R.pairs[i] && R.pairs[i].r === round()).sort((a, b) => a - b);
    const fin = i => R.results[i] && R.results[i].r === round(), mine = myPairIdx(), out = !!p.out || !!p.quit;
    const html = `<span>👀 觀戰</span>` + ks.map(i => `<button data-sv="${i}" class="${i === view ? 'on' : ''}">${esc(R.pairs[i].names[0])} vs ${esc(R.pairs[i].names[1])}${fin(i) ? ' ✓' : ''}</button>`).join('') +
      (mine >= 0 ? '<button data-sv="me">回我的對戰</button>' : '') + (out ? '<button data-sv="leave">離開房間</button>' : '');
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    el.classList.remove('hidden');
  }
  $('lgSpec').onclick = e => {
    const t = e.target.closest('[data-sv]'); if (!t) return;
    const v = t.dataset.sv;
    if (v === 'leave') { if (confirm('離開房間？')) leaveRoom(); return; }
    if (v === 'me') { watching = false; view = myPairIdx(); }
    else { view = +v; watching = true; }
    V.reset(); ui.aim = null; $('lgOver').classList.add('hidden'); $('lgOver').dataset.h = ''; overT = 0;
  };

  // ---------- 主迴圈：所有對戰都在背景推進（不是畫面上的那對直接算完），畫面只畫 view 那對 ----------
  let loopOn = false, last = 0, acc = 0, tickT = 0;
  function startLoop() { if (loopOn) return; loopOn = true; last = performance.now(); acc = 0; sched(); }
  function sched() { let done = false; const go = () => { if (!done) { done = true; frame(performance.now()); } }; requestAnimationFrame(go); if (MOCK) setTimeout(go, 40); }
  function frame(t) {
    if (!loopOn) return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (!R.code) { loopOn = false; return; }
    if ((tickT += dt) > 0.25) {
      tickT = 0; hostTick();
      if (amAlive() && R.lg.phase === 'shop' && me().rdy !== round() && now() > R.lg.ends) { submit(false); if (scr === 'shop') { menu = false; show('lg'); } }
      if (scr === 'shop' && $('lgBarT')) { const l = Math.max(0, Math.ceil((R.lg.ends - now()) / 1000)); $('lgBarT').textContent = l; $('lgBarT').className = l <= 10 ? 'lgwarn' : ''; }
      if (scr === 'lg' && $('lgLeft') && R.lg) $('lgLeft').textContent = Math.max(0, Math.ceil((R.lg.ends - now()) / 1000));
    }
    for (const k in BS) {
      const i = +k, x = BS[i]; if (!x.B || x.building) continue;
      if (x.pre && !x.pre.done) { // 自己這一發的本機預演（背景時直接算完）
        const P = x.pre.P, vis = i === view && scr === 'lgb';
        if (!vis) { BT.runShot(P); x.pre.done = true; P.events = []; sendPre(x, null); }
        else if (V.hitstop > 0) V.hitstop -= dt;
        else { acc += dt; let n = 0; while (acc >= C.dt && n++ < 16) { acc -= C.dt; if (BT.step(P)) { x.pre.done = true; acc = 0; consumeEv(P); sendPre(x, null); break; } } }
        if (x.pre && x.pre.done) pump(i);
      } else if (i === view && scr === 'lgb' && x.B.phase === 'moving') {
        if (V.hitstop > 0) V.hitstop -= dt;
        else { acc += dt; let n = 0; while (acc >= C.dt && n++ < 16) { acc -= C.dt; if (BT.step(x.B)) { BT.endShot(x.B); acc = 0; consumeEv(x.B); x.applied++; afterShot(i); pump(i); break; } } }
      } else if (x.B.phase === 'moving') { BT.runShot(x.B); BT.endShot(x.B); x.B.events = []; x.applied++; afterShot(i); pump(i); } // 背景中的那對（例如切走畫面）直接算完
      else pump(i);
      aiTick(i, dt);
    }
    if (overT > 0) { overT -= dt; if (overT <= 0) renderOver(); }
    const x = BS[view];
    if (scr === 'lgb' && x && x.B && !x.building) {
      const DB = x.pre ? x.pre.P : x.B;
      consumeEv(DB); V.update(dt); hud();
      vb = flip() ? U.flipB(DB) : DB;
      V.draw(vb, ui, dt);
      if (vb !== DB) vb.bodies.forEach((o, k) => { if (DB.bodies[k]) DB.bodies[k].hurt = o.hurt; });
      if (x.B.phase === 'over' || (me() && me().out)) renderOver();
    } else if (scr === 'lgb') hud();
    specBar();
    sched();
  }

  // ---------- 切出 App 再回來 ----------
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!R.code) return;
    if (document.hidden) { hiddenAt = Date.now(); if (R.ref && me() && !me().quit) R.ref.child('players/' + pid).update({ online: false, lastSeen: TS }); return; }
    if (Date.now() - hiddenAt > 3000) { const c = R.code; detach(); enterRoom(c); }
    else if (me() && !me().quit) R.ref.child('players/' + pid).update({ online: true, lastSeen: TS });
  });

  // ---------- 啟動：記住的房號自動接回 ----------
  function boot() { if (U.configured() && mem.lgCode && ensureDb()) rejoin(mem.lgCode); }
  (function wait(k) { if (!MOCK || FA.netMock) return setTimeout(boot, 30); if (k < 200) setTimeout(() => wait(k + 1), 50); })(0);

  // 測試／除錯用
  FA.leagueNet = {
    takeLink: () => R.code ? takeLink() : null, lastRes: () => lastRes, spec: () => !$('lgSpec').classList.contains('hidden') && $('lgSpec').innerText,
    state: () => ({ code: R.code, host: R.hostId, pid, state: R.state, round: round(), phase: R.lg && R.lg.phase, np: R.lg && R.lg.np, scr, view, myTurn: myTurn(), me: me(), players: R.players,
      pairs: Object.keys(BS).map(i => { const x = BS[i]; return { i: +i, r: x.r, a: x.pv && x.pv.a, b: x.pv && x.pv.b, src: x.pv && x.pv.src, phase: x.B && x.B.phase, applied: x.applied, winner: x.B && x.B.winner, hash: x.B && U.hashB(x.B), building: x.building, resyncs: x.resyncs || 0 }; }),
      run: run && runSum(run), restored }),
    autoShop() { if (!run) return false; LG.autoShop(run); saveRun(run); FA.shopHost.render(); return true; },
    ready: () => submit(true), autoShoot() { if (!myTurn()) return false; const x = BS[view], c = FA.ai.choose(x.B, mySeat(x), D.enemies.difficulty(AI_LV), { s: (x.applied * 131 + 7) | 0 }); return c ? shoot(c.idx, c.angle, c.power, c.ult, c.tap) : false; }, aimRelease, tapAt,
    create: createRoom, join: joinRoom, start: startGame, leave: leaveRoom, setName: n => { mem.name = n; U.saveMem(); }
  };
})();
