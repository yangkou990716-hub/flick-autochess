// 介面流程：標題 → 開局詞綴 → 投資環境 → 商店 ⇄ 節點（戰鬥/精英/獎勵/首領）→ 投資策略；存檔、暫停、輸入
(function () {
  const FA = globalThis.FA, D = FA.DATA, C = D.config, RD = D.run, V = FA.view, RUN = FA.run;
  const $ = id => document.getElementById(id), KEY = 'flick_autochess_save_v2';
  let run = null, battle = null, sel = null, screen = 'title', paused = false, ai = null, drag = null, hs = null, mode = 'run', duelName = '';
  const ui = { aim: null, msg: '' };
  let bst = null; // 本場戰鬥統計（在 V.consume 清空事件前掃描）

  // ---------- 設定（震動、播放速度）：FA.settings 給 render.js 共用 ----------
  const SET_KEY = 'fa_settings';
  FA.settings = Object.assign({ vibrate: true, speed: 1, aim: 'long', hand: 'right', reduceMotion: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), lang: 'zh-Hant' }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; } })());
  const saveSet = FA.saveSettings = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(FA.settings)); } catch (e) { } };
  const vib = ms => { if (FA.settings.vibrate) try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };

  // ---------- 存檔 ----------
  let lgHost = null; // ---- 連線自走棋 ----：商店借給 src/league.js 用時的回呼（存檔、準備、離開）
  // ---- 存檔保護 ----：寫入失敗（空間滿、私密瀏覽）先清掉可丟的資料再試，還是不行就提示；讀到損毀的存檔先備份到 KEY_bad 再提示
  const BAD = KEY + '_bad';
  let saveWarnAt = -1e9, loadErr = null;
  function toast(t, ms) {
    let el = $('uxToast');
    if (!el) { el = document.createElement('div'); el.id = 'uxToast'; el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 10px);z-index:70;margin:0 auto;max-width:360px;padding:10px 14px;border-radius:12px;background:#3a1420f2;border:1px solid #ff7a5a;color:#ffd7cf;font-size:14px;line-height:1.5;text-align:center;box-shadow:0 8px 20px #000a;pointer-events:none;transition:opacity .3s'; document.body.appendChild(el); }
    el.innerHTML = t; el.style.opacity = '1'; clearTimeout(el._t); el._t = setTimeout(() => { el.style.opacity = '0'; }, ms || 3500);
  }
  function writeKey(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) {
      try { localStorage.removeItem(BAD); localStorage.setItem(k, v); return true; } catch (e2) { } // 先丟掉損毀存檔的備份再試一次
      if (performance.now() - saveWarnAt > 15000) { saveWarnAt = performance.now(); toast('⚠ 存檔失敗：手機儲存空間不足（或私密瀏覽）。<br>請清出空間，關掉 App 前進度可能遺失'); }
      return false;
    }
  }
  const save = () => { if (mode === 'guide') return; if (lgHost) { try { lgHost.save(run); } catch (e) { } return; } if (!run) return; let j; try { j = JSON.stringify(hs ? { hs, battle, mode, bst } : { run, battle, mode, bst }); } catch (e) { return; } writeKey(KEY, j); };
  const load = () => {
    let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
    if (raw == null) return null;
    try { const s = JSON.parse(raw); if (s && typeof s === 'object' && (s.run || s.hs)) return s; throw new Error('格式不符'); }
    catch (e) { badSave(raw); return null; }
  };
  function badSave(raw) { // 損毀：備份、移除，回標題時提示一次
    try { localStorage.setItem(BAD, typeof raw === 'string' ? raw : JSON.stringify(raw)); } catch (e) { }
    try { localStorage.removeItem(KEY); } catch (e) { }
    loadErr = '存檔資料損毀，無法繼續上一局（已另外備份）。請開新遊戲。';
  }
  // 舊版存檔遷移（src/core/run.js 的 RUN.migrate）：補新欄位、換掉已移除的角色／裝備、檢查戰鬥能不能續打
  function migrateSave(s) {
    if (s.hs) {
      if (!Array.isArray(s.hs.players) || !s.hs.players.length) return null;
      s.hs.players = s.hs.players.filter(p => p && (p.run = RUN.migrate(p.run)));
      if (!s.hs.players.length) return null;
      s.hs.cur = Math.max(0, Math.min(s.hs.players.length - 1, s.hs.cur | 0));
      s.hs.players.forEach((p, i) => { p.name = String(p.name || 'P' + (i + 1)); p.seen = p.seen | 0; p.done = !!p.done; });
    } else if (!(s.run = RUN.migrate(s.run))) return null;
    if (s.battle && !RUN.battleOk(s.battle)) { s.battle = null; s.dropped = true; }
    if (s.bst && typeof s.bst !== 'object') s.bst = null;
    return s;
  }
  const clearSave = () => { try { localStorage.removeItem(KEY); } catch (e) { } };

  // 商店每次操作都整個重畫：內容沒變的區塊就不重設 innerHTML（省 DOM 解析、樣式重算與重排；低階手機差很多）
  const setHTML = (el, h) => { if (el._h !== h || el.innerHTML === '') { el._h = h; el.innerHTML = h; } };
  function show(id) { screen = id; ['title', 'shop', 'battle'].forEach(s => $(s).classList.toggle('hidden', s !== id)); bgm(); }
  // 背景音樂跟著畫面：首領戰看場上有沒有首領
  const bgm = () => FA.sound.music(screen === 'battle' ? (battle && battle.bodies.some(o => o.boss) ? 'boss' : 'battle') : screen);
  const unitN = () => ['front', 'back', 'bench'].reduce((a, z) => a + run[z].filter(Boolean).length, 0);
  const buySnd = n0 => FA.sound.play(unitN() < n0 + 1 ? 'starup' : 'buy'); // 買完隻數沒 +1＝合成升星
  function modal(html, btns, cls) {
    $('modalBox').className = 'box' + (cls ? ' ' + cls : '');
    $('modalBox').innerHTML = html + `<div class="mbtns${btns.length > 3 ? ' many' : ''}">` + btns.map((b, i) => `<button data-m="${i}" class="${b.cls || ''}">${b.t}</button>`).join('') + '</div>';
    $('modal').classList.remove('hidden');
    $('modalBox').onclick = e => { const t = e.target.closest('[data-m]'); if (!t) return; $('modal').classList.add('hidden'); btns[+t.dataset.m].f && btns[+t.dataset.m].f(); };
  }

  // ---------- 文字 ----------
  const MT = D.modText, pct = v => Math.round(v * 100) + '%';
  const modsText = m => Object.entries(m || {}).map(([k, v]) => MT[k] ? MT[k](v) : '').filter(Boolean).join('、');
  const itemText = it => `${D.items[it.id].icon}${D.items[it.id].name}（${D.items[it.id].addTrait ? D.traits[D.items[it.id].addTrait].name + '羈絆 +1、' : ''}${modsText(it.rolls)}）`;
  // ---- 羈絆抽獎 ／ 陣營 ／ 徽章 ---- 文字
  const lotText = L => { if (!L) return ''; const LR = D.lotteryRules, tot = L.pool.reduce((a, p) => a + p[1], 0); return `<span style="color:#ffd54f">🎰 每次${LR.onName[L.on]}抽獎：</span>` + L.pool.map(p => `${p[0] === 'dmg' ? LR.name.dmg + '+' + pct(p[2]) : LR.name[p[0]]} ${Math.round(p[1] / tot * 100)}%`).join('、'); };
  const tierLine = t => `${t.n}：${modsText(t.mods)}${t.lottery ? '<br>　' + lotText(t.lottery) : ''}`;
  const counterLine = T => (T.beats || T.weakTo) ? `<br><span class="lbl">⚔ 剋制：${(T.beats || []).map(k => D.traits[k].name).join('、') || '—'}｜被剋：${(T.weakTo || []).map(k => D.traits[k].name).join('、') || '—'}${T.why ? '（' + T.why + '）' : ''}</span>` : '';
  const FAC = D.factions || {};
  // 色盲友善：每個羈絆配圖示，介面不只靠顏色區分（新羈絆沒列到就用 ◆）
  const TRAIT_IC = { blast: '💥', magnet: '🧲', wall: '🧱', swift: '💨', heavy: '🪨', toxic: '🦠', mech: '⚙️', bounce: '🏀', snipe: '🎯', shade: '🌑', finesse: '✨' };
  const TRAIT_IMG = new Set(['blast', 'magnet', 'wall', 'swift', 'heavy', 'toxic', 'mech', 'bounce', 'snipe', 'shade', 'finesse', 'workshop', 'circus', 'lab', 'guard']);
  const tIc = k => TRAIT_IMG.has(k) && FA.gi ? FA.gi('t-' + k, 'tg') : TRAIT_IC[k] || (D.traits[k] && D.traits[k].icon) || '◆';
  const facName = id => { const U = D.units[id], F = U && U.faction && FAC[U.faction]; return F ? `<span style="color:${F.color}">${F.icon}${F.name}</span>` : ''; };
  const teamEmb = () => FA.battle.emblemMap(RUN.teamUnits(run));
  const weaponText = id => `${D.weapons[id].icon}${D.weapons[id].name}：${D.weapons[id].desc}`;
  function backText(U) {
    const b = U.back; if (!b) return '';
    return { atkPct: `${b.trait ? D.traits[b.trait].name + '角色' : '前台'}攻擊+${pct(b.val)}`, shield: `每回合前台護盾+${b.val}`, heal: `每回合前台回血+${b.val}`,
      zap: `每回合電擊隨機敵人（${pct(b.mult)}攻擊）`, gravity: '每回合把敵人往中間吸', cannon: `每回合炮擊隨機敵人（${pct(b.mult)}攻擊爆炸）`, revive: `第一隻被打倒的隊友當場以 ${pct(b.pct)} 生命撐住（不扣動數）`, mark: `每回合標記 1 名敵人，受傷 +${pct(b.amp || 0)}（${b.turns || 0} 回合）`,
      snipe: `每回合狙擊生命最低的敵人（${pct(b.mult)}攻擊）`, veil: `每 2 回合讓 ${b.n} 名前台隊友隱身：下次被撞必定閃避（3 星 +1 名）`,
      relayReserve: `每場一次：我方第一隻被打倒的前台棋子，將至多 ${b.amount} 點能量轉給存活隊友中能量最高且未滿的人` }[b.type];
  }
  // ---- 大招 ----：角色的大招（units.ult 覆蓋，否則看第一個羈絆）
  const UC = C.ult || { max: 100, gainLaunch: 25, gainHit: 15, gainHurt: 10 };
  const ultKey = id => { const U = D.units[id]; return (U && U.ult) || (D.traitUlt || {})[U && U.traits[0]] || 'nova'; };
  const ultCharge = `開場 ${UC.start || 0}、彈射 +${UC.gainLaunch}、撞到敵人 +${UC.gainHit}、被撞 +${UC.gainHurt}，滿 ${UC.max} 可發動`;
  function ultLine(key, energy) {
    const X = (D.ults || {})[key] || { name: '大招', desc: '' }, bar = energy == null ? '' : `　<span style="color:${energy >= UC.max ? '#ffd54f' : '#9df'}">能量 ${Math.floor(Math.min(UC.max, energy))}/${UC.max}${energy >= UC.max ? '（已滿，發光中）' : ''}</span>`;
    return `<span class="k">⚡大招「${X.name}」：</span>${X.desc}${bar}<br>`;
  }
  const starTip = U => U.ability && ['sweetSpot', 'cueBall', 'trickShot', 'rhythm', 'remoteBomb', 'phantom'].includes(U.ability.type) ? '<span class="lbl">（技巧加成部分 2 星 +12%、3 星 +24%）</span>' : '';
  function unitInfo(u) {
    const U = D.units[u.id], star = u.star - 1;
    const hpMult = C.starMult[star], atkMult = (C.starAtk || C.starMult)[star];
    const role = { front: '前台', back: '後台', both: '兩用（站位賦能）' }[U.role];
    let s = `<b>${U.name} ${'★'.repeat(u.star)}</b>　<span class="k">${U.cost}費</span>　${U.traits.map(t => D.traits[t].name).join('・')}${U.faction ? '　' + facName(u.id) : ''}　${role}<br>`;
    s += `生命 ${Math.round(U.hp * hpMult)}｜攻擊 ${Math.round(U.atk * atkMult)}｜速度 ${U.speed}｜重量 ${U.mass}｜大小 ${U.r}<br>`;
    if (U.ability && U.role !== 'back') s += `<span class="k">${U.role === 'both' ? '前台' : '能力'}：</span>${U.ability.desc}<br>`;
    if (U.tip) s += `<span class="k" style="color:#ffd740">🎯 怎麼玩好：</span>${U.tip}${starTip(U)}<br>`; // ---- 神技 ----
    if (U.back && U.role !== 'front') s += `<span class="k">後台：</span>${backText(U)}<br>`;
    if (U.role !== 'back') s += ultLine(ultKey(u.id), u.energy);
    if (U.link) s += `<span class="k">聯動：</span>撞到${D.units[U.link.with].name} →「${U.link.combo.name}」<br>`;
    if (u.weapon) s += weaponText(u.weapon) + '<br>';
    if (u.items.length) s += u.items.map(itemText).join('<br>') + '<br>';
    return s;
  }

  // ---------- 選擇卡（開局詞綴／環境／路線／獎勵／策略）----------
  function choiceCard(type, id) {
    if (type === 'carrier' || type === 'armory') return extraCard(type, id); // ---- 道具 ---- / ---- 補給 ----
    if (type === 'opener') { const o = RD.openers[id]; return `<b>${o.name}</b><br>${o.desc}`; }
    if (type === 'env') { const o = RD.envs[id]; return `<b>🌐 ${o.name}</b><br>${o.desc}`; }
    if (type === 'supply') { const o = RD.supplies[id]; return `<b>📦 ${o.name}</b><br>${o.desc}`; }
    if (type === 'encounter') {
      const e = RD.encounter[id], w = e.reward;
      return `<b>❗ ${e.name}</b>${e.add ? `<span class="tier" style="color:#f88">敵人 +${e.add} 關${e.extra ? `、多 ${e.extra} 隻` : ''}</span>` : ''}<br>勝利獎勵：${[w.gold ? w.gold + ' 金' : '', w.item ? '裝備' : '', w.weapon ? '武器' : '', w.emblem ? '徽章' : '', w.cons ? consNames(w.cons) : '', w.consOne ? w.consOne.map(k => consNames({ [k]: 1 })).join('或') : '', w.strategy ? RD.tiers[w.strategy].name + '投資策略' : ''].filter(Boolean).join('＋')}`;
    }
    if (type === 'path') { const o = RD.nodeInfo[id], ic = NODE_IC[id]; return `<span class="node-ic" style="--nc:${ic ? ic[1] : '#39c6ff'}">${ic && FA.ti ? FA.ti(ic[0]) : o.icon}</span><div><b>${o.name}</b><br>${o.desc}</div>`; }
    if (type === 'strategy') {
      const o = RD.strategies[id], T = RD.tiers[o.tier];
      return `<span class="tier" style="color:${T.color}">${T.name}</span><b>${o.name}</b><br>${o.desc}` +
        (T.threat ? `<br><span style="color:#f88">之後敵人生命/攻擊 +${pct(T.threat)}${T.extraEnemy ? `、多 ${T.extraEnemy} 隻` : ''}</span>` : '');
    }
  }
  // ---- 畫面 ----：節點圖示（Tabler Icons）、位面地圖列、選擇卡材質
  const NODE_IC = { battle: ['swords', '#ff6a4d'], encounter: ['alert-hexagon', '#f0a030'], reward: ['pig-money', '#ee6fa0'], supply: ['package', '#2fa8e0'], boss: ['crown', '#a04dff'] };
  function planeMap() {
    const st = RUN.steps(run);
    return '<div class="pmap">' + st.map((x, k) => { const ic = x && NODE_IC[x];
      return (k ? `<b class="${k <= run.step ? 'done' : ''}"></b>` : '') + `<i class="${k < run.step ? 'done' : k === run.step ? 'now' : ''}${x === 'boss' ? ' boss' : ''}">${ic && FA.ti ? FA.ti(ic[0]) : '?'}</i>`; }).join('') + '</div>';
  }
  const choiceCls = (type, id) => 'm-' + (type === 'strategy' ? RD.strategies[id].tier : type);
  const choiceTitle = { opener: '選擇開局詞綴', env: '投資環境（持續整局）', path: '選擇路線', supply: '補給 3 選 1', encounter: '遭遇：選擇難度', strategy: '投資策略' };
  Object.assign(choiceTitle, { carrier: '補給：選 1 隻（連裝備）', armory: '武裝箱：3 選 1' }); // ---- 道具 ---- / ---- 補給 ----
  function flow() {
    if (!run) return;
    if (hs) {
      const me = hs.players[hs.cur];
      if (run.over && !me.done) { me.done = true; save(); return modal(`<h2>${me.name}：${run.over === 'win' ? '🏆 通關！' : '☠ 小隊血量歸零'}</h2>打到第 ${run.plane} 位面・第 ${run.stage} 個節點`, [{ t: '繼續', cls: 'go', f: flow }]); }
      if (!run.pending && (run.over || run.stage !== me.seen)) {
        me.seen = run.stage;
        const alive = hs.players.filter(p => !p.run.over);
        if (!alive.length) {
          const rank = hs.players.slice().sort((a, b) => (b.run.over === 'win') - (a.run.over === 'win') || b.run.stage - a.run.stage || b.run.hp - a.run.hp);
          clearSave(); hs = null;
          return modal('<h2>🏁 最終排名</h2>' + rank.map((p, i) => `${i + 1}. ${p.name}　${p.run.over === 'win' ? '通關' : '節點 ' + p.run.stage}　❤${p.run.hp}`).join('<br>'), [{ t: '回標題', f: toTitle }]);
        }
        let k = hs.cur; do { k = (k + 1) % hs.players.length; } while (hs.players[k].run.over);
        hs.cur = k; run = hs.players[k].run; sel = null; save();
        return modal(`<h2>輪到 ${hs.players[k].name}</h2>把手機交給 ${hs.players[k].name}`, [{ t: '開始', cls: 'go', f: () => { show('shop'); renderShop(); flow(); } }]);
      }
    } else if (run.over) {
      const won = run.over === 'win'; clearSave();
      return modal(`<h2 class="res-h ${won ? 'win' : 'lose'}">${won ? '🏆 通關！' : '☠ 小隊血量歸零'}</h2>難度 ${RD.ascensions[run.asc || 0].name}・打到第 ${run.plane} 位面・第 ${run.stage} 個節點<br>投資策略 ${run.strats.length} 張`, [{ t: '回標題', f: toTitle }]);
    }
    const p = run.pending;
    if (p) {
      const sub = p.type === 'env' ? '開局選一次，整局都生效' : p.type === 'path' ? `第 ${run.plane} 位面・節點 ${run.step + 1}/${RUN.steps(run).length}` : p.type === 'strategy' ? (p.tier ? RD.tiers[p.tier].name + '投資策略' : '黃金、稜彩越強，之後敵人也越強') : '';
      $('modalBox').className = 'box pick pick-' + p.type;
      $('modalBox').innerHTML = `<div class="pk-h"><h2>${choiceTitle[p.type]}</h2>${sub ? `<div class="lbl">${sub}</div>` : ''}</div>${p.type === 'path' ? planeMap() : ''}<div class="choices n${p.options.length}">` +
        p.options.map((id, i) => `<div class="choice ${choiceCls(p.type, id)}" data-c="${i}">${choiceCard(p.type, id)}</div>`).join('') + '</div>' +
        ((p.type === 'path' || p.type === 'encounter' || p.type === 'carrier') ? `<div class="mbtns">${p.type === 'carrier' ? carrierBtn(p) : ''}${p.type === 'path' || p.type === 'encounter' ? '<button data-back="1">↩ 先回商店</button>' : ''}</div>` : '');
      $('modal').classList.remove('hidden'); setTimeout(() => tutPending(p.type), 60);
      $('modalBox').onclick = e => {
        if (e.target.dataset.reroll) { if (RUN.rerollCarrier(run)) { FA.sound.play('coin'); save(); } return flow(); } // ---- 補給 ----
        if (e.target.dataset.back) { run.pending = null; $('modal').classList.add('hidden'); save(); renderShop(); return; }
        const t = e.target.closest('[data-c]'); if (!t) return;
        $('modal').classList.add('hidden');
        FA.sound.play(p.type === 'strategy' ? 'strategy' : 'click');
        const r = RUN.choose(run, +t.dataset.c); save();
        if (r === 'battle') return startFight();
        flow();
      };
      return;
    }
    if (affixIntro()) return; // ---- 敵人詞綴 ----
    show('shop'); renderShop(); setTimeout(tutShop, 30);
  }

  // ---------- 商店畫面（橫向，照《貨幣戰爭》配置：docs/ui/currency-wars-ui.md）----------
  const COST_COL = ['#9aa5b1', '#3fb950', '#3a8dde', '#a35ce0', '#f0a000'];
  const roleOf = id => (D.units[id] || {}).role || 'front';
  const posIc = role => `<img class="posic gi p-${role}" src="assets/art/icons/pos-${role}.png" alt="${{ front: '前台', back: '後台', both: '前後台' }[role]}" title="${{ front: '前台', back: '後台', both: '前後台皆可' }[role]}" draggable="false">`;
  // 第幾級才解鎖這格（給鎖住的格子顯示「Lv5」）
  function lvNeed(z, i) {
    const s = RUN.sfx(run), k = C.levels.findIndex(L => (z === 'front' ? Math.min(C.maxFront, L.front + (s.frontAdd || 0)) : L.back) > i);
    return k < 0 ? 0 : k + 1;
  }
  const ui2 = () => FA.settings;
  function renderShop() {
    const lv = RUN.lv(run), boss = RUN.isBoss(run), st = RUN.steps(run), S2 = ui2();
    // 上方資訊列：位面節點進度／小隊血量／金幣（含利息預覽）／等級與經驗條
    $('tStage').innerHTML = `${hs ? `<b>${hs.players[hs.cur].name}</b> ` : ''}<span class="pm-t">位面${run.plane}</span><span class="pm-s">${st.map((x, k) => `<i class="${k < run.step ? 'done' : k === run.step ? 'now' : ''}${x === 'boss' ? ' boss' : ''}"></i>`).join('')}</span>${boss ? '<span class="pm-b">👑</span>' : ''}`;
    $('tHp').innerHTML = `❤ <b>${run.hp}</b>${run.lastStand ? ' 🛡' + (run.lastStand > 1 ? run.lastStand : '') : ''}`;
    const s = RUN.sfx(run), e = RUN.efx(run), cap = Math.max(C.interestMax + s.interestAdd + (e.interestAdd || 0), s.interestCap || 0), intr = Math.min(cap, Math.floor(run.gold / C.interestPer));
    $('tGold').innerHTML = `💰 <b>${run.gold}</b><small title="下一場結算利息">+${intr}</small>`;
    const nx = C.levels[run.level], xpPct = nx ? Math.round(run.xp / nx.xp * 100) : 100;
    $('tLv').innerHTML = `<b>Lv${run.level}</b><span class="xpb"><i style="width:${xpPct}%"></i></span><small>${nx ? `${run.xp}/${nx.xp}` : 'MAX'}</small>`;
    // 右側情報：環境、首領、連勝敗、敵強化、詞綴（點了看說明）
    const env = run.env ? RD.envs[run.env] : null, chips = [];
    if (env) chips.push(`<span class="chip env" data-env="1">🌐${env.name}</span>`);
    if (boss) chips.push(`<span class="chip boss">👑${RUN.bossInfo(run).name}</span>`);
    if (run.streak) chips.push(`<span class="chip ${run.streak > 0 ? 'win' : 'lose'}">${run.streak > 0 ? '連勝' : '連敗'} ${Math.abs(run.streak)}</span>`);
    if (run.threat && mode !== 'league') chips.push(`<span class="chip threat">敵強化 ${run.threat > 0 ? '+' : ''}${pct(run.threat)}</span>`);
    $('enemyInfo').innerHTML = chips.join('') + affixChips(); // ---- 敵人詞綴 ----
    setHTML($('strats'), run.strats.map(id => { const S = RD.strategies[id], T = RD.tiers[S.tier]; return `<span class="st-chip" style="border-color:${T.color};color:${T.color}" data-st="${id}">${S.name}</span>`; }).join(''));
    // 左側羈絆面板：啟動中在上，顯示「n/下一階」與差幾隻
    const onTeam = run.front.slice(0, lv.front).concat(run.back.slice(0, lv.back)).filter(Boolean).map(u => u.id);
    const tt = FA.battle.traitTiers(onTeam, teamEmb());
    const trs = Object.keys(D.traits).filter(k => tt.counts[k]).sort((a, b) => (!!tt.active[b] - !!tt.active[a]) || tt.counts[b] - tt.counts[a]);
    setHTML($('traits'), (trs.map(k => {
      const T = D.traits[k], n = tt.counts[k], a = tt.active[k], nx2 = T.tiers.find(t => t.n > n), top = nx2 || T.tiers[T.tiers.length - 1];
      return `<span class="tr ${a ? 'act' : ''}" style="--tc:${T.color}" data-tr="${k}"><span class="tic" aria-hidden="true">${tIc(k)}</span><span class="tn">${a ? '✓' : ''}${T.name}${a && a.lottery ? '🎰' : ''}</span><b class="tcn">${n}/${top.n}</b>${nx2 ? `<small class="need">差${nx2.n - n}</small>` : '<small class="need max">滿</small>'}</span>`;
    }).join('') + factionChips(onTeam)) || '<span class="lbl tr-empty">同羈絆湊 2 隻起有加成</span>');
    $('trPanel').classList.toggle('fold', !!S2.trFold); $('shop').classList.toggle('tr-fold', !!S2.trFold);
    // 前台／後台／備戰區：格子，鎖住的標示幾級解鎖
    ['front', 'back', 'bench'].forEach(z => {
      const lim = z === 'front' ? lv.front : z === 'back' ? lv.back : C.benchSize;
      const len = z === 'bench' ? C.benchSize : run[z].length;
      setHTML($(z), run[z].slice(0, len).map((u, i) => {
        const isSel = sel && sel.zone === z && sel.i === i, lk = i >= lim, need = lk && z !== 'bench' ? lvNeed(z, i) : 0;
        return `<div class="slot ${lk ? 'lock' : ''} ${isSel ? 'sel' : ''} ${sel && (sel.zone || sel.item != null || sel.wp != null) && !isSel && !lk ? 'tgt' : ''}" data-z="${z}" data-i="${i}">${u ? unitHTML(u) : lk ? `<span class="lk">🔒${need ? `<small>Lv${need}</small>` : ''}</span>` : ''}</div>`;
      }).join(''));
    });
    const cnt = z => run[z].slice(0, z === 'front' ? lv.front : z === 'back' ? lv.back : C.benchSize).filter(Boolean).length;
    $('zfN').textContent = `${cnt('front')}/${lv.front}`; $('zbN').textContent = `${cnt('back')}/${lv.back}`; $('zcN').textContent = `${cnt('bench')}/${C.benchSize}`;
    // 右上：未裝備的裝備、武器、道具（點看說明，拖到角色身上）
    const inv = run.items.map((it, i) => `<span class="item ${sel && sel.item === i ? 'sel' : ''}" data-it="${i}" title="${D.items[it.id].name}">${D.items[it.id].icon}<small>${D.items[it.id].name}</small></span>`)
      .concat(run.weapons.map((w, i) => `<span class="item wp ${sel && sel.wp === i ? 'sel' : ''}" data-wp="${i}" title="${D.weapons[w].name}">${D.weapons[w].icon}<small>${D.weapons[w].name}</small></span>`));
    inv.push(...consChips()); // ---- 道具 ----
    setHTML($('items'), inv.length ? inv.join('') : '<span class="lbl">🎒 無裝備</span>');
    // 右側詳情
    let info = '';
    if (sel && sel.zone && RUN.unitAt(run, sel)) { const u = RUN.unitAt(run, sel); info = `<div class="ux-detail">${unitInfo(u)}</div><div class="ib"><button id="bSell" class="danger">出售 +${RUN.sellPrice(u, run)}💰</button><button id="bDetail">詳細</button></div><span class="lbl">點空格移動／點角色交換；長按拖曳</span>`; }
    else if (sel && sel.cs != null && (run.consumables || [])[sel.cs]) info = consInfo(sel.cs); // ---- 道具 ----
    else if (sel && sel.item != null) info = itemText(run.items[sel.item]) + '<br><span class="lbl">點角色裝上，或直接拖到角色身上（最多 3 件）。鐵拳＋彈簧＝爆裂彈簧；護符＋疾行靴＝吸血疾靴</span>';
    else if (sel && sel.wp != null) info = weaponText(run.weapons[sel.wp]) + '<br><span class="lbl">點角色裝上，或拖到角色身上（每隻 1 把，會替換）</span>';
    else if (sel && sel.trait) { const T = D.traits[sel.trait]; info = `<b>${tIc(sel.trait)} ${T.name}</b>（只加給${T.name}角色）<br>` + T.tiers.map(tierLine).join('<br>') + counterLine(T); }
    else if (sel && sel.fa) info = facInfo(sel.fa);
    else if (sel && sel.st) { const S = RD.strategies[sel.st]; info = `<b>${S.name}</b>（${RD.tiers[S.tier].name}）<br>${S.desc}`; }
    else if (sel && sel.env && env) info = `<b>🌐 ${env.name}</b>（投資環境，整局生效）<br>${env.desc}`;
    else info = '';
    $('info').innerHTML = info;
    // 底部商店抽屜：標題列＝等級機率、備戰區空位；卡片＝費用、羈絆、站位、能否升星
    const odds = (C.odds || [])[run.level - 1] || [], benchFree = run.bench.filter(x => !x).length;
    $('shopHead').innerHTML = `<b>🛒 商店</b><span class="odds">${odds.map((v, k) => v ? `<i style="--cc:${COST_COL[k]}">${k + 1}費 ${v}%</i>` : '').join('')}</span><span class="bf ${benchFree ? '' : 'full'}">備戰空位 ${benchFree}</span>`;
    setHTML($('shopRow'), run.shop.map((id, i) => {
      if (!id) return `<div class="card empty"><span>已購買</span></div>`;
      const U = D.units[id], cost = RUN.unitCost(run, id), c = owned(id), canStar = c[0] === 2;
      const poor = run.gold < cost, full = !benchFree && !canStar, ic = icon(id, 1, 64);
      return `<div class="card cost-${U.cost}${poor ? ' poor' : ''}${full ? ' full' : ''}${canStar ? ' up' : ''}" data-b="${i}" style="--cc:${COST_COL[U.cost - 1]}">` +
        `<span class="cc">${cost}<i>💰</i></span>${posIc(U.role)}` +
        (ic ? `<img src="${ic}" alt="">` : `<div class="dot" style="background:${U.color}"></div>`) +
        `<div class="cbody"><div class="cn">${U.name}</div><div class="t">${U.traits.map(t => `<span>${tIc(t)}${D.traits[t].name}</span>`).join('')}</div>${cardHint(id, onTeam, tt)}</div>${full ? '<span class="cx">備戰區已滿</span>' : ''}</div>`;
    }).join(''));
    const fold = !!S2.shopFold; $('shopDrawer').classList.toggle('fold', fold); $('shop').classList.toggle('dr-open', !fold);
    $('bShop').innerHTML = `🛒 商店 ${fold ? '▴' : '▾'}`; $('bShop').classList.toggle('on', !fold);
    $('bReroll').innerHTML = run.freeLeft ? `🔄 免費刷新` : `🔄 刷新 <small>${RUN.rerollCost(run)}💰</small>`;
    $('bReroll').disabled = !run.freeLeft && run.gold < RUN.rerollCost(run);
    $('bXp').innerHTML = `<b>Lv${run.level}</b><span class="xpb"><i style="width:${xpPct}%"></i></span><small>${run.level >= C.levels.length ? '已滿級' : `升級 ${C.xpCost}💰`}</small>`;
    $('bXp').disabled = run.gold < C.xpCost || run.level >= C.levels.length;
    $('bLock').classList.toggle('on', run.locked); $('bLock').innerHTML = run.locked ? '🔒<small>已鎖定</small>' : '🔓<small>鎖定</small>'; $('bLock').setAttribute('aria-pressed', !!run.locked);
  }
  // ---- 陣營 ----：商店羈絆列的陣營（方框、虛線外框，和流派圓角膠囊區分）
  function factionChips(onTeam) {
    const ft = FA.battle.factionTiers(onTeam);
    return Object.keys(FAC).map(k => {
      const F = FAC[k], n = ft.counts[k] || 0, a = ft.active[k]; if (!n) return '';
      const nx = F.tiers.find(t => t.n > n);
      return `<span class="tr fa ${a ? 'act' : ''}" data-fa="${k}" style="--tc:${F.color}"><span class="tic">${F.icon}</span><span class="tn">${F.name}</span><b class="tcn">${n}/${(nx || F.tiers[F.tiers.length - 1]).n}</b>${nx ? `<small class="need">差${nx.n - n}</small>` : ''}</span>`;
    }).join('');
  }
  const facInfo = k => { const F = FAC[k]; return `<b style="color:${F.color}">${F.icon}${F.name}</b>（陣營：經濟／規則加成，算前台＋後台）<br>` + F.tiers.map(t => `${t.n}：${t.desc}`).join('<br>') + `<br><span class="lbl">成員：${F.members.map(id => D.units[id].name).join('、')}</span>`; };
  // 場上已有幾隻（升星進度）＋買了能不能湊羈絆
  function owned(id) { const c = [0, 0, 0]; ['front', 'back', 'bench'].forEach(z => run[z].forEach(u => { if (u && u.id === id) c[u.star - 1]++; })); return c; }
  function cardHint(id, onTeam, tt) {
    const c = owned(id); let h = '';
    if (c[0] || c[1]) h += `<div class="ux-own ${c[0] === 2 ? 'up' : ''}">${c[0] === 2 ? '再1隻升星！' : c[0] ? `已有 ${c[0]}/3` : ''}${c[1] ? `${c[0] ? ' ' : ''}★★×${c[1]}${c[1] === 2 ? '(差1)' : ''}` : ''}</div>`;
    if (!onTeam.includes(id)) D.units[id].traits.forEach(t => {
      const T = D.traits[t], n = (tt.counts[t] || 0) + 1, hit = T.tiers.find(x => x.n === n);
      if (hit) h += `<div class="ux-syn">湊${T.name}${n}</div>`;
      else if (tt.counts[t]) { const nx = T.tiers.find(x => x.n > n); if (nx) h += `<div class="ux-syn near">${T.name}${n}/${nx.n}</div>`; }
    });
    return h;
  }
  // 頭像：用 assets/art/units/ 的手繪圖（星級另外畫在底部）；找不到時退回程式繪製
  const ART = new Set(Object.keys(D.units));
  const icon = (id, star, px) => { if (ART.has(id)) return 'assets/art/units/s/' + id + '.png'; try { return FA.sprites && FA.sprites.icon ? FA.sprites.icon(id, star, px) : null; } catch (e) { return null; } };
  // 棋子：右上站位圖示、底部星級、下方最多 3 件裝備（貨幣戰爭的角色卡）、右側武器
  function unitHTML(u) {
    const U = D.units[u.id], ic = icon(u.id, u.star, 64);
    const extra = `${posIc(U.role)}<span class="st s${u.star}">${'★'.repeat(u.star)}</span>${u.items.length ? `<span class="it">${u.items.map(i => `<i>${D.items[i.id].icon}</i>`).join('')}</span>` : ''}${u.weapon ? `<span class="wp">${D.weapons[u.weapon].icon}</span>` : ''}<span class="un">${U.name}</span>`;
    if (ic) return `<div class="u sp" style="background-image:url(${ic})">${extra}</div>`;
    return `<div class="u" style="background:${U.color};color:${U.id === 'feather' ? '#333' : '#fff'}">${extra}</div>`;
  }

  $('shop').addEventListener('click', e => {
    const t = e.target.closest('[data-z],[data-it],[data-wp],[data-b],[data-tr],[data-fa],[data-st],[data-cs],[data-env],#bSell,#bDetail'); if (!t) return;
    if (consClick(t)) return; // ---- 道具 ----
    if (t.id === 'bDetail') { if (sel && sel.zone) detail(sel); return; }
    if (t.id === 'bSell') { RUN.sell(run, sel); sel = null; FA.sound.play('sell'); }
    else if (t.dataset.env) sel = { env: 1 };
    else if (t.dataset.b != null) { const n0 = unitN(); if (!RUN.buy(run, +t.dataset.b)) return flash(run.gold < RUN.unitCost(run, run.shop[+t.dataset.b] || Object.keys(D.units)[0]) ? '金幣不足' : '備戰區已滿'); buySnd(n0); }
    else if (t.dataset.it != null) { const i = +t.dataset.it; sel = sel && sel.item === i ? null : { item: i }; }
    else if (t.dataset.wp != null) { const i = +t.dataset.wp; sel = sel && sel.wp === i ? null : { wp: i }; }
    else if (t.dataset.tr) sel = { trait: t.dataset.tr };
    else if (t.dataset.fa) sel = { fa: t.dataset.fa };
    else if (t.dataset.st) sel = { st: t.dataset.st };
    else {
      const loc = { zone: t.dataset.z, i: +t.dataset.i }, u = RUN.unitAt(run, loc);
      if (sel && sel.cs != null) { const ci = sel.cs; sel = null; if (u) return applyCons(ci, loc); renderShop(); return; } // ---- 道具 ----
      if (sel && sel.item != null) { if (u) { const r = RUN.equip(run, sel.item, loc); sel = null; if (!r) { renderShop(); return flash('最多 3 件裝備'); } if (r === 'combine') { renderShop(); save(); return flash('合成進階裝備！'); } } }
      else if (sel && sel.wp != null) { if (u) { RUN.equipWeapon(run, sel.wp, loc); sel = null; } }
      else if (sel && sel.zone) { if (!(sel.zone === loc.zone && sel.i === loc.i)) RUN.move(run, sel, loc); sel = null; }
      else if (u) sel = loc;
    }
    renderShop(); save();
  });

  // ---------- 商店拖曳／長按（pointer events；短按仍走上面的 click）----------
  let pd = null, noClickUntil = 0;
  $('shop').addEventListener('contextmenu', e => e.preventDefault());
  $('shop').addEventListener('click', e => { if (performance.now() < noClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
  // 按下：角色／商店卡片／裝備／道具都可拖。移動超過 8px 立刻拖；角色、裝備長按 0.3 秒「拿起來」（不用移動）；商店卡片長按看詳細
  $('shop').addEventListener('pointerdown', e => {
    if (e.button > 0 || pd || !run) return;
    const t = e.target.closest('[data-z],[data-b],[data-cs],[data-it],[data-wp]'); if (!t) return;
    if (t.dataset.cs != null) return consDown(e, t); // ---- 道具 ----
    const src = t.dataset.b != null ? { buy: +t.dataset.b } : t.dataset.it != null ? { it: +t.dataset.it } : t.dataset.wp != null ? { wp: +t.dataset.wp } : { zone: t.dataset.z, i: +t.dataset.i };
    if (src.buy != null ? !run.shop[src.buy] : src.zone ? !RUN.unitAt(run, src) : false) return;
    pd = { src, el: t, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, id: e.pointerId, drag: false, over: null, ghost: null };
    pd.timer = setTimeout(() => {
      if (!pd || pd.drag) return;
      if (pd.src.buy != null) { const s2 = pd.src; endDrag(); noClickUntil = performance.now() + 600; vib(10); detail(s2); return; }
      vib(12); startDrag(); pd.ghost.style.left = pd.cx + 'px'; pd.ghost.style.top = pd.cy + 'px'; // 拿起來
    }, 300);
  });
  addEventListener('pointermove', e => {
    if (!pd || e.pointerId !== pd.id) return;
    pd.cx = e.clientX; pd.cy = e.clientY;
    if (!pd.drag) { if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) < 8) return; clearTimeout(pd.timer); startDrag(); }
    e.preventDefault();
    pd.ghost.style.left = e.clientX + 'px'; pd.ghost.style.top = e.clientY + 'px';
    const tg = dropAt(e.clientX, e.clientY), el = tg ? tg.el : null;
    if (pd.over !== el) { pd.over && pd.over.classList.remove('ux-over'); el && el.classList.add('ux-over'); pd.over = el; if (el) vib(5); }
  }, { passive: false });
  addEventListener('pointerup', e => {
    if (!pd || e.pointerId !== pd.id) return;
    const d = pd, tg = d.drag ? dropAt(e.clientX, e.clientY) : null; endDrag(); // 先找目標，再收起出售區
    if (d.drag) { noClickUntil = performance.now() + 250; doDrop(d.src, tg); }
  });
  addEventListener('pointercancel', e => { if (pd && e.pointerId === pd.id) endDrag(); });
  function startDrag() {
    if (pd.src.cs != null) return consStartDrag(); // ---- 道具 ----
    pd.drag = true; sel = null;
    const g = document.createElement('div'); g.className = 'ux-ghost';
    if (pd.src.it != null || pd.src.wp != null) { g.classList.add('gi'); g.textContent = pd.src.it != null ? D.items[run.items[pd.src.it].id].icon : D.weapons[run.weapons[pd.src.wp]].icon; }
    else { const u = pd.src.buy != null ? null : RUN.unitAt(run, pd.src), id = u ? u.id : run.shop[pd.src.buy]; g.innerHTML = unitHTML(u || { id, star: 1, items: [], weapon: null });
      if (u) { $('uxSell').querySelectorAll('.sz').forEach(z => { z.innerHTML = `出售<b>+${RUN.sellPrice(u, run)}💰</b>`; }); $('uxSell').classList.remove('hidden'); } }
    document.body.appendChild(g); pd.ghost = g; g.style.left = pd.x + 'px'; g.style.top = pd.y + 'px';
    $('shop').classList.add('ux-dragging'); pd.el.classList.add('ux-src');
  }
  function endDrag() {
    if (!pd) return; clearTimeout(pd.timer);
    if (pd.ghost) pd.ghost.remove(); if (pd.over) pd.over.classList.remove('ux-over'); pd.el.classList.remove('ux-src');
    $('shop').classList.remove('ux-dragging'); $('uxSell').classList.add('hidden'); pd = null;
  }
  // 手指下方的放置目標：出售區／格子／整排（放到該排第一個空位）
  function dropAt(x, y) {
    const el = document.elementFromPoint(x, y); if (!el) return null;
    const sz = el.closest('#uxSell .sz'); if (sz) return { sell: true, el: sz };
    const ie = el.closest('[data-it]'); if (ie && pd && pd.src.cs != null) return { item: +ie.dataset.it, el: ie }; // ---- 道具 ----
    const s = el.closest('[data-z]');
    if (pd && (pd.src.it != null || pd.src.wp != null || pd.src.cs != null)) return s && RUN.unitAt(run, { zone: s.dataset.z, i: +s.dataset.i }) ? { loc: { zone: s.dataset.z, i: +s.dataset.i }, el: s } : null; // 裝備只能放在角色身上
    if (s && !s.classList.contains('lock')) return { loc: { zone: s.dataset.z, i: +s.dataset.i }, el: s };
    const row = el.closest('#front,#back,#bench');
    if (row) {
      const lim = row.id === 'front' ? RUN.lv(run).front : row.id === 'back' ? RUN.lv(run).back : C.benchSize, k = run[row.id].findIndex((u, i) => !u && i < lim);
      if (k >= 0) return { loc: { zone: row.id, i: k }, el: row };
    }
    return null;
  }
  function doDrop(src, tg) {
    if (!tg) return;
    if (src.cs != null) { if (tg.loc || tg.item != null) applyCons(src.cs, tg.loc || { item: tg.item }); return; } // ---- 道具 ----
    if (src.it != null) { const r = RUN.equip(run, src.it, tg.loc); renderShop(); save(); if (!r) return flash('最多 3 件裝備'); FA.sound.play('coin'); if (r === 'combine') flash('合成進階裝備！'); return; }
    if (src.wp != null) { RUN.equipWeapon(run, src.wp, tg.loc); FA.sound.play('coin'); renderShop(); save(); return; }
    if (src.buy != null) {
      if (!tg.loc) return;
      const uid = run.uid, n0 = unitN();
      if (!RUN.buy(run, src.buy)) { renderShop(); return flash(run.gold < RUN.unitCost(run, run.shop[src.buy]) ? '金幣不足' : '備戰區已滿'); }
      buySnd(n0);
      let from = null; ['front', 'back', 'bench'].forEach(z => run[z].forEach((u, i) => { if (u && u.uid === uid) from = { zone: z, i }; }));
      if (from && !(from.zone === tg.loc.zone && from.i === tg.loc.i)) RUN.move(run, from, tg.loc);
      renderShop(); save(); if (!from) flash('升星！'); return;
    }
    if (tg.sell) { RUN.sell(run, src); FA.sound.play('sell'); vib(20); }
    else if (!(src.zone === tg.loc.zone && src.i === tg.loc.i) && !RUN.move(run, src, tg.loc)) { renderShop(); return flash('該格尚未解鎖'); }
    renderShop(); save();
  }
  // 長按：詳細資訊
  function detail(src) {
    if (src.cs != null) return consDetail(src.cs); // ---- 道具 ----
    const shopCard = src.buy != null, id = shopCard ? run.shop[src.buy] : RUN.unitAt(run, src).id;
    const u = shopCard ? { id, star: 1, items: [], weapon: null } : RUN.unitAt(run, src), c = owned(id);
    const prog = `<span class="k">升星：</span>1星 ${c[0]}/3　2星 ${c[1]}/3${c[2] ? `　3星 ×${c[2]}` : ''}`;
    const tr = D.units[id].traits.map(t => { const T = D.traits[t]; return `<span class="k">${T.name}：</span>` + T.tiers.map(x => `${x.n}隻 ${modsText(x.mods)}${x.lottery ? '（🎰抽獎）' : ''}`).join('；'); }).join('<br>') +
      (D.units[id].faction ? '<br>' + facInfo(D.units[id].faction) : '');
    const btns = shopCard ? [{ t: `購買 ${RUN.unitCost(run, id)}💰`, cls: 'go', f: () => { const n0 = unitN(); if (!RUN.buy(run, src.buy)) flash('金幣或空位不足'); else buySnd(n0); renderShop(); save(); } }, { t: '關閉' }]
      : [{ t: `賣出 +${RUN.sellPrice(u, run)}`, f: () => { RUN.sell(run, src); renderShop(); save(); } }, { t: '關閉', cls: 'go' }];
    modal(`<div class="ux-detail">${unitInfo(u)}${D.units[id].role !== 'back' ? `<span class="lbl">大招能量戰鬥中累積：${ultCharge}</span><br>` : ''}${prog}<br>${tr}</div>`, btns);
  }

  // ---- 道具 ----
  // 消耗品：物品欄虛線框顯示；武裝箱點了直接開 3 選 1；其他先點道具再點角色／裝備，或直接拖過去；長按看說明
  const CS = D.consumables || {};
  const consNames = m => Object.keys(m).map(k => CS[k] ? CS[k].icon + CS[k].name + (m[k] > 1 ? '×' + m[k] : '') : '').filter(Boolean).join('＋');
  const consChips = () => (run.consumables || []).map((id, i) => CS[id] ? `<span class="item cs ${sel && sel.cs === i ? 'sel' : ''}" data-cs="${i}" title="${CS[id].name}">${CS[id].icon}<small>${CS[id].name}</small></span>` : '').filter(Boolean);
  const consHow = { unit: '點角色使用（或把道具拖到角色上）', item: '點物品欄裝備或角色（身上有多件會再問）使用，也可以拖過去', none: '點一下直接打開' };
  function consInfo(ci) { const X = CS[run.consumables[ci]]; return `<b>${X.icon}${X.name}</b>（道具）<br>${X.desc}<br><span class="lbl">${consHow[X.target || 'none']}；再點一次道具取消</span>`; }
  function consDetail(ci) { const X = CS[(run.consumables || [])[ci]]; if (!X) return; modal(`<div class="ux-detail"><b>${X.icon}${X.name}</b>（道具${X.reusable ? '・可重複使用' : '・一次性'}）<br>${X.desc}<br><span class="lbl">${consHow[X.target || 'none']}</span></div>`, [{ t: '關閉', cls: 'go' }]); }
  // 商店 click：點道具／道具選中時點物品欄裝備。回傳 true 表示已處理
  function consClick(t) {
    if (t.dataset.cs != null) {
      const i = +t.dataset.cs; if (!(run.consumables || [])[i]) return false;
      if (RUN.consNeeds(run.consumables[i]) === 'none') { applyCons(i, null); return true; }
      sel = sel && sel.cs === i ? null : { cs: i }; renderShop(); return true;
    }
    if (t.dataset.it != null && sel && sel.cs != null && RUN.consNeeds(run.consumables[sel.cs]) === 'item') { applyCons(sel.cs, { item: +t.dataset.it }); return true; }
    return false;
  }
  // 使用道具：tgt＝null（武裝箱）／角色格 {zone,i}／物品欄 {item:k}
  function applyCons(ci, tgt) {
    const X = CS[(run.consumables || [])[ci]]; if (!X) return;
    if (X.target === 'item' && tgt && tgt.zone && tgt.slot == null) {
      const u = RUN.unitAt(run, tgt); if (!u || !u.items.length) { sel = null; renderShop(); return flash('這隻沒有裝備'); }
      if (u.items.length > 1) return modal(`<h2>${X.icon} ${X.name}：選 1 件</h2>`, u.items.map((it, k) => ({ t: itemText(it), f: () => applyCons(ci, Object.assign({ slot: k }, tgt)) })).concat([{ t: '取消', f: () => { sel = null; renderShop(); } }]));
      tgt = Object.assign({ slot: 0 }, tgt);
    }
    const r = RUN.useCons(run, ci, tgt); sel = null;
    if (!r || !r.ok) { renderShop(); return flash((r && r.msg) || '無法使用'); }
    FA.sound.play('coin'); vib(15); save();
    if (run.pending) return flow();
    renderShop(); $('info').innerHTML = `<b style="color:#5cf">${X.icon} ${r.msg}</b>` + (r.item ? '<br>' + itemText(r.item) : '');
  }
  function consDown(e, t) {
    const ci = +t.dataset.cs; if (!(run.consumables || [])[ci]) return;
    pd = { src: { cs: ci }, el: t, x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, over: null, ghost: null };
    pd.timer = setTimeout(() => { if (pd && !pd.drag) { const s = pd.src; endDrag(); noClickUntil = performance.now() + 600; vib(10); detail(s); } }, 450);
  }
  function consStartDrag() {
    pd.drag = true; sel = null;
    const g = document.createElement('div'); g.className = 'ux-ghost'; g.style.fontSize = '30px'; g.textContent = CS[run.consumables[pd.src.cs]].icon;
    document.body.appendChild(g); pd.ghost = g; g.style.left = pd.x + 'px'; g.style.top = pd.y + 'px';
    $('shop').classList.add('ux-dragging'); pd.el.classList.add('ux-src');
  }
  // ---- 補給 ----／武裝箱 選擇卡
  function extraCard(type, o) {
    if (type === 'armory') { const I = D.items[o]; return `<b>${I.icon} ${I.name}</b>${I.recipe ? `<span class="tier">${I.recipe.map(x => D.items[x].name).join('＋')}</span>` : ''}<br>${Object.entries(I.affix).map(([k, v]) => D.modText[k] ? D.modText[k](v[0]) + (v[0] !== v[1] ? '～' + D.modText[k](v[1]).replace(/^[^\d+-]*/, '') : '') : '').filter(Boolean).join('、')}`; }
    if (o.sup) { const S = RD.supplies[o.sup]; return `<span class="tier">保底</span><b>📦 ${S.name}</b><br>${S.desc}`; }
    const U = D.units[o.u], cc = ['#888', '#3fb950', '#4ea0ff', '#b072ff', '#ffb000'][U.cost - 1], ic = icon(o.u, 1, 40), c = owned(o.u);
    return `<div style="display:flex;gap:10px;align-items:center">${ic ? `<img src="${ic}" style="width:44px;height:44px;flex:none">` : `<div style="width:36px;height:36px;border-radius:50%;flex:none;background:${U.color}"></div>`}<div>` +
      `<span class="tier" style="color:${cc}">${U.cost} 費</span><b>${U.name}</b>${c[0] || c[1] ? `　<span class="lbl">已有 ${c[0]}${c[1] ? '＋★★' + c[1] : ''}</span>` : ''}<br>${U.traits.map(t => D.traits[t].name).join('・')}　${{ front: '前台', back: '後台', both: '兩用' }[U.role]}<br>帶：${itemText(o.it)}</div></div>`;
  }
  function carrierBtn(p) { const c = RUN.carrierRerollCost(); return p.rerolls > 0 ? `<button data-reroll="1" ${run.gold < c ? 'disabled' : ''}>重骰 ${c}💰（剩 ${p.rerolls} 次，現有 ${run.gold}）</button>` : ''; }
  $('bReroll').onclick = () => { if (RUN.reroll(run)) FA.sound.play('reroll'); renderShop(); save(); };
  $('bLock').onclick = () => { run.locked = !run.locked; vib(8); renderShop(); save(); };
  // 商店抽屜（可常駐展開，記在設定）、羈絆面板收合、選單、局內圖鑑
  const setFold = (k, v) => { FA.settings[k] = v; saveSet(); renderShop(); };
  $('bShop').onclick = () => setFold('shopFold', !FA.settings.shopFold);
  $('shopHead').onclick = () => setFold('shopFold', !FA.settings.shopFold);
  $('trFold').onclick = () => setFold('trFold', !FA.settings.trFold);
  $('bMenu').onclick = () => $('shopMenu').classList.toggle('hidden');
  $('bMenuX').onclick = () => $('shopMenu').classList.add('hidden');
  $('shopMenu').addEventListener('click', e => { if (e.target.closest('button')) $('shopMenu').classList.add('hidden'); });
  $('bCodexIn').onclick = () => codex('策略');
  $('bSetIn').onclick = () => FA.settingsUI && FA.settingsUI.open(() => renderShop());
  $('bXp').onclick = () => { const lv = run.level; if (RUN.buyXp(run)) FA.sound.play(run.level > lv ? 'starup' : 'coin'); renderShop(); save(); };
  $('bFight').onclick = () => {
    if (lgHost) { sel = null; return lgHost.ready(); } // ---- 連線自走棋 ----
    if (!run.front.slice(0, RUN.lv(run).front).some(Boolean)) return flash('前台至少要放 1 隻');
    sel = null; RUN.advance(run); save(); flow();
  };
  $('bExport').onclick = () => {
    const code = RUN.exportTeam(run, hs ? hs.players[hs.cur].name : '玩家');
    try { navigator.clipboard && navigator.clipboard.writeText(code); } catch (e) { }
    modal(`<h2>📤 隊伍代碼</h2>已嘗試複製到剪貼簿。傳給朋友，對方在「⚔ 代碼對戰」貼上就能和你的隊伍（AI 操控）對打。<textarea readonly>${code}</textarea>`, [{ t: '關閉' }]);
  };
  $('bDuel').onclick = () => {
    modal('<h2>⚔ 代碼對戰</h2>貼上對手的隊伍代碼，用你目前前台/後台和對手（AI 操控）打一場，不影響本局進度。<textarea id="duelCode"></textarea>', [
      { t: '開打', cls: 'go', f: () => {
        const team = RUN.importTeam(document.getElementById('duelCode').value || '');
        if (!team) return flash('代碼無效');
        const b = RUN.duelBattle(run, team); if (!b) return flash('雙方前台都至少要 1 隻');
        mode = 'duel'; duelName = team.name; battle = b; bst = newStats(); hideBInfo(); V.reset(); ai = null; ui.aim = null; show('battle'); V.resize(); save();
        V.banner = { txt: '對戰 ' + team.name, life: 1.4 };
      } }, { t: '取消' }]);
  };
  $('bQuit').onclick = () => { save(); if (lgHost) return lgHost.quit(); toTitle(); };
  $('bUlt').onclick = () => { ui.ultArmed = !ui.ultArmed; vib(ui.ultArmed ? 25 : 8); if (ui.ultArmed) V.banner = { txt: '⚡ 彈發光的棋子放大招', life: 1, max: 1, col: '#ffd54f' }; };
  function startFight() {
    if (guideWanted()) return guideOffer(startFight);
    mode = 'run';
    const b = RUN.startBattle(run); if (!b) { run.node = null; show('shop'); renderShop(); return flash('前台至少要放 1 隻'); }
    battle = b; bst = newStats(); V.reset(); ai = null; ui.aim = null; hideBInfo(); show('battle'); V.resize(); save();
    if (run.enemy.boss) { V.banner = { txt: '首領：' + run.enemy.name, life: 1.6 }; FA.sound.play('boss'); }
    else if (run.enemy.reward) V.banner = { txt: '次元撲滿會逃跑！每掉 1/4 血 +' + (RD.piggy.goldPerQuarter || 1) + ' 金', life: 1.6 };
    else if (run.node === 'encounter') V.banner = { txt: '遭遇・' + RD.encounter[run.encLv].name, life: 1.2 };
  }
  function flash(t) { $('info').innerHTML = `<b style="color:#f88">${t}</b>`; }

  // ---------- 戰鬥 ----------
  const cv = $('cv'); V.init(cv);
  const ptr = e => V.toWorld(e.clientX, e.clientY);
  let tap = null, binfoT = 0;
  cv.addEventListener('pointerdown', e => {
    if (paused || !battle || tutOn) return;
    const w = ptr(e);
    if (battle.phase === 'moving' && battle.turn === 0 && FA.battle.canTap(battle)) { if (FA.battle.tap(battle, w.x, w.y)) { vib(18); return; } } // ---- 二次操作 ----：飛行中點畫面
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), body: bodyAt(w) };
    if (!tap.body) hideBInfo();
    if (battle.phase === 'aim' && battle.turn === 1 && !tap.body) { if (!ai) ai = { t: 0, c: null }; ai.ff = true; } // 敵方瞄準：點空白快轉
    if (battle.phase !== 'aim' || battle.turn !== 0) return;
    let best = null, bd = 1e9;
    battle.bodies.forEach(o => { if (o.alive && !o.temp && o.team === 0 && FA.battle.avail(battle, 0).includes(o)) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < o.r + 22 && d < bd) { bd = d; best = o; } } });
    if (best) { drag = best.i; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (drag == null) return;
    const w = ptr(e), o = battle.bodies[drag], vx = o.x - w.x, vy = o.y - w.y, len = Math.hypot(vx, vy);
    const was = ui.aim && ui.aim.power >= C.fullPowerAt;
    ui.aim = len < 12 ? null : { idx: drag, angle: Math.atan2(vy, vx), power: Math.min(1, len / 140) };
    if (ui.aim && ui.aim.power >= C.fullPowerAt && !was) vib(20);
  });
  // 短按＝看資訊（不彈射）；拖曳＝彈射
  const up = e => {
    const tp = tap; tap = null;
    const isTap = tp && Math.hypot(e.clientX - tp.x, e.clientY - tp.y) < 12 && performance.now() - tp.t < 500;
    if (drag != null) {
      if (!isTap && ui.aim && ui.aim.power > 0.1) { const bo = battle.bodies[ui.aim.idx], useUlt = !!ui.ultArmed && bo && bo.energy >= UC.max; FA.battle.launch(battle, ui.aim.idx, ui.aim.angle, ui.aim.power, useUlt); if (useUlt) ui.ultArmed = false; hideBInfo(); }
      ui.aim = null; drag = null;
    }
    if (isTap && tp.body && battle) showBInfo(tp.body);
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { ui.aim = null; drag = null; tap = null; });
  function bodyAt(w) {
    let best = null, bd = 1e9;
    battle.bodies.forEach(o => { if (o.alive && !o.temp) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < o.r + 14 && d < bd) { bd = d; best = o; } } });
    return best;
  }
  function showBInfo(o) {
    const U = D.units[o.id], B = o.boss ? (mode === 'duel' ? null : RUN.bossInfo(run)) : null;
    let h = `<b style="color:${o.team === 0 ? '#5cf' : '#f77'}">${o.team === 0 ? '我方' : '敵方'}・${o.name}${o.star > 1 ? ' ' + '★'.repeat(o.star) : ''}</b>　❤ ${Math.ceil(o.hp)}/${Math.round(o.maxHp)}　⚔ ${Math.round(o.atk)}${o.shield > 0 ? `　🛡 ${Math.round(o.shield)}` : ''}<br>`;
    const st = [];
    if (o.stunned) st.push('<span style="color:#8df">❄ 冰凍：這回合不能彈射</span>');
    if (o.poison) st.push(`<span style="color:#9ccc65">☠ 中毒：每回合 ${Math.round(o.poison.dmg)} 傷害，剩 ${o.poison.turns} 回合</span>`);
    if (o.fear) st.push(`<span style="color:#b388ff">😱 恐懼：下一發力道 -${pct(o.fear)}</span>`);
    if (o.veil) st.push('<span style="color:#d1c4e9">👻 隱身：下次被撞閃避</span>');
    if (st.length) h += st.join('　') + '<br>';
    if (U && U.ability && U.role !== 'back') h += `<span class="k">能力：</span>${U.ability.desc}<br>`;
    if (o.ultType) h += ultLine(o.ultType, o.energy || 0);
    if (U && U.traits.length) h += `<span class="k">羈絆：</span>${U.traits.map(t => D.traits[t].name).join('・')}　速度 ${U.speed}｜重量 ${U.mass}<br>`;
    if (B) h += `<span class="k">首領：</span>${B.rules.map(r => D.enemies.ruleText[r]).join('、')}${B.split ? '、半血分裂' : ''}${B.zap ? '、每回合電擊' : ''}<br>`;
    if (o.weapon && D.weapons[o.weapon]) h += weaponText(o.weapon);
    if (o.aff && o.aff.q && battle.affix) h += `<span style="color:#fb8">🦶 沉重腳步：下一發力道上限 ${pct(1 - battle.affix.hitSlow)}</span><br>`; // ---- 敵人詞綴 ----
    $('uxBinfo').innerHTML = h; $('uxBinfo').classList.remove('hidden'); binfoT = 4;
  }
  function hideBInfo() { $('uxBinfo').classList.add('hidden'); binfoT = 0; }

  let hudHTML = '';
  function hud() {
    const b = battle, hp = t => Math.round(FA.battle.hpSum(b, t));
    if (mode === 'guide') { $('bhud').innerHTML = '<div class="ux-hl">🎯 練習關｜把木樁全部撞倒</div>' + movesHUD(b); $('bUlt').classList.add('hidden'); ui.msg = ''; return; } // 練習關的說明在下方提示列（coach）
    if (mode === 'duel') run.enemy = { name: '對戰：' + duelName };
    const env = run.env && mode !== 'duel' ? '🌐' + RD.envs[run.env].name : '';
    let hh = `<div class="ux-hl">位面${run.plane}｜${run.enemy.name}${b.rules.length ? '｜' + b.rules.map(r => D.enemies.ruleText[r]).join('、') : ''}　${env}</div>` + movesHUD(b);
    if (b.affix && mode !== 'duel') hh += `<div style="color:#f8a;font-size:12px">☠ ${b.affix.ids.map(id => D.enemies.affixes[id].name).join('・')}</div>`; // ---- 敵人詞綴 ----
    if (hh !== hudHTML) { hudHTML = hh; $('bhud').innerHTML = hh; } // 每幀都會呼叫：內容沒變就不重設（省 DOM 解析與重排）
    const ready = b.phase === 'aim' && b.turn === 0 && FA.battle.avail(b, 0).some(o => o.energy >= UC.max);
    if (!ready) ui.ultArmed = false;
    ui.msg = run.enemy && run.enemy.reward && b.phase !== 'over' ? `打破撲滿！剩 ${Math.max(0, b.moves[0])} 動` : b.phase === 'over' ? (b.winner === 0 ? '勝利！' : '落敗…')
      : b.phase === 'moving' && b.turn === 0 && FA.battle.canTap(b) ? FA.view.tapHint(b)
      : b.phase === 'aim' ? (b.turn === 0 ? (ui.ultArmed ? '⚡ 拉射發光的棋子放大招（再按大招取消）' : '你的回合：按住棋子往後拉') : ai && (ai.job || ai.preview) ? '敵方思考中…' : '敵方瞄準中…（點空白快轉）') : '';
    const bu = $('bUlt'); bu.classList.toggle('hidden', !ready); bu.classList.toggle('on', !!ui.ultArmed);
    const uh = ui.ultArmed ? '⚡ 大招待命<small>彈發光的棋子・再按取消</small>' : '⚡ 大招<small>能量滿的棋子會發光</small>';
    if (bu.innerHTML !== uh) bu.innerHTML = uh;
    ui.msgCol = b.turn === 0 ? '#ffe066' : '#f99';
    FA.sound.edge('turn', b.phase === 'aim' && b.turn === 0 && !tutOn && !paused);
  }

  // 動數條：我方藍、敵方紅（剩餘/總數）＋第幾輪、本輪我方還沒動幾隻
  function movesHUD(b) {
    const bar = (t, col, lbl) => {
      const mx = b.movesMax[t] || 0, n = Math.max(0, b.moves[t]);
      if (!mx) return `<div class="ux-mv"><span class="l">${lbl}</span><span class="ux-mvb"></span><span class="n">—</span></div>`;
      return `<div class="ux-mv${b.turn === t && b.phase !== 'over' ? ' cur' : ''}"><span class="l" style="color:${col}">${lbl}</span><span class="ux-mvb"><i style="width:${Math.round(n / mx * 100)}%;background:${col}"></i></span><span class="n">${n}/${mx}</span></div>`;
    };
    const left = FA.battle.avail(b, 0).length;
    return `<div class="ux-mvs">${bar(0, '#4ea0ff', '我方')}${bar(1, '#ff5a5a', '敵方')}</div>` +
      `<div class="ux-rd">第 ${b.round} 輪・本輪我方未動 <b>${left}</b> 隻${b.deaths && b.deaths[0] ? `・我方被打倒 ${b.deaths[0]}` : ''}</div>`;
  }
  function enemyThink(dt) {
    if (!ai || (ai.battle && (ai.battle !== battle || ai.shot !== battle.shotCount))) ai = { t: 0, c: null };
    ai.battle = battle; ai.shot = battle.shotCount;
    ai.t += dt; if (QF) ai.ff = true;
    if (ai.ff && ai.t < 0.45) ai.t = 0.45;
    if (ai.t >= 0.45 && !ai.c) {
      if (!ai.job) {
        const st = mode === 'duel' ? 15 : run.stage + 1 + (run.node === 'encounter' ? RD.encounter[run.encLv].add : 0);
        ai.job = FA.ai.chooseAsync(battle, 1, D.enemies.difficulty(st), battle.rng);
      }
      if (!ai.job.step()) return;
      ai.c = ai.job.result; ai.job = null;
      if (!ai.c) { ai = null; return; }
      if (!ai.ff) {
        const { idx, angle, power } = ai.c;
        ai.preview = FA.ai.predictAsync(battle, idx, angle, power);
        return; // 下一幀才開始算路線，選招與預覽不共用這一幀的額外時間。
      }
    }
    if (ai.preview && !ai.ff) {
      if (!ai.preview.step()) return;
      const { idx, angle, power } = ai.c;
      ui.pred = ai.preview.result;
      ui.predKey = angle.toFixed(3) + '|' + power.toFixed(3) + '|' + idx;
      ui.aim = ui.pred ? { idx, angle, power, enemy: true } : null;
      ai.preview = null;
    }
    if (ai.c && (ai.t > 1.25 || ai.ff)) { FA.battle.launch(battle, ai.c.idx, ai.c.angle, ai.c.power, ai.c.ult, ai.c.tap); ui.aim = null; ai = null; }
  }

  function afterShot() {
    if (mode === 'guide') guideShots++;
    save();
    if (battle.phase !== 'over') return;
    const b = battle;
    if (mode === 'guide') return guideOver(b);
    setTimeout(() => {
      FA.sound.music(b.winner === 0 ? 'win' : 'lose'); hideBInfo(); // 勝負短音效由 render.js 的 over 事件播
      const stats = movesRes(b) + statsHTML(); bst = null;
      if (mode === 'duel') { battle = null; mode = 'run'; save(); modal(`<div class="res-grid"><div class="res-l"><h2 class="res-h ${b.winner === 0 ? 'win' : 'lose'}">${b.winner === 0 ? '🎉 你贏了' : '💥 你輸了'}</h2><div class="ux-res">對手：${duelName}</div><div class="lbl">${endReason(b)}</div></div><div class="res-r">${stats}</div></div>`, [{ t: '回商店', cls: 'go', f: () => { show('shop'); renderShop(); } }], 'res'); return tutResult(); }
      const res = RUN.endBattle(run, b); battle = null; save();
      const loot = res.drops.map(itemText).concat(res.weapons.map(weaponText)).concat((res.cons || []).map(k => CS[k] ? CS[k].icon + CS[k].name : '')); // ---- 道具 ----
      const gold = `<div class="ux-res">💰 收入 ${res.income}＋利息 ${res.interest}${res.streakBonus ? `＋連${run.streak > 0 ? '勝' : '敗'} ${res.streakBonus}` : ''}${res.gold ? `＋戰利 ${res.gold}` : ''}　→ 共 ${run.gold} 金</div>`;
      // 結算（橫向兩欄）：左＝勝負、小隊血量、金幣；右＝戰鬥數據、戰利品
      if (res.node === 'reward') modal(`<div class="res-grid"><div class="res-l"><h2 class="res-h win">🐷 撲滿 ${res.pigs} 隻</h2><div class="ux-res big">+${res.gold} 金${res.drops.length ? '<br>全破獎勵：' + res.drops.map(itemText).concat((res.cons || []).map(k => CS[k] ? CS[k].icon + CS[k].name : '')).join('<br>') : (res.cons || []).length ? '<br>全破獎勵：' + res.cons.map(k => CS[k].icon + CS[k].name).join('、') : ''}</div>${gold}</div><div class="res-r">${stats}</div></div>`, [{ t: '繼續 ▶', cls: 'go', f: flow }], 'res');
      else modal(`<div class="res-grid"><div class="res-l"><h2 class="res-h ${res.win ? 'win' : 'lose'}">${res.win ? '🎉 勝利' : '💥 落敗'}</h2><div class="lbl">${endReason(b)}</div><div class="ux-res big">` +
        (res.win ? `❤ 小隊 ${res.heal ? '+' + res.heal : '±0'}（${run.hp}）` : `<b style="color:#ff8a7a">❤ 小隊 -${res.dmg}（剩 ${run.hp}）</b><br><span class="lbl">${lossText(b, res)}</span>`) + '</div>' +
        (res.saved ? '<b style="color:#ffe066">🛡 鎖血免死觸發！剩 1 血</b><br>' : '') + (res.retry ? '<b style="color:#ffb74d">👑 終局首領還在！整頓後再挑戰</b><br>' : '') + (res.flawless ? '<b style="color:#f8a5c2">🐷 完勝！招財豬加碼</b><br>' : '') + gold + '</div><div class="res-r">' + stats +
        (loot.length ? '<div class="ux-res">🎁 獲得：<br>' + loot.join('<br>') + '</div>' : '') + '</div></div>',
        [{ t: '繼續 ▶', cls: 'go', f: flow }], 'res');
      tutResult();
    }, 900 / (FA.settings.speed > 1 ? 2 : 1));
  }

  // 結算：雙方剩餘動數、我方被打倒次數、勝負原因、落敗扣血說明
  const bossDown = b => b.bodies.some(o => o.boss && o.team === 1 && !o.alive);
  function endReason(b) {
    if (b.winner === 0) return bossDown(b) ? '👑 擊倒首領，直接獲勝' : '敵方動數先歸零';
    return Math.max(0, b.moves[0]) <= 0 ? '我方動數先歸零' : '我方全部倒下';
  }
  function movesRes(b) {
    if (!b.moves) return '';
    const n = t => Math.max(0, b.moves[t]);
    return `<div class="ux-stats"><div><b style="color:#4ea0ff">${n(0)}/${b.movesMax[0]}</b>我方剩餘動數</div><div><b style="color:#ff5a5a">${b.movesMax[1] ? n(1) + '/' + b.movesMax[1] : '—'}</b>敵方剩餘動數</div></div>` +
      `<div class="lbl">我方被打倒 ${(b.deaths || [0])[0]} 次（每次 -${C.deathCost} 動）・敵方被打倒 ${(b.deaths || [0, 0])[1]} 次</div>`;
  }
  function lossText(b, res) {
    const L = C.lossDamage, left = b.moves ? Math.ceil(Math.max(0, b.moves[1]) / C.deathCost) : 0;
    return `落敗扣血＝基礎 ${L.base}＋敵方剩 ${Math.max(0, b.moves[1])} 動（每 ${C.deathCost} 動 +${L.perEnemy}，共 +${left * L.perEnemy}）＋關卡加成${res.node === 'boss' ? '＋首領 4' : ''}${RD.ascensions[run.asc || 0].lossAdd ? '＋難度' : ''}`;
  }
  // 戰鬥統計：V.consume 會清空 battle.events，所以每次呼叫前先掃
  const newStats = () => ({ dealt: 0, taken: 0, maxHit: 0, maxShot: 0, shot: 0, shotTeam: 0, kills: 0, lost: 0 });
  function track(b) {
    if (!bst) bst = newStats();
    for (const e of b.events) {
      if (e.t === 'launch') { bst.shot = 0; bst.shotTeam = b.bodies[e.i] ? b.bodies[e.i].team : b.turn; }
      else if (e.t === 'dmg') {
        if (e.team === 1) { bst.dealt += e.amt; bst.maxHit = Math.max(bst.maxHit, e.amt); if (bst.shotTeam === 0) { bst.shot += e.amt; bst.maxShot = Math.max(bst.maxShot, bst.shot); } }
        else bst.taken += e.amt;
      } else if (e.t === 'death') { if (e.team === 1) bst.kills++; else bst.lost++; }
    }
  }
  const consume = b => { track(b); V.consume(b); };
  function statsHTML() {
    const s = bst || newStats(), r = Math.round;
    return `<div class="ux-stats"><div><b>${r(s.maxHit)}</b>最高單擊傷害</div><div><b>${r(s.maxShot)}</b>單發最高總傷</div><div><b>${s.kills}</b>擊倒敵人</div><div><b>${r(s.dealt)}</b>總輸出</div></div>` +
      `<div class="lbl">承受 ${r(s.taken)} 傷害</div>`;
  }
  const speedBtn = () => { const b = $('uxSpeed'); b.textContent = (FA.settings.speed || 1) + 'x'; b.classList.toggle('on', FA.settings.speed > 1); };
  $('uxSpeed').onclick = () => { FA.settings.speed = FA.settings.speed > 1 ? 1 : 2; saveSet(); speedBtn(); };
  speedBtn();

  let last = performance.now(), acc = 0;
  const QF = /[?&]qafast=1/.test(location.search); // 測試用：一發在同一幀算完、敵方 AI 不等待（tests/full_smoke.py）
  function frame(now) {
    const dt0 = Math.min(0.05, (now - last) / 1000); last = now;
    const spd = FA.settings.speed > 1 ? 2 : 1, dt = dt0 * spd; // 加速只加快播放：物理仍是固定步長，結果不變
    if (screen === 'battle' && battle) {
      if (!paused && !tutOn) {
        if (battle.phase === 'moving') {
          if (V.hitstop > 0 && !QF) V.hitstop -= dt;
          else {
            acc += dt; let n = 0;
            if (QF) acc = 1e9;
            while (acc >= C.dt && n++ < (QF ? 20000 : 16 * spd)) {
              acc -= C.dt;
              if (FA.battle.step(battle)) { FA.battle.endShot(battle); acc = 0; consume(battle); afterShot(); break; }
            }
          }
        } else if (battle.phase === 'aim' && battle.turn === 1) enemyThink(dt);
        if (battle) { consume(battle); V.update(dt); }
        if (binfoT > 0 && (binfoT -= dt0) <= 0) hideBInfo();
      }
      if (battle) { hud(); V.draw(battle, ui, paused || tutOn ? 0 : dt); tutTick(); }
    }
    if (screen !== 'battle' || !battle) { ai = null; coach(null); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 暫停／切出 ----------
  function pause() {
    if (screen !== 'battle' || paused) return;
    paused = true; ui.aim = null; drag = null; save();
    modal('<h2>⏸ 暫停</h2>', [{ t: '繼續', cls: 'go', f: () => { paused = false; last = performance.now(); } }, { t: `音效：${FA.sound.on ? '開' : '關'}`, f: () => { FA.sound.toggle(); setBtns(); paused = false; pause(); } }, { t: `音樂：${FA.sound.musicOn ? '開' : '關'}`, f: () => { FA.sound.toggleMusic(); setBtns(); paused = false; pause(); } },
      { t: `震動：${FA.settings.vibrate ? '開' : '關'}`, f: () => { toggleVib(); paused = false; pause(); } }, { t: `播放速度：${FA.settings.speed > 1 ? '2x' : '1x'}`, f: () => { $('uxSpeed').click(); paused = false; pause(); } },
      { t: '回標題（進度已存）', f: () => { paused = false; toTitle(); } }]);
  }
  $('bPause').onclick = pause;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); pause(); } });
  addEventListener('pagehide', save);

  // ---- 敵人詞綴 ----
  const affixCard = id => { const X = D.enemies.affixes[id]; return `<div class="choice m-affix"><span class="tier" style="color:${X.tier === 'hard' ? '#ff6b6b' : '#ffb74d'}">${X.tier === 'hard' ? '兇猛' : '溫和'}</span><b>☠ ${X.name}</b><br>${X.desc}</div>`; };
  function affixChips() {
    if (!run || !run.affixes || !run.affixes.length) return '';
    return '<br>' + run.affixes.map(id => `<span class="st-chip" style="border-color:#f77;color:#f99" data-af="${id}">☠${D.enemies.affixes[id].name}</span>`).join('');
  }
  // 本局詞綴卡片：intro=第一次進商店（確定後不再自動跳）；也可點詞綴 chip 查看
  function affixModal(intro) {
    const canRe = run.affixRerolls > 0 && run.stage === 0;
    const btns = [];
    if (canRe) btns.push({ t: `🎲 重骰（剩 ${run.affixRerolls} 次）`, f: () => { RUN.rerollAffixes(run); save(); renderShop(); affixModal(intro); } });
    btns.push({ t: intro ? '確定' : '關閉', cls: 'go', f: () => { if (intro) { run.affixSeen = true; save(); flow(); } } });
    modal(`<h2>☠ 本局敵人詞綴</h2><div class="lbl">難度 ${RD.ascensions[run.asc || 0].name}・整局生效${canRe ? '・第一場戰鬥前可免費重骰 1 次' : ''}</div><div class="choices">${run.affixes.map(affixCard).join('')}</div>`, btns);
  }
  function affixIntro() {
    if (!run || run.affixSeen !== false || !run.affixes || !run.affixes.length) return false;
    show('shop'); renderShop(); affixModal(true); return true;
  }
  $('enemyInfo').addEventListener('click', e => { if (e.target.closest('[data-af]') && run) affixModal(false); });

  // ---------- 圖鑑 ----------
  const CODEX = {
    角色: () => Object.keys(D.units).sort((a, b) => D.units[a].cost - D.units[b].cost).map(id => `<div class="choice cx-u">${icon(id, 1, 52) ? `<img src="${icon(id, 1, 52)}" alt="">` : ''}<div>${unitInfo({ id, star: 1, items: [], weapon: null })}</div></div>`).join(''),
    羈絆: () => Object.values(D.traits).map(T => `<div class="choice"><b style="color:${T.color}">${tIc(Object.keys(D.traits).find(x => D.traits[x] === T))} ${T.name}</b>：${Object.keys(D.units).filter(k => D.units[k].traits.includes(Object.keys(D.traits).find(x => D.traits[x] === T))).map(k => D.units[k].name).join('、')}<br>` + T.tiers.map(tierLine).join('<br>') + counterLine(T) + '</div>').join(''),
    陣營: () => '<div class="lbl">第二條羈絆軸：每隻角色屬於 1 個陣營，湊 3／5 隻給經濟或規則加成</div>' + Object.keys(FAC).map(k => `<div class="choice">${facInfo(k)}</div>`).join(''),
    徽章: () => '<div class="lbl">徽章佔 1 格裝備：穿上的角色多 1 個該羈絆（羈絆計數 +1，原本就有的不重複算）。取得：補給、遭遇難度 3+、白銀策略「買彩票」</div>' + Object.keys(D.emblems).map(k => `<div class="choice">${itemText({ id: k, rolls: Object.fromEntries(Object.entries(D.emblems[k].affix).map(([m, v]) => [m, v[0]])) })}</div>`).join(''),
    裝備: () => Object.values(D.items).filter(I => I.tier !== 'emblem').map(I => `<div class="choice"><b>${I.icon}${I.name}</b>${I.recipe ? `（${I.recipe.map(x => D.items[x].name).join('＋')}）` : '（基礎）'}<br>${Object.entries(I.affix).map(([k, v]) => D.modText[k] ? D.modText[k](v[0]) + (v[0] !== v[1] ? '～' + D.modText[k](v[1]).replace(/^[^\d+-]*/, '') : '') : '').join('、')}</div>`).join(''),
    武器: () => Object.keys(D.weapons).map(id => `<div class="choice">${weaponText(id)}</div>`).join(''),
    策略: () => ['silver', 'gold', 'prism'].map(t => Object.values(RD.strategies).filter(S => S.tier === t).map(S => `<div class="choice m-${t}"><span class="tier" style="color:${RD.tiers[t].color}">${RD.tiers[t].name}</span><b>${S.name}</b><br>${S.desc}</div>`).join('')).join(''),
    環境: () => '<div class="lbl">投資環境：開局選一次，整局都生效</div>' + Object.values(RD.envs).map(E => `<div class="choice"><b>🌐${E.name}</b><br>${E.desc}</div>`).join('') + '<h3>開局詞綴</h3>' + Object.values(RD.openers).map(E => `<div class="choice"><b>${E.name}</b><br>${E.desc}</div>`).join(''),
    節點: () => `<div class="choice"><b>⚔ 戰鬥規則</b><br>・直式場地，雙方輪流：每場隨機決定先手，一輪內交替出手，每隻都動過一次才換下一輪<br>・雙方各 ${C.movesEach} 動（首領戰 ${C.movesEach + C.bossMovesAdd}），每彈一次 -1<br>・被打倒在出生點滿血復活，但該方動數再 -${C.deathCost}<br>・<b>對方動數先歸零就贏</b>；擊倒首領直接獲勝<br>・🛟泳圈柱：加速且本發攻擊 +20%；🌵尖刺柱：撞到受傷<br>・⚡大招：${ultCharge}（見「大招」分頁）<br>・落敗扣小隊血：基礎 ${C.lossDamage.base}＋敵方每剩 ${C.deathCost} 動 +${C.lossDamage.perEnemy}＋關卡加成（首領 +4）</div>` + Object.values(RD.nodeInfo).map(N => `<div class="choice"><b>${N.icon} ${N.name}</b><br>${N.desc}</div>`).join('') + '<div class="lbl">投資策略：開局 1 次、位面 1、2 首領後各 1 次，部分策略會延後再給（期貨）。黃金讓敵人 +6%、稜彩 +20% 且多 1 隻。</div>' +
      '<h3>補給內容</h3>' + Object.values(RD.supplies).map(E => `<div class="choice"><b>${E.name}</b>：${E.desc}</div>`).join(''),
    詞綴: () => '<div class="lbl">敵人詞綴：A2 起開局依難度抽（A2 1 個溫和、A3 1、A4 2、A5 3），整局生效，第一場戰鬥前可免費重骰 1 次</div>' + Object.keys(D.enemies.affixes).map(affixCard).join(''), // ---- 敵人詞綴 ----
    首領: () => D.enemies.bosses.map((L, i) => L.map(B => `<div class="choice"><b>位面${i + 1}：${B.name}</b><br>生命 ${B.hp}｜攻擊 ${B.atk}<br>${B.rules.map(r => D.enemies.ruleText[r]).join('、')}${B.split ? '、半血分裂' : ''}${B.ability ? '、' + ({ magnetStop: '停下吸附', freezeHit: '撞到冰凍', poisonHit: '撞到下毒', chainHit: '連鎖閃電' }[B.ability.type] || '') : ''}${B.zap ? '、每回合電擊' : ''}</div>`).join('')).join('')
  };
  CODEX.大招 = () => `<div class="lbl">能量：${ultCharge}。能量滿的棋子會發光，按「⚡大招」再彈它發動；再按一次取消。大招依角色第一個羈絆決定（少數角色專屬）。</div>` +
    Object.keys(D.ults || {}).map(k => { const X = D.ults[k], tr = Object.keys(D.traitUlt || {}).filter(t => D.traitUlt[t] === k).map(t => D.traits[t].name), us = Object.keys(D.units).filter(id => D.units[id].role !== 'back' && !D.units[id].noShop && ultKey(id) === k).map(id => D.units[id].name);
      return `<div class="choice"><b>⚡ ${X.name}</b>${tr.length ? `<span class="tier">${tr.join('・')}羈絆</span>` : '<span class="tier">專屬</span>'}<br>${X.desc}${us.length ? `<br><span class="lbl">角色：${us.join('、')}</span>` : ''}</div>`; }).join('');
  CODEX.道具 = () => Object.values(CS).map(X => `<div class="choice"><b>${X.icon}${X.name}</b>${X.reusable ? '（可重複使用）' : ''}<br>${X.desc}</div>`).join('') + '<div class="lbl">取得：補給、遭遇、撲滿全破、首領、戰鬥掉落；開局送扳手（A0–A2 精密、A3 起普通）；第二位面開頭送冶金爐</div>'; // ---- 道具 ----
  function codex(tab) {
    tab = tab || '角色';
    $('modalBox').className = 'box codex';
    $('modalBox').innerHTML = `<h2>📖 圖鑑</h2><div class="traits">${Object.keys(CODEX).map(k => `<span class="tr ${k === tab ? 'act' : ''}" style="${k === tab ? 'background:#ffc531' : ''}" data-tab="${k}">${k}</span>`).join('')}</div><div class="choices">${CODEX[tab]()}</div><button data-close="1">關閉</button>`;
    $('modal').classList.remove('hidden'); $('modalBox').scrollTop = 0;
    $('modalBox').onclick = e => { if (e.target.dataset.tab) codex(e.target.dataset.tab); else if (e.target.dataset.close) $('modal').classList.add('hidden'); };
  }

  // ---------- 新手教學：分階段、用到才跳出（fa_tut 記已看過的章節；「跳過教學」全部關掉；標題「📘 教學」可挑章節重看、重置、重玩練習關）----------
  const TUT_KEY = 'fa_tut';
  let tutSeen = (() => { try { return JSON.parse(localStorage.getItem(TUT_KEY)) || {}; } catch (e) { return {}; } })(), tutOn = false;
  const tutQ = [];
  const saveTut = () => { try { localStorage.setItem(TUT_KEY, JSON.stringify(tutSeen)); } catch (e) { } };
  // 戰場座標 → 螢幕座標（由 V.toWorld 反推）
  const scrOf = o => { const q = V.toScreen(o.x, o.y); return { x: q.x, y: q.y, r: o.r * V.scale() }; }; // 橫向時場地轉 90°，用 render.js 的換算
  const rectOf = o => { if (!o) return null; const p = scrOf(o), r = p.r + 12; return { left: p.x - r, top: p.y - r, width: r * 2, height: r * 2 }; };
  const myBody = pred => battle && battle.bodies.find(x => x.alive && !x.temp && x.team === 0 && (!pred || pred(x)));
  const bodyRect = () => rectOf(myBody(x => !x.stunned));
  const abOf = pred => () => rectOf(myBody(x => x.ab && pred(x.ab)));
  const abUnit = pred => { const o = myBody(x => x.ab && pred(x.ab)); return o ? o : null; };
  const LG = D.league || {};
  const TUT = {
    intro: { n: '開始', s: [{ t: '<b>彈射自走棋</b>：在商店組隊，到戰場把棋子彈出去撞敵人。<br>提示只在第一次用到時出現，隨時可跳過；標題「📘 教學」可重看。' }] },
    env: { n: '投資環境與策略', s: [{ pos: 'top', t: '開局連選 3 次：<b>開局詞綴</b>（起手資源）→ <b>投資環境</b>（整局規則）→ <b>投資策略</b>。<br>策略分白銀、黃金、稜彩：越強，之後的敵人也越強。點卡片就選定。' }] },
    shop: { n: '商店：買賣', s: [{ el: '#shopRow', t: '<b>買角色</b>：點卡片買，或直接拖到格子上。<b>長按</b>看詳細。' },
      { el: '#front', t: '<b>前台</b>：上場彈射的棋子，至少放 1 隻。' },
      { el: '#back', t: '<b>後台</b>：不上場，每回合給前台加成（加攻、護盾、電擊…）。' },
      { el: '#bench', t: '<b>備戰區</b>：買來先放這。按住角色拖曳時，左下和右下會出現「出售」區，拖過去就賣。' },
      { el: '#bFight', t: '佈好陣按右下<b>出發</b>，選下一個節點。' }] },
    star: { n: '升星', s: [{ el: () => { const e = document.querySelector('#shopRow .ux-own.up'); return e && e.closest('.card'); }, t: '<b>升星</b>：3 隻同角色同星會自動合成 ★★，數值大漲。<br>這張再買 1 隻就升星。' }] },
    traits: { n: '羈絆', s: [{ el: '#traits', t: '<b>羈絆</b>：前台＋後台湊到 2 隻以上同羈絆的不同角色就啟動（標 ✓）。湊越多越強，點羈絆看每階加成。' }] },
    path: { n: '節點類型', s: [{ pos: 'top', t: '<b>選路線</b>：⚔ 戰鬥、❗ 遭遇（自選難度換獎勵）、🐷 撲滿（打錢）、📦 補給、👑 首領。<br>上方地圖是這個位面走到哪。' }] },
    battle: { n: '彈射與瞄準', s: [{ el: bodyRect, t: '按住自己的棋子（藍圈），往<b>反方向</b>拉，放開就彈出去。' },
      { el: bodyRect, t: '拉越長越大力，<b>95% 以上＝全力</b>（速度 +15%）。<br><b>虛線</b>是預演路線（含反彈），<b>白線</b>是被撞棋子的去向。' }] },
    moves: { n: '動數與復活', s: [{ el: '#bhud', t: `<b>動數</b>：雙方各 ${C.movesEach} 動（首領戰 ${C.movesEach + C.bossMovesAdd}），每彈 -1。<b>對方先歸零就贏</b>；擊倒首領直接贏。` },
      { el: '#bhud', t: `<b>被打倒</b>會在出生點滿血復活，但該方動數 <b>-${C.deathCost}</b>。打倒敵人＝削它的動數。` }] },
    turns: { n: '先手與輪流', s: () => [{ el: '#bhud', t: '<b>輪流</b>：每場隨機決定先手，雙方交替各彈 1 隻；每隻都動過才進下一輪。<br>敵方瞄準時點空白處可快轉。' }]
      .concat(tutSeen.moves ? [] : (tutSeen.moves = 1, saveTut(), TUT.moves.s))
      .concat([{ el: '#cv', t: '🛟 <b>泳圈柱</b>：撞到加速、攻擊 +20%。🌵 <b>尖刺柱</b>：撞到受傷（敵我都會）。' },
        { el: '#uxSpeed', t: '切 1x／2x 播放速度。<b>短按</b>任何棋子看能力、血量、狀態。' }]) },
    down: { n: '被打倒', s: [{ el: '#bhud', t: `有棋子被打倒了：它會在出生點滿血復活，但那一方動數 <b>-${C.deathCost}</b>。自己別亂送。` }] },
    ult: { n: '大招 ⚡', s: [{ el: '#bUlt', t: `<b>⚡大招</b>：能量滿的棋子會發光。先按「⚡大招」，再拉射發光的棋子；再按一次取消。<br><span class="lbl">${ultCharge}</span>` }] },
    sweet: { n: '甜蜜點 🎯', s: () => { const o = abUnit(a => a.type === 'sweetSpot'), a = o ? o.ab : { lo: 0.6, hi: 0.7 };
      return [{ el: abOf(a => a.type === 'sweetSpot'), t: `<b>🎯 甜蜜點</b>：${o ? o.name : '拉弓手'}的力道停在 <b>${pct(a.lo)}～${pct(a.hi)}</b> 最強，不是越大力越好。力道條上的綠色區塊就是甜蜜點。` }]; } },
    tap: { n: '飛行中點擊 👆', s: () => { const o = abUnit(a => !!a.tap), k = o && o.ab.tap;
      return [{ el: abOf(a => !!a.tap), t: `<b>👆 飛行中點擊</b>：${o ? o.name : '這類角色'}彈出去後，飛行途中點畫面${k === 'split' ? '，會朝你點的位置分出幻影' : k === 'boom' ? '任一處就當場引爆' : '可以觸發能力'}。<br>畫面下方出現「👆」提示時點。` }]; } },
    result: { n: '結算', s: [{ el: '#modalBox', t: '<b>結算</b>：贏了回血，輸了依敵方剩餘動數扣小隊血。金幣＝收入＋利息＋連勝敗。按「繼續」。' }] },
    net: { n: '連線對戰', s: [{ el: '#netBox', t: '<b>連線對戰</b>：一人按「建立房間」拿到 4 碼房號，另一人輸入房號加入，兩人都按「準備」就開打。<br>出戰的是你單人局目前的隊伍；每發限時 30 秒，沒出手由 AI 代打。' }] },
    lg: { n: '連線自走棋', s: [{ el: '#lgBox', t: `<b>連線自走棋</b>：${LG.minPlayers || 2}～${LG.maxPlayers || 4} 人各自經營商店，${LG.shopSec || 45} 秒後兩兩對戰（人數單數時有人打幽靈）。<br>輸了扣血，歸零淘汰；${LG.maxRounds || 15} 回合後依血量排名。` }] }
  };
  function tutor(key, force, after) {
    const T = TUT[key]; if (!T) return false;
    if (!force && (tutSeen.skip || tutSeen[key])) return false;
    if (tutOn) { if (!force && !tutQ.includes(key)) tutQ.push(key); return true; }
    if (!force) { tutSeen[key] = 1; saveTut(); }
    const steps = typeof T.s === 'function' ? T.s() : T.s;
    tutOn = true; ui.aim = null; drag = null; coach(null);
    let k = 0;
    const box = $('uxBubble'), ring = $('uxRing'), wrap = $('uxTut');
    const end = () => { tutOn = false; wrap.classList.add('hidden'); last = performance.now(); const nx = tutQ.shift(); if (nx) setTimeout(() => tutor(nx), 80); else if (after) after(); };
    const stepK = () => {
      const st = steps[k], el = typeof st.el === 'function' ? st.el() : st.el ? document.querySelector(st.el) : null;
      const r0 = el ? (el.getBoundingClientRect ? el.getBoundingClientRect() : el) : null, r = r0 && r0.width && st.pos !== 'top' ? r0 : null, H = innerHeight;
      if (r) Object.assign(ring.style, { display: 'block', left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      else ring.style.display = 'none';
      wrap.classList.toggle('dim', !r);
      box.innerHTML = `<div class="n">📘 ${T.n}${steps.length > 1 ? `　${k + 1}/${steps.length}` : ''}</div><div class="tx">${st.t}</div><div class="bt"><button id="uxTutSkip">${force ? '關閉' : '跳過教學'}</button><button id="uxTutNext" class="go">${k === steps.length - 1 ? '知道了' : '下一步'}</button></div>`;
      const below = r && (r.top + r.height / 2) < H / 2, room = r && !below && r.top < 200; // 目標在上半：泡泡放下方；下半：放上方，上方放不下就貼底
      box.style.top = st.pos === 'top' ? 'calc(env(safe-area-inset-top) + 12px)' : below ? Math.min(H - 200, r.top + r.height + 14) + 'px' : '';
      box.style.bottom = st.pos === 'top' || below ? '' : (room ? 12 : r ? H - r.top + 14 : H / 2 - 80) + 'px';
      $('uxTutNext').onclick = () => { if (++k >= steps.length) end(); else stepK(); };
      $('uxTutSkip').onclick = () => { if (!force) { tutSeen.skip = 1; saveTut(); tutQ.length = 0; } end(); };
      $('uxTutNext').focus({ preventScroll: true });
    };
    wrap.classList.remove('hidden'); stepK();
    return true;
  }
  const tutShop = () => { if (screen === 'shop' && $('modal').classList.contains('hidden')) tutor('shop'); };
  const tutResult = () => tutor('result');
  const tutPending = type => { if ($('modal').classList.contains('hidden')) return; if (type === 'opener' || type === 'env' || type === 'strategy') tutor('env'); else if (type === 'path') tutor('path'); };
  // 商店情境提示：第一次快升星、第一次羈絆啟動
  (function () { const base = renderShop; renderShop = function () { base(); if (run && !tutSeen.skip) setTimeout(tutShopCtx, 0); }; })();
  function tutShopCtx() {
    if (screen !== 'shop' || tutOn || pd || !tutSeen.shop || !$('modal').classList.contains('hidden')) return;
    if (!tutSeen.star && document.querySelector('#shopRow .ux-own.up')) return tutor('star');
    if (!tutSeen.traits && document.querySelector('#traits .tr.act')) tutor('traits');
  }
  // 戰鬥情境提示（每幀檢查，輪到我方瞄準時才跳）：有人被打倒、大招第一次能用、隊上第一次有甜蜜點／飛行中點擊角色
  let tutAimBattle = null, tutAimShot = -1;
  function tutTick() {
    if (mode === 'guide') return guideTick();
    coach(null);
    if (tutOn || paused || tutSeen.skip || !battle || battle.phase !== 'aim' || battle.turn !== 0 || drag != null || !$('modal').classList.contains('hidden')) return;
    // 每發結束才增加 shotCount，關掉泡泡後可以先完成這次瞄準。
    const shot = battle.shotCount || 0;
    if (tutAimBattle === battle && tutAimShot === shot) return;
    let key;
    if (mode === 'run' && !tutSeen.battle) key = 'battle';
    else if (mode === 'run' && !tutSeen.turns) key = 'turns';
    else if (!tutSeen.down && battle.deaths && battle.deaths[0] + battle.deaths[1] > 0) key = 'down';
    else if (!tutSeen.ult && !$('bUlt').classList.contains('hidden')) key = 'ult';
    else if (!tutSeen.sweet && abUnit(a => a.type === 'sweetSpot')) key = 'sweet';
    else if (!tutSeen.tap && abUnit(a => !!a.tap)) key = 'tap';
    if (key && tutor(key)) { tutAimBattle = battle; tutAimShot = shot; }
  }
  // 連線大廳：第一次進去時說明
  addEventListener('load', () => ['net', 'lg'].forEach(id => { const el = $(id); if (el) new MutationObserver(() => { if (!el.classList.contains('hidden')) setTimeout(() => { if (!el.classList.contains('hidden')) tutor(id); }, 250); }).observe(el, { attributes: true, attributeFilter: ['class'] }); }));

  // ---- 練習關 ----：第一場戰鬥前（或從教學選單）打 2 個不會動的木樁，手指示範拉射；不影響進度、不存檔
  const GUIDE = { me: ['ironball', 'curler'], foe: ['shield', 'shield'], hp: 0.3 };
  let guideNext = null, guideShots = 0, coachEl = null, coachKey = '';
  const guideWanted = () => !tutSeen.skip && !tutSeen.guide && mode !== 'guide';
  function guideOffer(next) {
    tutSeen.guide = 1; saveTut();
    modal('<h2>🎯 練習關</h2>正式開打前，先花 30 秒練習彈射：<br>2 個不會動的木樁，撞倒就過關。<div class="lbl">不影響這局進度</div>',
      [{ t: '開始練習', cls: 'go', f: () => guideStart(next) }, { t: '跳過練習', f: () => next && next() }, { t: '跳過教學（不再提示）', f: () => { tutSeen.skip = 1; saveTut(); next && next(); } }]);
  }
  function guideStart(next) {
    guideNext = next || null; guideShots = 0;
    const mk = (id, i) => ({ id, star: 1, items: [], weapon: null, uid: 'g' + i });
    const b = FA.battle.create({ pFront: GUIDE.me.map(mk), pBack: [], eFront: GUIDE.foe.map(mk), eBack: [], rules: [], env: {}, eNoShots: true, first: 0, seed: 20261127 });
    b.bodies.forEach(o => { if (o.team === 1) { o.maxHp = o.hp = Math.round(o.maxHp * GUIDE.hp); o.atk = 0; } });
    mode = 'guide'; battle = b; bst = newStats(); V.reset(); ai = null; ui.aim = null; hideBInfo(); paused = false; $('modal').classList.add('hidden'); show('battle'); V.resize();
    V.banner = { txt: '🎯 練習關', life: 1.2 };
  }
  function guideTick() {
    const b = battle;
    if (!b || tutOn || paused || b.phase !== 'aim' || b.turn !== 0 || !$('modal').classList.contains('hidden')) return coach(null);
    if (guideShots >= 1 && !tutSeen.moves && !tutSeen.skip) return tutor('moves');
    tutSeen.battle = 1;
    const o = myBody(x => FA.battle.avail(b, 0).includes(x));
    if (drag != null) return coach('拉越長越大力，<b>95% 以上＝全力</b>。<br><b>虛線</b>＝預演路線（含反彈），<b>白線</b>＝被撞棋子的去向。');
    coach(guideShots ? '繼續！把木樁<b>全部撞倒</b>就過關。' : '按住<b>藍圈</b>棋子，往<b>反方向</b>拉，放開就彈出去。', o);
  }
  // 非阻擋的提示列＋手指拉射示範（往離最近敵人的反方向拉）
  function coach(html, o) {
    if (!html) { if (coachEl && !coachEl.classList.contains('hidden')) coachEl.classList.add('hidden'); return; }
    if (!coachEl) { coachEl = document.createElement('div'); coachEl.id = 'uxCoach'; coachEl.innerHTML = '<div class="cb" role="status" aria-live="polite"></div><div class="fg" aria-hidden="true">👆</div>'; document.body.appendChild(coachEl); }
    coachEl.classList.remove('hidden');
    if (coachKey !== html) { coachKey = html; coachEl.firstChild.innerHTML = html; }
    const fg = coachEl.lastChild;
    if (!o) { fg.classList.add('hidden'); return; }
    const p = scrOf(o), foe = battle.bodies.filter(x => x.alive && x.team === 1).sort((a, c) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(c.x - o.x, c.y - o.y))[0];
    let dx = 0, dy = 1; if (foe) { const q = scrOf(foe), d = Math.hypot(p.x - q.x, p.y - q.y) || 1; dx = (p.x - q.x) / d; dy = (p.y - q.y) / d; }
    fg.classList.remove('hidden'); fg.style.left = p.x + 'px'; fg.style.top = p.y + 'px';
    fg.style.setProperty('--dx', Math.round(dx * 90) + 'px'); fg.style.setProperty('--dy', Math.round(dy * 90) + 'px');
  }
  function guideOver(b) {
    const won = b.winner === 0; coach(null);
    setTimeout(() => {
      if (battle !== b) return;
      battle = null; mode = 'run'; bst = null; hideBInfo();
      const next = guideNext; guideNext = null;
      modal(`<h2 class="res-h ${won ? 'win' : 'lose'}">${won ? '🎯 練習完成' : '練習結束'}</h2><p>正式戰鬥敵人也會出手：雙方輪流彈，<b>先把對方動數打光就贏</b>。</p>`,
        [{ t: next ? '開始正式戰鬥' : '回標題', cls: 'go', f: () => next ? next() : toTitle() }]);
    }, 700);
  }
  // 標題「📘 教學」：章節列表（✓＝看過）、練習關、重置
  function tutMenu() {
    $('modalBox').className = 'box';
    $('modalBox').innerHTML = `<h2>📘 教學</h2><div class="lbl">提示平常只在第一次用到時出現。點章節重看。</div><div class="tutlist">${Object.keys(TUT).map(k => `<button data-tk="${k}">${tutSeen[k] ? '✓ ' : ''}${TUT[k].n}</button>`).join('')}</div>` +
      `<button data-tg="1" class="go">🎯 玩練習關</button><button data-treset="1">重置提示${tutSeen.skip ? '（目前已全部跳過）' : ''}</button><button data-tx="1">關閉</button>`;
    $('modal').classList.remove('hidden');
    $('modalBox').onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.tk) { $('modal').classList.add('hidden'); tutor(t.dataset.tk, true, tutMenu); }
      else if (t.dataset.tg) { $('modal').classList.add('hidden'); guideStart(null); }
      else if (t.dataset.treset) { tutSeen = {}; saveTut(); tutMenu(); $('modalBox').querySelector('.lbl').textContent = '已重置：之後進商店、戰鬥、大廳時會再提示一次。'; }
      else $('modal').classList.add('hidden');
    };
  }

  // ---- 經濟擴充 ----：商店上方的輪崗／二手市場／人脈進階／進化提示、商店道具格（冶金爐）按鈕、經濟事件提示
  // 以包裝 renderShop 的方式插入，不改原本的商店渲染
  (function () {
    const base = renderShop;
    renderShop = function () {
      base();
      if (!run) return;
      const e = RUN.efx(run), bits = [];
      if (e.rotateCost && run.rotCost) bits.push(`🔄輪崗：${run.rotCost} 費機率 ×${e.rotateCost}`);
      if (e.rerollQuest && !run.rqDone) bits.push(`♻二手市場 ${run.rerollN || 0}/${e.rerollQuest.n}`);
      if (e.perNodeAtk && run.evoN) bits.push(`🧬進化 攻擊 +${Math.round(e.perNodeAtk * run.evoN * 100)}%`);
      if (run.bondQ) bits.push(`🤝人脈進階：啟動 ${run.bondQ.need} 個羈絆 → +${run.bondQ.gold} 金`);
      const sc = run.shopCons, X = sc && CS[sc.id];
      // 商店道具格：照貨幣戰爭放在商店列最後一張卡（原本放右側資訊欄，不容易發現）
      $('shopRow').classList.toggle('has-cons', !!X);
      $('shopRow').querySelectorAll('.consc').forEach(n => n.remove());
      if (X) $('shopRow').insertAdjacentHTML('beforeend', `<div class="card consc${run.gold < sc.price ? ' poor' : ''}" data-econ="cons" role="button" aria-label="買${X.name}"><span class="cc">${sc.price}<i>💰</i></span>` +
        `<span class="cico">${X.icon}</span><div class="cbody"><div class="cn">${X.name}</div><div class="t">${X.desc || '道具'}</div></div></div>`);
      if (bits.length) $('enemyInfo').innerHTML += `<div class="lbl econ-bar">${bits.join('　')}</div>`;
      const notes = RUN.takeNotes(run); if (notes.length) $('info').innerHTML = `<b style="color:#ffc531">${notes.join('<br>')}</b>`;
      // ---- 連線自走棋 ----：標題、準備鍵；不提供匯出／代碼對戰
      $('bExport').classList.toggle('hidden', !!lgHost); $('bDuel').classList.toggle('hidden', !!lgHost);
      $('bFight').textContent = lgHost ? lgHost.fightText() : '出發 ▶';
      if (lgHost) { $('tStage').textContent = lgHost.title(); $('bFight').disabled = lgHost.locked(); if (lgHost.decorate) lgHost.decorate(); }
    };
    $('shop').addEventListener('click', ev => {
      const t = ev.target.closest('[data-econ]'); if (!t || !run) return;
      if (t.dataset.econ === 'cons') { if (!RUN.buyShopCons(run)) return flash('金幣不足'); FA.sound.play('coin'); }
      renderShop(); save();
    });
  })();

  // ---- 畫面 ----：商店動態（只看畫面前後差異，不碰邏輯）：刷新時卡片翻出、升星光效、金幣飛入
  (function () {
    const base = renderShop; let lastShop = '', lastGold = null, lastStars = null, lastRun = null;
    const starMap = () => { const m = {}; ['front', 'back', 'bench'].forEach(z => run[z].forEach(u => { if (u && u.star > 1) m[u.id + '|' + u.star] = (m[u.id + '|' + u.star] || 0) + 1; })); return m; };
    renderShop = function () {
      base(); if (!run) return;
      if (lastRun !== run) { lastRun = run; lastShop = ''; lastGold = run.gold; lastStars = starMap(); }
      const key = run.shop.join(',');
      if (key !== lastShop) { lastShop = key; $('shopRow').querySelectorAll('.card').forEach((c, k) => { c.style.setProperty('--k', k); c.classList.add('flip'); }); }
      const sm = starMap();
      for (const k in sm) if (sm[k] > (lastStars[k] || 0)) { const [id, st] = k.split('|'); document.querySelectorAll('#shop .slot').forEach(el => { const u = RUN.unitAt(run, { zone: el.dataset.z, i: +el.dataset.i }); if (u && u.id === id && u.star === +st) el.classList.add('ux-starup'); }); vib(25); }
      lastStars = sm;
      if (lastGold != null && run.gold > lastGold) coinFly(run.gold - lastGold);
      lastGold = run.gold;
    };
    function coinFly(n) {
      const to = $('tGold').getBoundingClientRect(), tx = to.left + to.width * 0.25, ty = to.top + to.height / 2, cnt = Math.min(8, 2 + n);
      for (let k = 0; k < cnt; k++) {
        const c = document.createElement('div'); c.className = 'fly-coin'; const sx = innerWidth / 2 + (Math.random() - 0.5) * 140, sy = innerHeight * 0.55 + (Math.random() - 0.5) * 80;
        c.style.left = sx + 'px'; c.style.top = sy + 'px'; document.body.appendChild(c);
        setTimeout(() => { c.style.transform = `translate(${tx - sx}px,${ty - sy}px) scale(.7)`; c.style.opacity = '.4'; }, 20 + k * 45);
        setTimeout(() => c.remove(), 700 + k * 45);
      }
      setTimeout(() => { const g = $('tGold'); g.classList.remove('bump'); void g.offsetWidth; g.classList.add('bump'); }, 520);
    }
  })();

  // ---------- 標題 ----------
  function toTitle() {
    if (mode === 'guide') { mode = 'run'; guideNext = null; coach(null); } battle = null; $('modal').classList.add('hidden'); show('title'); $('btnCont').classList.toggle('hidden', !load());
    if (loadErr) { const t = loadErr; loadErr = null; modal(`<h2>⚠ 存檔無法讀取</h2>${t}`, [{ t: '知道了', cls: 'go' }]); }
  }
  $('btnCodex').onclick = () => codex();
  const setBtns = () => { speedBtn(); if (FA.settingsUI) FA.settingsUI.refresh(); }; // 音效／音樂／震動開關移到 ⚙ 設定（src/ui/settings.js）
  const toggleVib = () => { FA.settings.vibrate = !FA.settings.vibrate; saveSet(); setBtns(); vib(30); };
  $('uxTutBtn').onclick = tutMenu;
  $('selAsc').innerHTML = RD.ascensions.map((a, i) => `<option value="${i}">${a.name}：${a.desc}</option>`).join('');
  const seed = () => (Date.now() ^ (Math.random() * 1e9)) | 0, asc = () => +$('selAsc').value;
  const confirmNew = go => load() ? modal('<h2>開新局？</h2>目前進度會被覆蓋', [{ t: '開新局', cls: 'go', f: go }, { t: '取消' }]) : go();
  $('btnNew').onclick = () => confirmNew(() => { hs = null; mode = 'run'; run = RUN.newRun(seed(), asc()); battle = null; sel = null; save(); show('shop'); renderShop(); flow(); });
  $('btnHot').onclick = () => confirmNew(() => modal('<h2>同手機輪流</h2>每人各自經營一局，打完一個節點換下一位，最後比進度。', [2, 3, 4].map(n => ({ t: n + ' 人', f: () => {
    hs = { cur: 0, players: [...Array(n)].map((_, i) => ({ name: 'P' + (i + 1), run: RUN.newRun(seed() + i * 7919, asc()), seen: 0, done: false })) };
    run = hs.players[0].run; mode = 'run'; battle = null; sel = null; save();
    modal('<h2>輪到 P1</h2>', [{ t: '開始', cls: 'go', f: () => { show('shop'); renderShop(); flow(); } }]);
  } })).concat([{ t: '取消' }])));
  $('btnCont').onclick = () => {
    const raw = load(); if (!raw) return toTitle();
    let s = null; try { s = migrateSave(raw); } catch (e) { s = null; }
    if (!s) { badSave(raw); return toTitle(); }
    hs = s.hs || null; run = hs ? hs.players[hs.cur].run : s.run; battle = s.battle; mode = ['run', 'duel'].includes(s.mode) ? s.mode : 'run'; sel = null; bst = s.bst || (battle ? newStats() : null);
    if (mode === 'duel' && !battle) mode = 'run';
    if (s.dropped) { bst = null; if (raw.mode !== 'duel') run.node = null; setTimeout(() => flash('舊版存檔的戰鬥已放棄，回到商店'), 50); } // 舊規則戰鬥（無總動數）或角色已移除：無法續打
    try {
      save();
      if (battle) { show('battle'); V.reset(); V.resize(); paused = false; pause(); }
      // 練習關本身不存檔。若已選定戰鬥節點，繼續時直接開打。
      else if (tutSeen.guide && !run.pending && ['battle', 'boss', 'reward', 'encounter'].includes(run.node)) startFight();
      else { show('shop'); renderShop(); flow(); }
    } catch (e) { // 修不好的存檔：備份後回標題，不要卡在壞掉的畫面
      console.warn('讀檔失敗', e); hs = null; run = null; battle = null; badSave(raw); toTitle();
    }
  };
  toTitle();
  setTimeout(() => { const intro = () => tutor('intro'); if (!(FA.a2hs && FA.a2hs(intro))) intro(); }, 300);
  FA.debug = () => ({ run, battle, bst, mode }); // 測試／除錯用
  FA.ui = { modal, toTitle, clearSave, tutor, tutMenu, guide: () => guideStart(null), resetTut: () => { tutSeen = {}; saveTut(); }, setBtns };
  // ---- 連線自走棋 ----：src/league.js 借用商店畫面。host = { save(run), ready(), quit(), title(), fightText(), locked(), decorate() }
  FA.shopHost = {
    open(r, host) { lgHost = host; hs = null; mode = 'league'; run = r; battle = null; sel = null; $('modal').classList.add('hidden'); show('shop'); renderShop(); flow(); },
    close() { if (!lgHost) return; lgHost = null; run = null; mode = 'run'; sel = null; endDrag(); $('modal').classList.add('hidden'); $('uxTut').classList.add('hidden'); tutOn = false; ['shop', 'battle'].forEach(s => $(s).classList.add('hidden')); screen = 'league'; },
    render() { if (lgHost && screen === 'shop') renderShop(); },
    active: () => !!lgHost, run: () => (lgHost ? run : null)
  };

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
