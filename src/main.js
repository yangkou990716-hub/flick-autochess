// 介面流程：標題 → 開局詞綴 → 投資環境 → 商店 ⇄ 節點（戰鬥/精英/獎勵/首領）→ 投資策略；存檔、暫停、輸入
(function () {
  const FA = globalThis.FA, D = FA.DATA, C = D.config, RD = D.run, V = FA.view, RUN = FA.run;
  const $ = id => document.getElementById(id), KEY = 'flick_autochess_save_v2';
  let run = null, battle = null, sel = null, screen = 'title', paused = false, ai = null, drag = null, hs = null, mode = 'run', duelName = '';
  const ui = { aim: null, msg: '' };
  let bst = null; // 本場戰鬥統計（在 V.consume 清空事件前掃描）

  // ---------- 設定（震動、播放速度）：FA.settings 給 render.js 共用 ----------
  const SET_KEY = 'fa_settings';
  FA.settings = Object.assign({ vibrate: true, speed: 1 }, (() => { try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; } })());
  const saveSet = () => { try { localStorage.setItem(SET_KEY, JSON.stringify(FA.settings)); } catch (e) { } };
  const vib = ms => { if (FA.settings.vibrate) try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };

  // ---------- 存檔 ----------
  let lgHost = null; // ---- 連線自走棋 ----：商店借給 src/league.js 用時的回呼（存檔、準備、離開）
  const save = () => { if (lgHost) { try { lgHost.save(run); } catch (e) { } return; } try { if (run) localStorage.setItem(KEY, JSON.stringify(hs ? { hs, battle, mode, bst } : { run, battle, mode, bst })); } catch (e) { } };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const clearSave = () => { try { localStorage.removeItem(KEY); } catch (e) { } };

  function show(id) { screen = id; ['title', 'shop', 'battle'].forEach(s => $(s).classList.toggle('hidden', s !== id)); bgm(); }
  // 背景音樂跟著畫面：首領戰看場上有沒有首領
  const bgm = () => FA.sound.music(screen === 'battle' ? (battle && battle.bodies.some(o => o.boss) ? 'boss' : 'battle') : screen);
  const unitN = () => ['front', 'back', 'bench'].reduce((a, z) => a + run[z].filter(Boolean).length, 0);
  const buySnd = n0 => FA.sound.play(unitN() < n0 + 1 ? 'starup' : 'buy'); // 買完隻數沒 +1＝合成升星
  function modal(html, btns) {
    $('modalBox').className = 'box';
    $('modalBox').innerHTML = html + btns.map((b, i) => `<button data-m="${i}" class="${b.cls || ''}">${b.t}</button>`).join('');
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
  const facName = id => { const U = D.units[id], F = U && U.faction && FAC[U.faction]; return F ? `<span style="color:${F.color}">${F.icon}${F.name}</span>` : ''; };
  const teamEmb = () => FA.battle.emblemMap(RUN.teamUnits(run));
  const weaponText = id => `${D.weapons[id].icon}${D.weapons[id].name}：${D.weapons[id].desc}`;
  function backText(U) {
    const b = U.back; if (!b) return '';
    return { atkPct: `${b.trait ? D.traits[b.trait].name + '角色' : '前台'}攻擊+${pct(b.val)}`, shield: `每回合前台護盾+${b.val}`, heal: `每回合前台回血+${b.val}`,
      zap: `每回合電擊隨機敵人（${pct(b.mult)}攻擊）`, gravity: '每回合把敵人往中間吸', cannon: `每回合炮擊隨機敵人（${pct(b.mult)}攻擊爆炸）`, revive: `第一隻被打倒的隊友當場以 ${pct(b.pct)} 生命撐住（不扣動數）`, mark: `每回合標記 1 名敵人，受傷 +${pct(b.amp || 0)}（${b.turns || 0} 回合）`,
      snipe: `每回合狙擊生命最低的敵人（${pct(b.mult)}攻擊）`, veil: `每 2 回合讓 ${b.n} 名前台隊友隱身：下次被撞必定閃避（3 星 +1 名）` }[b.type];
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
    const U = D.units[u.id], m = C.starMult[u.star - 1];
    const role = { front: '前台', back: '後台', both: '兩用（站位賦能）' }[U.role];
    let s = `<b>${U.name} ${'★'.repeat(u.star)}</b>　<span class="k">${U.cost}費</span>　${U.traits.map(t => D.traits[t].name).join('・')}${U.faction ? '　' + facName(u.id) : ''}　${role}<br>`;
    s += `生命 ${Math.round(U.hp * m)}｜攻擊 ${Math.round(U.atk * m)}｜速度 ${U.speed}｜重量 ${U.mass}｜大小 ${U.r}<br>`;
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
      $('modalBox').className = 'box';
      $('modalBox').innerHTML = `<h2>${choiceTitle[p.type]}</h2>${p.type === 'path' ? planeMap() : ''}${sub ? `<div class="lbl">${sub}</div>` : ''}<div class="choices">` +
        p.options.map((id, i) => `<div class="choice ${choiceCls(p.type, id)}" data-c="${i}">${choiceCard(p.type, id)}</div>`).join('') + '</div>' +
        (p.type === 'path' || p.type === 'encounter' ? '<button data-back="1">先回商店</button>' : '') + (p.type === 'carrier' ? carrierBtn(p) : '');
      $('modal').classList.remove('hidden');
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

  // ---------- 商店畫面 ----------
  function renderShop() {
    const lv = RUN.lv(run), boss = RUN.isBoss(run);
    $('tStage').textContent = `${hs ? hs.players[hs.cur].name + '｜' : ''}位面${run.plane}・${boss ? '👑首領' : `節點${run.step + 1}/${RUN.steps(run).length}`}`;
    $('tHp').textContent = `❤ ${run.hp}${run.lastStand ? ' 🛡' + (run.lastStand > 1 ? run.lastStand : '') : ''}`; $('tGold').textContent = `💰 ${run.gold}`;
    const nx = C.levels[run.level]; $('tLv').textContent = `Lv${run.level}${nx ? ` (${run.xp}/${nx.xp})` : ''}`;
    const env = run.env ? RD.envs[run.env] : null, s = RUN.sfx(run), e = RUN.efx(run);
    $('enemyInfo').innerHTML = `${env ? `🌐${env.name}：${env.desc}` : ''}　利息 +${Math.min(C.interestMax + s.interestAdd + (e.interestAdd || 0), Math.floor(run.gold / C.interestPer))}` +
      (boss ? `　<b>首領：${RUN.bossInfo(run).name}</b>` : '') + (run.streak ? `　${run.streak > 0 ? '連勝' : '連敗'} ${Math.abs(run.streak)}` : '') + (run.threat ? `　<span style="color:#f88">敵強化 ${run.threat > 0 ? "+" : ""}${pct(run.threat)}</span>` : '');
    $('enemyInfo').innerHTML += affixChips(); // ---- 敵人詞綴 ----
    $('strats').innerHTML = run.strats.map(id => { const S = RD.strategies[id], T = RD.tiers[S.tier]; return `<span class="st-chip" style="border-color:${T.color};color:${T.color}" data-st="${id}">${S.name}</span>`; }).join('');
    const onTeam = run.front.slice(0, lv.front).concat(run.back.slice(0, lv.back)).filter(Boolean).map(u => u.id);
    const tt = FA.battle.traitTiers(onTeam, teamEmb());
    $('traits').innerHTML = (Object.keys(D.traits).map(k => {
      const T = D.traits[k], n = tt.counts[k] || 0, a = tt.active[k];
      if (!n) return '';
      return `<span class="tr ${a ? 'act' : ''}" style="${a ? 'background:' + T.color : ''}" data-tr="${k}">${T.name} ${n}/${(T.tiers.find(t => t.n > n) || T.tiers[T.tiers.length - 1]).n}${a && a.lottery ? '🎰' : ''}</span>`;
    }).join('') + factionChips(onTeam)) || '<span class="lbl">羈絆：同羈絆角色湊 2 隻起有小加成</span>';
    ['front', 'back', 'bench'].forEach(z => {
      const lim = z === 'front' ? lv.front : z === 'back' ? lv.back : C.benchSize;
      const len = z === 'front' ? Math.max(6, lv.front) : run[z].length;
      $(z).innerHTML = run[z].slice(0, len).map((u, i) => {
        const isSel = sel && sel.zone === z && sel.i === i;
        return `<div class="slot ${i >= lim ? 'lock' : ''} ${isSel ? 'sel' : ''} ${sel && sel.zone && !isSel && i < lim ? 'tgt' : ''}" data-z="${z}" data-i="${i}">${u ? unitHTML(u) : (i >= lim ? '🔒' : '')}</div>`;
      }).join('');
    });
    const inv = run.items.map((it, i) => `<span class="item ${sel && sel.item === i ? 'sel' : ''}" data-it="${i}">${D.items[it.id].icon}${D.items[it.id].name}</span>`)
      .concat(run.weapons.map((w, i) => `<span class="item wp ${sel && sel.wp === i ? 'sel' : ''}" data-wp="${i}">${D.weapons[w].icon}${D.weapons[w].name}</span>`));
    inv.push(...consChips()); // ---- 道具 ----
    $('items').innerHTML = inv.length ? inv.join('') : '<span class="lbl">裝備/武器：補給、遭遇、撲滿、首領取得</span>';
    let info = '';
    if (sel && sel.zone && RUN.unitAt(run, sel)) { const u = RUN.unitAt(run, sel); info = unitInfo(u) + `<button id="bSell">賣出 +${RUN.sellPrice(u, run)}</button>　<span class="lbl">點空位移動／點角色交換</span>`; }
    else if (sel && sel.cs != null && (run.consumables || [])[sel.cs]) info = consInfo(sel.cs); // ---- 道具 ----
    else if (sel && sel.item != null) info = itemText(run.items[sel.item]) + '<br><span class="lbl">點角色裝上（最多 3 件）。鐵拳＋彈簧＝爆裂彈簧；護符＋疾行靴＝吸血疾靴</span>';
    else if (sel && sel.wp != null) info = weaponText(run.weapons[sel.wp]) + '<br><span class="lbl">點角色裝上（每隻 1 把，會替換）</span>';
    else if (sel && sel.trait) { const T = D.traits[sel.trait]; info = `<b>${T.name}</b>（只加給${T.name}角色）<br>` + T.tiers.map(tierLine).join('<br>') + counterLine(T); }
    else if (sel && sel.fa) info = facInfo(sel.fa);
    else if (sel && sel.st) { const S = RD.strategies[sel.st]; info = `<b>${S.name}</b>（${RD.tiers[S.tier].name}）<br>${S.desc}`; }
    else info = `<span class="lbl">雙方各 ${C.movesEach} 動（首領戰 ${C.movesEach + C.bossMovesAdd}），每彈 -1、被打倒 -${C.deathCost}，對方動數先歸零就贏；擊倒首領直接贏。贏 +${C.winHeal} 血、輸了扣血；🛡＝鎖血免死。點商店卡片購買；點角色查看／移動；3 隻同星自動升星。佈好陣按「前進」選路線。</span>`;
    $('info').innerHTML = info;
    $('shopRow').innerHTML = run.shop.map((id, i) => {
      if (!id) return `<div class="card empty"></div>`;
      const U = D.units[id], cc = ['#888', '#3fb950', '#4ea0ff', '#b072ff', '#ffb000'][U.cost - 1];
      return `<div class="card cost-${U.cost}" data-b="${i}" style="border-color:${cc}">${icon(id, 1, 48) ? `<img src="${icon(id, 1, 48)}" style="width:${Math.round(30 + U.r * 0.55)}px;height:${Math.round(30 + U.r * 0.55)}px;display:block;margin:-5px auto -3px">` : `<div class="dot" style="background:${U.color};width:${U.r * 1.2}px;height:${U.r * 1.2}px"></div>`}${U.name}<br><span class="c">${RUN.unitCost(run, id)} 金</span><div class="t">${U.traits.map(t => `<span class="cdot" style="background:${D.traits[t].color}"></span>${D.traits[t].name}`).join(' ')}</div>${cardHint(id, onTeam, tt)}</div>`;
    }).join('');
    $('bReroll').textContent = run.freeLeft ? `免費刷新` : `刷新 ${RUN.rerollCost(run)}`;
    $('bReroll').disabled = !run.freeLeft && run.gold < RUN.rerollCost(run); $('bXp').disabled = run.gold < C.xpCost || run.level >= C.levels.length;
    $('bLock').classList.toggle('on', run.locked); $('bLock').textContent = run.locked ? '已鎖定' : '鎖定';
  }
  // ---- 陣營 ----：商店羈絆列的陣營（方框、虛線外框，和流派圓角膠囊區分）
  function factionChips(onTeam) {
    const ft = FA.battle.factionTiers(onTeam);
    return Object.keys(FAC).map(k => {
      const F = FAC[k], n = ft.counts[k] || 0, a = ft.active[k]; if (!n) return '';
      return `<span class="tr" data-fa="${k}" style="border-radius:3px;border:1px dashed ${F.color};${a ? `background:${F.color}33;color:${F.color};font-weight:bold` : ''}">${F.icon}${F.name} ${n}/${(F.tiers.find(t => t.n > n) || F.tiers[F.tiers.length - 1]).n}</span>`;
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
  const icon = (id, star, px) => { try { return FA.sprites && FA.sprites.icon ? FA.sprites.icon(id, star, px) : null; } catch (e) { return null; } };
  function unitHTML(u) {
    const U = D.units[u.id], ic = icon(u.id, u.star, 56);
    if (ic) return `<div class="u" style="background:url(${ic}) center/92% no-repeat;border-color:transparent"><span class="st" style="margin-top:auto">${'★'.repeat(u.star)}</span>${u.items.length ? `<span class="it">${u.items.map(i => D.items[i.id].icon).join('')}</span>` : ''}${u.weapon ? `<span class="wp">${D.weapons[u.weapon].icon}</span>` : ''}</div>`;
    return `<div class="u" style="background:${U.color};color:${U.id === 'feather' ? '#333' : '#fff'}"><span>${U.name}</span><span class="st">${'★'.repeat(u.star)}</span>${u.items.length ? `<span class="it">${u.items.map(i => D.items[i.id].icon).join('')}</span>` : ''}${u.weapon ? `<span class="wp">${D.weapons[u.weapon].icon}</span>` : ''}</div>`;
  }

  $('shop').addEventListener('click', e => {
    const t = e.target.closest('[data-z],[data-it],[data-wp],[data-b],[data-tr],[data-fa],[data-st],[data-cs],#bSell'); if (!t) return;
    if (consClick(t)) return; // ---- 道具 ----
    if (t.id === 'bSell') { RUN.sell(run, sel); sel = null; FA.sound.play('sell'); }
    else if (t.dataset.b != null) { const n0 = unitN(); if (!RUN.buy(run, +t.dataset.b)) return flash('金幣或空位不足'); buySnd(n0); }
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
  $('shop').addEventListener('pointerdown', e => {
    if (e.button > 0 || pd || !run) return;
    const t = e.target.closest('[data-z],[data-b],[data-cs]'); if (!t) return;
    if (t.dataset.cs != null) return consDown(e, t); // ---- 道具 ----
    const src = t.dataset.b != null ? { buy: +t.dataset.b } : { zone: t.dataset.z, i: +t.dataset.i };
    if (src.buy != null ? !run.shop[src.buy] : !RUN.unitAt(run, src)) return;
    pd = { src, el: t, x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, over: null, ghost: null };
    pd.timer = setTimeout(() => { if (pd && !pd.drag) { const s = pd.src; endDrag(); noClickUntil = performance.now() + 600; vib(10); detail(s); } }, 450);
  });
  addEventListener('pointermove', e => {
    if (!pd || e.pointerId !== pd.id) return;
    if (!pd.drag) { if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) < 9) return; clearTimeout(pd.timer); startDrag(); }
    e.preventDefault();
    pd.ghost.style.left = e.clientX + 'px'; pd.ghost.style.top = e.clientY + 'px';
    const tg = dropAt(e.clientX, e.clientY), el = tg ? tg.el : null;
    if (pd.over !== el) { pd.over && pd.over.classList.remove('ux-over'); el && el.classList.add('ux-over'); pd.over = el; }
  }, { passive: false });
  addEventListener('pointerup', e => {
    if (!pd || e.pointerId !== pd.id) return;
    const d = pd, tg = d.drag ? dropAt(e.clientX, e.clientY) : null; endDrag(); // 先找目標，再收起賣出區
    if (d.drag) { noClickUntil = performance.now() + 250; doDrop(d.src, tg); }
  });
  addEventListener('pointercancel', e => { if (pd && e.pointerId === pd.id) endDrag(); });
  function startDrag() {
    if (pd.src.cs != null) return consStartDrag(); // ---- 道具 ----
    pd.drag = true; sel = null;
    const u = pd.src.buy != null ? null : RUN.unitAt(run, pd.src), id = u ? u.id : run.shop[pd.src.buy];
    const g = document.createElement('div'); g.className = 'ux-ghost';
    g.innerHTML = unitHTML(u || { id, star: 1, items: [], weapon: null });
    document.body.appendChild(g); pd.ghost = g; g.style.left = pd.x + 'px'; g.style.top = pd.y + 'px';
    $('shop').classList.add('ux-dragging'); pd.el.style.opacity = '.35';
    if (u) { $('uxSell').textContent = `拖到這裡賣出 +${RUN.sellPrice(u, run)} 💰`; $('uxSell').classList.remove('hidden'); }
  }
  function endDrag() {
    if (!pd) return; clearTimeout(pd.timer);
    if (pd.ghost) pd.ghost.remove(); if (pd.over) pd.over.classList.remove('ux-over'); pd.el.style.opacity = '';
    $('shop').classList.remove('ux-dragging'); $('uxSell').classList.add('hidden'); pd = null;
  }
  // 手指下方的放置目標：賣出區／格子／整排（放到該排第一個空位）
  function dropAt(x, y) {
    const el = document.elementFromPoint(x, y); if (!el) return null;
    if (el.closest('#uxSell')) return { sell: true, el: $('uxSell') };
    const ie = el.closest('[data-it]'); if (ie && pd && pd.src.cs != null) return { item: +ie.dataset.it, el: ie }; // ---- 道具 ----
    const s = el.closest('[data-z]');
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
    if (src.buy != null) {
      if (!tg.loc) return;
      const uid = run.uid, n0 = unitN();
      if (!RUN.buy(run, src.buy)) { renderShop(); return flash('金幣或空位不足'); }
      buySnd(n0);
      let from = null; ['front', 'back', 'bench'].forEach(z => run[z].forEach((u, i) => { if (u && u.uid === uid) from = { zone: z, i }; }));
      if (from && !(from.zone === tg.loc.zone && from.i === tg.loc.i)) RUN.move(run, from, tg.loc);
      renderShop(); save(); if (!from) flash('升星！'); return;
    }
    if (tg.sell) { RUN.sell(run, src); FA.sound.play('sell'); }
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
  const consChips = () => (run.consumables || []).map((id, i) => CS[id] ? `<span class="item cs ${sel && sel.cs === i ? 'sel' : ''}" data-cs="${i}" style="border-style:dashed;${sel && sel.cs === i ? '' : 'border-color:#5cf;'}">${CS[id].icon}${CS[id].name}</span>` : '').filter(Boolean);
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
    $('shop').classList.add('ux-dragging'); pd.el.style.opacity = '.35';
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
  $('bLock').onclick = () => { run.locked = !run.locked; renderShop(); save(); };
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
    mode = 'run';
    const b = RUN.startBattle(run); if (!b) { run.node = null; show('shop'); renderShop(); return flash('前台至少要放 1 隻'); }
    battle = b; bst = newStats(); V.reset(); ai = null; ui.aim = null; hideBInfo(); show('battle'); V.resize(); save();
    setTimeout(tutBattle, 60);
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

  function hud() {
    const b = battle, hp = t => Math.round(FA.battle.hpSum(b, t));
    if (mode === 'duel') run.enemy = { name: '對戰：' + duelName };
    const env = run.env && mode !== 'duel' ? '🌐' + RD.envs[run.env].name : '';
    $('bhud').innerHTML = `<div class="ux-hl">位面${run.plane}｜${run.enemy.name}${b.rules.length ? '｜' + b.rules.map(r => D.enemies.ruleText[r]).join('、') : ''}　${env}</div>` + movesHUD(b);
    if (b.affix && mode !== 'duel') $('bhud').innerHTML += `<div style="color:#f8a;font-size:12px">☠ ${b.affix.ids.map(id => D.enemies.affixes[id].name).join('・')}</div>`; // ---- 敵人詞綴 ----
    const ready = b.phase === 'aim' && b.turn === 0 && FA.battle.avail(b, 0).some(o => o.energy >= UC.max);
    if (!ready) ui.ultArmed = false;
    ui.msg = run.enemy && run.enemy.reward && b.phase !== 'over' ? `打破撲滿！剩 ${Math.max(0, b.moves[0])} 動` : b.phase === 'over' ? (b.winner === 0 ? '勝利！' : '落敗…')
      : b.phase === 'moving' && b.turn === 0 && FA.battle.canTap(b) ? FA.view.tapHint(b)
      : b.phase === 'aim' ? (b.turn === 0 ? (ui.ultArmed ? '⚡ 拉射發光的棋子放大招（再按大招取消）' : '你的回合：按住棋子往後拉') : '敵方瞄準中…（點空白快轉）') : '';
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
    if (!ai) ai = { t: 0, c: null };
    ai.t += dt;
    if (ai.ff && ai.t < 0.45) ai.t = 0.45;
    if (ai.t >= 0.45 && !ai.c) {
      const st = mode === 'duel' ? 15 : run.stage + 1 + (run.node === 'encounter' ? RD.encounter[run.encLv].add : 0);
      ai.c = FA.ai.choose(battle, 1, D.enemies.difficulty(st), battle.rng);
      if (!ai.c) { ai = null; return; }
      if (ai.ff) { FA.battle.launch(battle, ai.c.idx, ai.c.angle, ai.c.power, ai.c.ult, ai.c.tap); ui.aim = null; ai = null; return; }
      ui.aim = { idx: ai.c.idx, angle: ai.c.angle, power: ai.c.power, enemy: true };
    }
    if (ai.c && (ai.t > 1.25 || ai.ff)) { FA.battle.launch(battle, ai.c.idx, ai.c.angle, ai.c.power, ai.c.ult, ai.c.tap); ui.aim = null; ai = null; }
  }

  function afterShot() {
    save();
    if (battle.phase !== 'over') return;
    const b = battle;
    setTimeout(() => {
      FA.sound.music(b.winner === 0 ? 'win' : 'lose'); hideBInfo(); // 勝負短音效由 render.js 的 over 事件播
      const stats = movesRes(b) + statsHTML(); bst = null;
      if (mode === 'duel') { battle = null; mode = 'run'; save(); modal(`<h2 class="res-h ${b.winner === 0 ? 'win' : 'lose'}">${b.winner === 0 ? '🎉 你贏了' : '💥 你輸了'}</h2>對手：${duelName}<div class="lbl">${endReason(b)}</div>${stats}`, [{ t: '回商店', cls: 'go', f: () => { show('shop'); renderShop(); } }]); return tutResult(); }
      const res = RUN.endBattle(run, b); battle = null; save();
      const loot = res.drops.map(itemText).concat(res.weapons.map(weaponText)).concat((res.cons || []).map(k => CS[k] ? CS[k].icon + CS[k].name : '')); // ---- 道具 ----
      const gold = `<div class="ux-res">💰 收入 ${res.income}＋利息 ${res.interest}${res.streakBonus ? `＋連${run.streak > 0 ? '勝' : '敗'} ${res.streakBonus}` : ''}${res.gold ? `＋戰利 ${res.gold}` : ''}　→ 共 ${run.gold} 金</div>`;
      if (res.node === 'reward') modal(`<h2 class="res-h win">🐷 撲滿 ${res.pigs} 隻</h2>${stats}<div class="ux-res">+${res.gold} 金${res.drops.length ? '<br>全破獎勵：' + res.drops.map(itemText).concat((res.cons || []).map(k => CS[k] ? CS[k].icon + CS[k].name : '')).join('<br>') : (res.cons || []).length ? '<br>全破獎勵：' + res.cons.map(k => CS[k].icon + CS[k].name).join('、') : ''}</div>${gold}`, [{ t: '繼續', cls: 'go', f: flow }]);
      else modal(`<h2 class="res-h ${res.win ? 'win' : 'lose'}">${res.win ? '🎉 勝利' : '💥 落敗'}</h2><div class="lbl">${endReason(b)}</div>${stats}<div class="ux-res">` +
        (res.win ? `❤ 小隊 ${res.heal ? '+' + res.heal : '±0'}（${run.hp}）` : `<b style="color:#f88">❤ 小隊 -${res.dmg}（剩 ${run.hp}）</b><br><span class="lbl">${lossText(b, res)}</span>`) + '</div>' +
        (res.saved ? '<b style="color:#ffe066">🛡 鎖血免死觸發！剩 1 血</b><br>' : '') + (res.retry ? '<b style="color:#ffb74d">👑 終局首領還在！整頓後再挑戰</b><br>' : '') + (res.flawless ? '<b style="color:#f8a5c2">🐷 完勝！招財豬加碼</b><br>' : '') + gold +
        (loot.length ? '<div class="ux-res">🎁 獲得：<br>' + loot.join('<br>') + '</div>' : ''),
        [{ t: '繼續', cls: 'go', f: flow }]);
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
  function frame(now) {
    const dt0 = Math.min(0.05, (now - last) / 1000); last = now;
    const spd = FA.settings.speed > 1 ? 2 : 1, dt = dt0 * spd; // 加速只加快播放：物理仍是固定步長，結果不變
    if (screen === 'battle' && battle) {
      if (!paused && !tutOn) {
        if (battle.phase === 'moving') {
          if (V.hitstop > 0) V.hitstop -= dt;
          else {
            acc += dt; let n = 0;
            while (acc >= C.dt && n++ < 16 * spd) {
              acc -= C.dt;
              if (FA.battle.step(battle)) { FA.battle.endShot(battle); acc = 0; consume(battle); afterShot(); break; }
            }
          }
        } else if (battle.phase === 'aim' && battle.turn === 1) enemyThink(dt);
        if (battle) { consume(battle); V.update(dt); }
        if (binfoT > 0 && (binfoT -= dt0) <= 0) hideBInfo();
      }
      if (battle) { hud(); V.draw(battle, ui, paused || tutOn ? 0 : dt); }
    }
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
    羈絆: () => Object.values(D.traits).map(T => `<div class="choice"><b style="color:${T.color}">${T.name}</b>：${Object.keys(D.units).filter(k => D.units[k].traits.includes(Object.keys(D.traits).find(x => D.traits[x] === T))).map(k => D.units[k].name).join('、')}<br>` + T.tiers.map(tierLine).join('<br>') + counterLine(T) + '</div>').join(''),
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

  // ---------- 新手教學：第一次玩分步提示（localStorage 標記，可跳過，標題可重看）----------
  const TUT_KEY = 'fa_tut';
  let tutSeen = (() => { try { return JSON.parse(localStorage.getItem(TUT_KEY)) || {}; } catch (e) { return {}; } })(), tutOn = false;
  const saveTut = () => { try { localStorage.setItem(TUT_KEY, JSON.stringify(tutSeen)); } catch (e) { } };
  // 戰場棋子的螢幕座標（由 V.toWorld 反推）
  function bodyRect() {
    if (!battle) return null;
    const o = battle.bodies.find(x => x.alive && !x.temp && x.team === 0 && !x.stunned); if (!o) return null;
    const w0 = V.toWorld(0, 0), w1 = V.toWorld(1, 0), S = 1 / (w1.x - w0.x), x = o.x * S - w0.x * S, y = o.y * S - w0.y * S, r = o.r * S + 12;
    return { left: x - r, top: y - r, width: r * 2, height: r * 2 };
  }
  const TUT = {
    intro: [{ t: '歡迎來到<b>彈射自走棋</b>！在商店買角色組隊，再到戰場把棋子彈出去撞敵人。第一次玩時會在需要的地方給你簡短提示，隨時可按「跳過教學」，之後在標題「📘 教學」可重看。' },
      { el: '#btnNew', t: '按「單人新遊戲」開始。開局會連續選：開局詞綴 → 投資環境（整局生效）→ 投資策略，點一張卡片就選定。' }],
    shop: [{ el: '#shopRow', t: '① <b>買角色</b>：點商店卡片購買，或直接把卡片<b>拖到</b>前台／後台格子。卡片下方顯示已有幾隻（3 隻同星自動升星）和能不能湊羈絆。<b>長按</b>看詳細。' },
      { el: '#front', t: '② <b>前台</b>：上場彈射的棋子。把角色拖到這裡（也可以先點角色、再點格子）。' },
      { el: '#back', t: '③ <b>後台</b>：不上場，每回合給前台被動效果（加攻、護盾、電擊…）。「兩用」角色放哪邊效果不同。' },
      { el: '#bench', t: '④ <b>備戰區</b>：買來先放這。拖曳時底部會出現「賣出」區，拖過去就賣掉。' },
      { el: '#traits', t: '⑤ <b>羈絆</b>：前台＋後台同羈絆的不同角色湊 2 隻起有加成，點羈絆看說明。' },
      { el: '#bFight', t: '⑥ 佈好陣按「<b>前進</b>」，選一條路線：戰鬥、遭遇（自選難度）、撲滿（拿錢）、補給、首領。' }],
    battle: [{ el: bodyRect, t: '① <b>你的回合</b>：按住自己的棋子（藍框），往<b>反方向</b>拉，放開就彈射出去。' },
      { el: bodyRect, t: '② 拉越長力道越大，棋子上方有<b>力道條</b>；拉到 95% 以上是「<b>全力</b>」，速度 +15%。' },
      { el: bodyRect, t: '③ 拉的時候會出現<b>瞄準預演線</b>：虛線是你的路徑（含反彈），白線是被撞棋子的去向。' },
      { el: '#bhud', t: `④ <b>輪流</b>：每場隨機決定誰先手，一輪內雙方交替出手，每隻棋子都動過一次才進下一輪。上方顯示第幾輪、本輪我方還沒動幾隻。` },
      { el: '#bhud', t: `⑤ <b>總動數</b>：雙方各 ${C.movesEach} 動（首領戰 ${C.movesEach + C.bossMovesAdd}），每彈一次 -1，<span style="color:#4ea0ff">藍條</span>是我方、<span style="color:#ff5a5a">紅條</span>是敵方。<b>對方動數先歸零就贏</b>；擊倒首領直接獲勝。` },
      { el: '#bhud', t: `⑥ <b>被打倒</b>不會消失：在出生點滿血復活，但該方動數再 <b>-${C.deathCost}</b>。所以打倒敵人＝削它的動數，自己也別亂送。落敗會依敵方剩餘動數扣小隊血量。` },
      { el: '#cv', t: '⑦ <b>障礙柱</b>：🛟<b>泳圈柱</b>撞到會加速，本發攻擊 +20%；🌵<b>尖刺柱</b>撞到會受傷（敵我都會）。善用反彈繞過去！' },
      { el: '#bUlt', t: `⑧ <b>大招</b>：${ultCharge}。<b>能量滿的棋子會發光</b>，右下出現「⚡大招」按鈕：先按它，再拉射發光的棋子；想取消就再按一次。每隻大招依羈絆不同，短按棋子可看。` },
      { el: '#uxSpeed', t: '⑨ 這裡切 <b>1x／2x</b> 播放速度。敵方瞄準時點空白處可快轉；<b>短按</b>任何棋子看能力、血量、中毒/冰凍狀態。' }],
    result: [{ el: '#modalBox', t: '<b>結算</b>：勝負、雙方剩餘動數、我方被打倒次數、本場最高傷害、小隊血量變化（落敗依敵方剩餘動數扣血）、金幣（收入＋利息＋連勝敗）和戰利品。按「繼續」回到路線／商店。' }]
  };
  function tutor(key, steps) {
    if (tutSeen.skip || tutSeen[key] || tutOn) return false;
    tutSeen[key] = 1; saveTut(); tutOn = true; ui.aim = null; drag = null;
    let k = 0;
    const box = $('uxBubble'), ring = $('uxRing');
    const end = () => { tutOn = false; $('uxTut').classList.add('hidden'); last = performance.now(); };
    const stepK = () => {
      const st = steps[k], el = typeof st.el === 'function' ? st.el() : st.el ? document.querySelector(st.el) : null;
      const r = el ? (el.getBoundingClientRect ? el.getBoundingClientRect() : el) : null, H = innerHeight;
      if (r && r.width) Object.assign(ring.style, { display: 'block', left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      else Object.assign(ring.style, { display: 'block', left: '50%', top: '50%', width: '0px', height: '0px' });
      box.innerHTML = `<div class="n">新手教學 ${k + 1}/${steps.length}</div>${st.t}<div class="bt"><button id="uxTutSkip">跳過教學</button><button id="uxTutNext" class="go">${k === steps.length - 1 ? '知道了' : '下一步'}</button></div>`;
      const below = r && r.width && (r.top + r.height / 2) < H / 2;
      const has = r && r.width, room = has && !below && r.top < 190; // 上方放不下就貼底
      box.style.top = below ? Math.min(H - 190, r.top + r.height + 14) + 'px' : ''; box.style.bottom = below ? '' : (room ? 10 : has ? H - r.top + 14 : H / 2 - 80) + 'px';
      $('uxTutNext').onclick = () => { if (++k >= steps.length) end(); else stepK(); };
      $('uxTutSkip').onclick = () => { tutSeen.skip = 1; saveTut(); end(); };
    };
    $('uxTut').classList.remove('hidden'); stepK();
    return true;
  }
  const tutShop = () => { if (screen === 'shop' && $('modal').classList.contains('hidden')) tutor('shop', TUT.shop); };
  const tutBattle = () => { if (screen === 'battle' && battle && battle.phase === 'aim' && battle.turn === 0 && !paused) tutor('battle', TUT.battle); };
  const tutResult = () => tutor('result', TUT.result);

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
      if (X) bits.push(`<button data-econ="cons" ${run.gold < sc.price ? 'disabled' : ''}>${X.icon}${X.name} ${sc.price}💰</button>`);
      if (bits.length) $('enemyInfo').innerHTML += `<div class="lbl econ-bar">${bits.join('　')}</div>`;
      const notes = RUN.takeNotes(run); if (notes.length) $('info').innerHTML = `<b style="color:#ffc531">${notes.join('<br>')}</b>`;
      // ---- 連線自走棋 ----：標題、準備鍵；不提供匯出／代碼對戰
      $('bExport').classList.toggle('hidden', !!lgHost); $('bDuel').classList.toggle('hidden', !!lgHost);
      $('bFight').textContent = lgHost ? lgHost.fightText() : '前進 ▶';
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
  function toTitle() { battle = null; $('modal').classList.add('hidden'); show('title'); $('btnCont').classList.toggle('hidden', !load()); }
  $('btnCodex').onclick = () => codex();
  const setBtns = () => { $('btnSound').textContent = FA.sound.on ? '🔊 音效開' : '🔇 音效關'; $('btnMusic').textContent = FA.sound.musicOn ? '🎵 音樂開' : '🎵 音樂關'; $('btnMusic').classList.toggle('off', !FA.sound.musicOn); $('uxVib').textContent = FA.settings.vibrate ? '📳 震動開' : '📴 震動關'; };
  const toggleVib = () => { FA.settings.vibrate = !FA.settings.vibrate; saveSet(); setBtns(); vib(30); };
  $('btnSound').onclick = () => { FA.sound.init(); FA.sound.toggle(); setBtns(); };
  $('btnMusic').onclick = () => { FA.sound.init(); FA.sound.toggleMusic(); setBtns(); };
  $('uxVib').onclick = toggleVib;
  $('uxTutBtn').onclick = () => { tutSeen = {}; saveTut(); tutor('intro', TUT.intro.concat([{ t: '教學已重置：之後進入商店、戰鬥、結算時會再提示一次。' }])); };
  setBtns();
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
    const s = load(); if (!s) return;
    hs = s.hs || null; run = hs ? hs.players[hs.cur].run : s.run; battle = s.battle; mode = s.mode || 'run'; sel = null; bst = s.bst || (battle ? newStats() : null);
    if (battle && !Array.isArray(battle.moves)) { battle = null; bst = null; if (mode === 'duel') mode = 'run'; else run.node = null; save(); setTimeout(() => flash('舊版存檔的戰鬥已放棄，回到商店'), 50); } // 舊規則戰鬥（無總動數）無法續打
    if (battle) { show('battle'); V.reset(); V.resize(); paused = false; pause(); } else { show('shop'); renderShop(); flow(); }
  };
  toTitle();
  setTimeout(() => tutor('intro', TUT.intro), 300);
  FA.debug = () => ({ run, battle, bst }); // 測試／除錯用
  // ---- 連線自走棋 ----：src/league.js 借用商店畫面。host = { save(run), ready(), quit(), title(), fightText(), locked(), decorate() }
  FA.shopHost = {
    open(r, host) { lgHost = host; hs = null; mode = 'league'; run = r; battle = null; sel = null; $('modal').classList.add('hidden'); show('shop'); renderShop(); flow(); },
    close() { if (!lgHost) return; lgHost = null; run = null; mode = 'run'; sel = null; endDrag(); $('modal').classList.add('hidden'); $('uxTut').classList.add('hidden'); tutOn = false; ['shop', 'battle'].forEach(s => $(s).classList.add('hidden')); screen = 'league'; },
    render() { if (lgHost && screen === 'shop') renderShop(); },
    active: () => !!lgHost, run: () => (lgHost ? run : null)
  };

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
