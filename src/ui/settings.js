// 設定頁、更新紀錄、加到主畫面提示、語言結構（v1.0）
// 設定存在 FA.settings（main.js 讀寫 localStorage 'fa_settings'）；音效／音樂開關沿用 FA.sound（'fa_sound'、'fa_music'）
(function (g) {
  const FA = g.FA, $ = id => document.getElementById(id);
  const VERSION = FA.VERSION = '1.0';
  const S = FA.settings, save = () => FA.saveSettings && FA.saveSettings();

  // ---------- 語言：目前只有繁中；新增語言＝在 LANGS 加一項、在 STR 加同 key 的字串表，介面文字逐步改用 FA.t(key) ----------
  const LANGS = { 'zh-Hant': '繁體中文' };
  const STR = { 'zh-Hant': {} };
  FA.i18n = { langs: LANGS, strings: STR };
  FA.t = (key, fallback) => { const d = STR[S.lang] || STR['zh-Hant']; return d[key] != null ? d[key] : fallback != null ? fallback : key; };

  // ---------- 更新紀錄（玩家看得懂的版本，依 git log 整理）----------
  const LOG = [
    { v: '1.0', d: '2026-11-27', items: ['新手引導重做：提示只在第一次用到時出現，可跳過，📘 教學可挑章節重看', '第一場戰鬥前有練習關：手指示範怎麼拉射', '新增 ⚙ 設定：音樂、音效、震動、播放速度、瞄準線長短、左右手、減少動態效果、清除存檔', '第一次開啟提示「加入主畫面」，像 App 一樣全螢幕玩', '羈絆加上圖示和 ✓，不用靠顏色分辨；按鈕放大、小字放大', '連線失敗、房號錯、房間滿的訊息更清楚'] },
    { v: '0.9', d: '2026-11-27', items: ['連線自走棋：換手機也能接著玩、淘汰後可觀戰', '6 隻高操作角色：甜蜜點、撞球、花式反彈、節奏，還有飛行中點畫面引爆／分身', '機械、火花平衡調整'] },
    { v: '0.8', d: '2026-11-26', items: ['新模式「連線自走棋」：2～4 人各自經營、兩兩對戰、扣血淘汰', '8 隻新角色＋狙擊、幽影羈絆；圖鑑顯示羈絆剋制', '美術全面升級：2.5D 陰影、壓扁回彈；6 首背景音樂與新音效'] },
    { v: '0.7', d: '2026-11-26', items: ['連線對戰：4 碼房號、每發限時 30 秒（超時 AI 代打）', '每場隨機決定先手', '水上擂台場地、9 種大招特效'] },
    { v: '0.6', d: '2026-11-26', items: ['戰鬥改成「總動數」：每彈 -1、被打倒 -3，對方先歸零就贏', '⚡大招、泳圈柱與尖刺柱、直式場地', '投資環境與策略擴充、等級上限 7'] },
    { v: '0.5', d: '2026-11-26', items: ['敵人詞綴、道具、補給、次元撲滿、羈絆抽獎、陣營、徽章', '羈絆改為湊越多越強', '商店拖曳／長按、戰鬥 2 倍速、結算統計'] },
    { v: '0.2', d: '2026-11-25', items: ['17 隻角色各有能力、武器、位面節點、開局詞綴、投資策略', '瞄準線改成物理預演（顯示反彈與被撞方向）'] },
    { v: '0.1', d: '2026-11-25', items: ['第一版：彈射戰鬥、商店經濟、升星、前台／後台、羈絆、離線可玩'] }
  ];

  // ---------- 共用 ----------
  const modal = (h, b) => FA.ui.modal(h, b);
  function applyBody() {
    document.body.classList.toggle('fa-left', S.hand === 'left');
    document.body.classList.toggle('fa-rm', !!S.reduceMotion);
    document.documentElement.lang = S.lang || 'zh-Hant';
  }
  const KEYS_PROGRESS = ['flick_autochess_save_v2', 'fa_tut', 'fa_a2hs'];

  // ---------- 設定頁 ----------
  const seg = (k, opts) => `<div class="seg" role="radiogroup">${opts.map(([v, t]) => `<button role="radio" aria-checked="${S[k] === v}" class="${S[k] === v ? 'on' : ''}" data-sk="${k}" data-sv="${v}">${S[k] === v ? '✓ ' : ''}${t}</button>`).join('')}</div>`;
  const tog = (id, on) => `<button class="tg ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-tg="${id}">${on ? '開' : '關'}</button>`;
  const row = (lbl, ctl, hint) => `<div class="setrow"><div><b>${lbl}</b>${hint ? `<div class="lbl">${hint}</div>` : ''}</div>${ctl}</div>`;
  function settings(back) {
    const snd = FA.sound || {};
    $('modalBox').className = 'box setbox';
    $('modalBox').innerHTML = `<h2>⚙ 設定</h2>` +
      row('🎵 音樂', tog('music', !!snd.musicOn)) + row('🔊 音效', tog('sound', !!snd.on)) + row('📳 震動', tog('vibrate', !!S.vibrate), 'iPhone Safari 不支援網頁震動') +
      row('⏩ 播放速度預設', seg('speed', [[1, '1x'], [2, '2x']])) +
      row('🎯 瞄準線', seg('aim', [['short', '短'], ['long', '長']]), '短：只畫到第一次碰撞前') +
      row('✋ 慣用手', seg('hand', [['left', '左手'], ['right', '右手']]), '大招鈕、前進鈕移到慣用手那側') +
      row('🌀 減少動態效果', tog('reduceMotion', !!S.reduceMotion), '關掉震動畫面、閃光與裝飾動畫') +
      row('🌐 語言', `<select id="setLang" aria-label="語言">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${S.lang === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`) +
      `<button data-act="log">📝 更新紀錄</button><button data-act="wipe" class="danger">🗑 清除存檔</button>` +
      `<div class="lbl ver">彈射自走棋 v${VERSION}</div><button data-act="close" class="go">完成</button>`;
    $('modal').classList.remove('hidden');
    $('setLang').onchange = e => { S.lang = e.target.value; save(); applyBody(); };
    $('modalBox').onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.tg) {
        const k = t.dataset.tg;
        if (k === 'music') { FA.sound.init && FA.sound.init(); FA.sound.toggleMusic(); }
        else if (k === 'sound') { FA.sound.init && FA.sound.init(); FA.sound.toggle(); }
        else { S[k] = !S[k]; save(); if (k === 'vibrate' && S.vibrate) try { navigator.vibrate && navigator.vibrate(30); } catch (er) { } }
      } else if (t.dataset.sk) { const k = t.dataset.sk, v = t.dataset.sv; S[k] = k === 'speed' ? +v : v; save(); }
      else if (t.dataset.act === 'log') return changelog(() => settings(back));
      else if (t.dataset.act === 'wipe') return wipe(() => settings(back));
      else if (t.dataset.act === 'close') { $('modal').classList.add('hidden'); if (back) back(); return; }
      applyBody(); FA.ui.setBtns && FA.ui.setBtns(); settings(back);
    };
  }
  // 清除存檔：兩次確認
  function wipe(back) {
    modal('<h2>🗑 清除存檔？</h2><p>會刪除：進行中的單人局、教學進度。<br>設定與連線名稱會保留。</p>', [
      { t: '繼續', f: () => modal('<h2>⚠ 確定刪除？</h2><p><b>刪除後無法復原。</b></p>', [
        { t: '永久刪除', cls: 'danger', f: () => { KEYS_PROGRESS.forEach(k => { try { localStorage.removeItem(k); } catch (e) { } }); location.reload(); } },
        { t: '取消', cls: 'go', f: back }]) },
      { t: '取消', cls: 'go', f: back }]);
  }
  function changelog(back) {
    modal(`<h2>📝 更新紀錄</h2><div class="clog">${LOG.map(L => `<div class="choice"><b>v${L.v}</b><span class="tier">${L.d}</span><ul>${L.items.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')}</div>`, [{ t: back ? '返回' : '關閉', cls: 'go', f: back }]);
    $('modalBox').scrollTop = 0;
  }

  // ---------- 加到主畫面：手機瀏覽器、非全螢幕、只提示一次 ----------
  const standalone = () => navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = () => isIOS() || /Android/i.test(navigator.userAgent);
  FA.a2hs = (after, force) => {
    let seen = false; try { seen = !!localStorage.getItem('fa_a2hs'); } catch (e) { }
    if (!force && (seen || standalone() || !isMobile())) return false;
    try { localStorage.setItem('fa_a2hs', '1'); } catch (e) { }
    const ios = force === 'ios' || (force !== 'android' && isIOS());
    const shareIc = '<svg class="a2ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v9h14v-9h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const steps = ios ? [`點 Safari 下方的「分享」${shareIc}`, '往下滑，點「<b>加入主畫面</b>」', '點右上「<b>加入</b>」，之後從主畫面圖示開啟']
      : ['點瀏覽器右上「⋮」選單', '點「<b>加到主畫面</b>」或「安裝應用程式」', '之後從主畫面圖示開啟'];
    modal(`<h2>📲 加到主畫面</h2><p>像 App 一樣<b>全螢幕</b>、可<b>離線</b>玩，存檔也比較不會被清掉。</p><ol class="a2steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol><div class="lbl">這個提示只出現一次。</div>`,
      [{ t: '知道了', cls: 'go', f: after }]);
    return true;
  };

  // ---------- 標題：版本號、⚙ 設定、📝 更新紀錄 ----------
  const title = $('title');
  if (title) {
    const v = document.createElement('button'); v.id = 'verTag'; v.className = 'vertag'; v.textContent = 'v' + VERSION; v.setAttribute('aria-label', `版本 ${VERSION}，看更新紀錄`);
    v.onclick = () => changelog(); title.appendChild(v);
  }
  if ($('btnSet')) $('btnSet').onclick = () => settings();
  if ($('btnLog')) $('btnLog').onclick = () => changelog();
  FA.settingsUI = { open: settings, changelog, refresh: applyBody };
  applyBody();
})(globalThis);
