// 介面流程：標題 → 開局詞綴 → 投資環境 → 商店 ⇄ 節點（戰鬥/精英/獎勵/首領）→ 投資策略；存檔、暫停、輸入
(function () {
  const FA = globalThis.FA, D = FA.DATA, C = D.config, RD = D.run, V = FA.view, RUN = FA.run;
  const $ = id => document.getElementById(id), KEY = 'flick_autochess_save_v2';
  let run = null, battle = null, sel = null, screen = 'title', paused = false, ai = null, drag = null, hs = null, mode = 'run', duelName = '';
  const ui = { aim: null, msg: '' };

  // ---------- 存檔 ----------
  const save = () => { try { if (run) localStorage.setItem(KEY, JSON.stringify(hs ? { hs, battle, mode } : { run, battle, mode })); } catch (e) { } };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const clearSave = () => { try { localStorage.removeItem(KEY); } catch (e) { } };

  function show(id) { screen = id; ['title', 'shop', 'battle'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
  function modal(html, btns) {
    $('modalBox').innerHTML = html + btns.map((b, i) => `<button data-m="${i}" class="${b.cls || ''}">${b.t}</button>`).join('');
    $('modal').classList.remove('hidden');
    $('modalBox').onclick = e => { const t = e.target.closest('[data-m]'); if (!t) return; $('modal').classList.add('hidden'); btns[+t.dataset.m].f && btns[+t.dataset.m].f(); };
  }

  // ---------- 文字 ----------
  const MT = D.modText, pct = v => Math.round(v * 100) + '%';
  const modsText = m => Object.entries(m || {}).map(([k, v]) => MT[k] ? MT[k](v) : '').filter(Boolean).join('、');
  const itemText = it => `${D.items[it.id].icon}${D.items[it.id].name}（${modsText(it.rolls)}）`;
  const weaponText = id => `${D.weapons[id].icon}${D.weapons[id].name}：${D.weapons[id].desc}`;
  function backText(U) {
    const b = U.back; if (!b) return '';
    return { atkPct: `${b.trait ? D.traits[b.trait].name + '角色' : '前台'}攻擊+${pct(b.val)}`, shield: `每回合前台護盾+${b.val}`, heal: `每回合前台回血+${b.val}`,
      zap: `每回合電擊隨機敵人（${pct(b.mult)}攻擊）`, gravity: '每回合把敵人往中間吸', cannon: `每回合炮擊隨機敵人（${pct(b.mult)}攻擊爆炸）`, revive: `第一隻陣亡的隊友以 ${pct(b.pct)} 生命復活` }[b.type];
  }
  function unitInfo(u) {
    const U = D.units[u.id], m = C.starMult[u.star - 1];
    const role = { front: '前台', back: '後台', both: '兩用（站位賦能）' }[U.role];
    let s = `<b>${U.name} ${'★'.repeat(u.star)}</b>　<span class="k">${U.cost}費</span>　${U.traits.map(t => D.traits[t].name).join('・')}　${role}<br>`;
    s += `生命 ${Math.round(U.hp * m)}｜攻擊 ${Math.round(U.atk * m)}｜速度 ${U.speed}｜重量 ${U.mass}｜大小 ${U.r}<br>`;
    if (U.ability && U.role !== 'back') s += `<span class="k">${U.role === 'both' ? '前台' : '能力'}：</span>${U.ability.desc}<br>`;
    if (U.back && U.role !== 'front') s += `<span class="k">後台：</span>${backText(U)}<br>`;
    if (U.link) s += `<span class="k">聯動：</span>撞到${D.units[U.link.with].name} →「${U.link.combo.name}」<br>`;
    if (u.weapon) s += weaponText(u.weapon) + '<br>';
    if (u.items.length) s += u.items.map(itemText).join('<br>') + '<br>';
    return s;
  }

  // ---------- 選擇卡（開局詞綴／環境／路線／獎勵／策略）----------
  function choiceCard(type, id) {
    if (type === 'opener') { const o = RD.openers[id]; return `<b>${o.name}</b><br>${o.desc}`; }
    if (type === 'env') { const o = RD.envs[id]; return `<b>🌐 ${o.name}</b><br>${o.desc}`; }
    if (type === 'supply') { const o = RD.supplies[id]; return `<b>📦 ${o.name}</b><br>${o.desc}`; }
    if (type === 'encounter') {
      const e = RD.encounter[id], w = e.reward;
      return `<b>❗ ${e.name}</b>${e.add ? `<span class="tier" style="color:#f88">敵人 +${e.add} 關${e.extra ? `、多 ${e.extra} 隻` : ''}</span>` : ''}<br>勝利獎勵：${[w.gold ? w.gold + ' 金' : '', w.item ? '裝備' : '', w.weapon ? '武器' : '', w.strategy ? RD.tiers[w.strategy].name + '投資策略' : ''].filter(Boolean).join('＋')}`;
    }
    if (type === 'path') { const o = RD.nodeInfo[id]; return `<b>${o.icon} ${o.name}</b><br>${o.desc}`; }
    if (type === 'strategy') {
      const o = RD.strategies[id], T = RD.tiers[o.tier];
      return `<span class="tier" style="color:${T.color}">${T.name}</span><b>${o.name}</b><br>${o.desc}` +
        (T.threat ? `<br><span style="color:#f88">之後敵人生命/攻擊 +${pct(T.threat)}${T.extraEnemy ? `、多 ${T.extraEnemy} 隻` : ''}</span>` : '');
    }
  }
  const choiceTitle = { opener: '選擇開局詞綴', env: '投資環境（持續整局）', path: '選擇路線', supply: '補給 3 選 1', encounter: '遭遇：選擇難度', strategy: '投資策略' };
  function flow() {
    if (!run) return;
    if (hs) {
      const me = hs.players[hs.cur];
      if (run.over && !me.done) { me.done = true; save(); return modal(`<h2>${me.name}：${run.over === 'win' ? '🏆 通關！' : '☠ 全滅'}</h2>打到第 ${run.plane} 位面・第 ${run.stage} 個節點`, [{ t: '繼續', cls: 'go', f: flow }]); }
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
      return modal(`<h2>${won ? '🏆 通關！' : '☠ 小隊全滅'}</h2>難度 ${RD.ascensions[run.asc || 0].name}・打到第 ${run.plane} 位面・第 ${run.stage} 個節點<br>投資策略 ${run.strats.length} 張`, [{ t: '回標題', f: toTitle }]);
    }
    const p = run.pending;
    if (p) {
      const sub = p.type === 'env' ? '開局選一次，整局都生效' : p.type === 'path' ? `第 ${run.plane} 位面・節點 ${run.step + 1}/${RUN.steps(run).length}` : p.type === 'strategy' ? (p.tier ? RD.tiers[p.tier].name + '投資策略' : '黃金、稜彩越強，之後敵人也越強') : '';
      $('modalBox').innerHTML = `<h2>${choiceTitle[p.type]}</h2>${sub ? `<div class="lbl">${sub}</div>` : ''}<div class="choices">` +
        p.options.map((id, i) => `<div class="choice" data-c="${i}">${choiceCard(p.type, id)}</div>`).join('') + '</div>' +
        (p.type === 'path' || p.type === 'encounter' ? '<button data-back="1">先回商店</button>' : '');
      $('modal').classList.remove('hidden');
      $('modalBox').onclick = e => {
        if (e.target.dataset.back) { run.pending = null; $('modal').classList.add('hidden'); save(); renderShop(); return; }
        const t = e.target.closest('[data-c]'); if (!t) return;
        $('modal').classList.add('hidden');
        const r = RUN.choose(run, +t.dataset.c); save();
        if (r === 'battle') return startFight();
        flow();
      };
      return;
    }
    show('shop'); renderShop();
  }

  // ---------- 商店畫面 ----------
  function renderShop() {
    const lv = RUN.lv(run), boss = RUN.isBoss(run);
    $('tStage').textContent = `${hs ? hs.players[hs.cur].name + '｜' : ''}位面${run.plane}・${boss ? '👑首領' : `節點${run.step + 1}/${RUN.steps(run).length}`}`;
    $('tHp').textContent = `❤ ${run.hp}${run.lastStand ? ' 🛡' + (run.lastStand > 1 ? run.lastStand : '') : ''}`; $('tGold').textContent = `💰 ${run.gold}`;
    const nx = C.levels[run.level]; $('tLv').textContent = `Lv${run.level}${nx ? ` (${run.xp}/${nx.xp})` : ''}`;
    const env = run.env ? RD.envs[run.env] : null, s = RUN.sfx(run), e = RUN.efx(run);
    $('enemyInfo').innerHTML = `${env ? `🌐${env.name}：${env.desc}` : ''}　利息 +${Math.min(C.interestMax + s.interestAdd + (e.interestAdd || 0), Math.floor(run.gold / C.interestPer))}` +
      (boss ? `　<b>首領：${RUN.bossInfo(run).name}</b>` : '') + (run.streak ? `　${run.streak > 0 ? '連勝' : '連敗'} ${Math.abs(run.streak)}` : '') + (run.threat ? `　<span style="color:#f88">敵強化 +${pct(run.threat)}</span>` : '');
    $('strats').innerHTML = run.strats.map(id => { const S = RD.strategies[id], T = RD.tiers[S.tier]; return `<span class="st-chip" style="border-color:${T.color};color:${T.color}" data-st="${id}">${S.name}</span>`; }).join('');
    const onTeam = run.front.slice(0, lv.front).concat(run.back.slice(0, lv.back)).filter(Boolean).map(u => u.id);
    const tt = FA.battle.traitTiers(onTeam);
    $('traits').innerHTML = Object.keys(D.traits).map(k => {
      const T = D.traits[k], n = tt.counts[k] || 0, a = tt.active[k];
      if (!n) return '';
      return `<span class="tr ${a ? 'act' : ''}" style="${a ? 'background:' + T.color : ''}" data-tr="${k}">${T.name} ${n}/${(T.tiers.find(t => t.n > n) || T.tiers[T.tiers.length - 1]).n}</span>`;
    }).join('') || '<span class="lbl">羈絆：同羈絆角色湊 2 隻起有小加成</span>';
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
    $('items').innerHTML = inv.length ? inv.join('') : '<span class="lbl">裝備/武器：補給、遭遇、撲滿、首領取得</span>';
    let info = '';
    if (sel && sel.zone && RUN.unitAt(run, sel)) { const u = RUN.unitAt(run, sel); info = unitInfo(u) + `<button id="bSell">賣出 +${RUN.sellPrice(u)}</button>　<span class="lbl">點空位移動／點角色交換</span>`; }
    else if (sel && sel.item != null) info = itemText(run.items[sel.item]) + '<br><span class="lbl">點角色裝上（最多 3 件）。鐵拳＋彈簧＝爆裂彈簧；護符＋疾行靴＝吸血疾靴</span>';
    else if (sel && sel.wp != null) info = weaponText(run.weapons[sel.wp]) + '<br><span class="lbl">點角色裝上（每隻 1 把，會替換）</span>';
    else if (sel && sel.trait) { const T = D.traits[sel.trait]; info = `<b>${T.name}</b>（只加給${T.name}角色）<br>` + T.tiers.map(t => `${t.n}：${modsText(t.mods)}`).join('<br>'); }
    else if (sel && sel.st) { const S = RD.strategies[sel.st]; info = `<b>${S.name}</b>（${RD.tiers[S.tier].name}）<br>${S.desc}`; }
    else info = '<span class="lbl">殺光敵人才算贏，贏 +2 血；🛡＝鎖血免死。點商店卡片購買；點角色查看／移動；3 隻同星自動升星。佈好陣按「前進」選路線。</span>';
    $('info').innerHTML = info;
    $('shopRow').innerHTML = run.shop.map((id, i) => {
      if (!id) return `<div class="card empty"></div>`;
      const U = D.units[id], cc = ['#888', '#3fb950', '#4ea0ff', '#b072ff', '#ffb000'][U.cost - 1];
      return `<div class="card" data-b="${i}" style="border-color:${cc}"><div class="dot" style="background:${U.color};width:${U.r * 1.2}px;height:${U.r * 1.2}px"></div>${U.name}<div class="c">${RUN.unitCost(run, id)}💰</div><div class="t">${U.traits.map(t => D.traits[t].name).join('・')}</div></div>`;
    }).join('');
    $('bReroll').textContent = run.freeLeft ? `免費刷新` : `刷新 ${C.rerollCost}`;
    $('bReroll').disabled = !run.freeLeft && run.gold < C.rerollCost; $('bXp').disabled = run.gold < C.xpCost || run.level >= C.levels.length;
    $('bLock').classList.toggle('on', run.locked); $('bLock').textContent = run.locked ? '已鎖定' : '鎖定';
  }
  function unitHTML(u) {
    const U = D.units[u.id];
    return `<div class="u" style="background:${U.color};color:${U.id === 'feather' ? '#333' : '#fff'}"><span>${U.name}</span><span class="st">${'★'.repeat(u.star)}</span>${u.items.length ? `<span class="it">${u.items.map(i => D.items[i.id].icon).join('')}</span>` : ''}${u.weapon ? `<span class="wp">${D.weapons[u.weapon].icon}</span>` : ''}</div>`;
  }

  $('shop').addEventListener('click', e => {
    const t = e.target.closest('[data-z],[data-it],[data-wp],[data-b],[data-tr],[data-st],#bSell'); if (!t) return;
    if (t.id === 'bSell') { RUN.sell(run, sel); sel = null; }
    else if (t.dataset.b != null) { if (!RUN.buy(run, +t.dataset.b)) return flash('金幣或空位不足'); FA.sound.play('coin'); }
    else if (t.dataset.it != null) { const i = +t.dataset.it; sel = sel && sel.item === i ? null : { item: i }; }
    else if (t.dataset.wp != null) { const i = +t.dataset.wp; sel = sel && sel.wp === i ? null : { wp: i }; }
    else if (t.dataset.tr) sel = { trait: t.dataset.tr };
    else if (t.dataset.st) sel = { st: t.dataset.st };
    else {
      const loc = { zone: t.dataset.z, i: +t.dataset.i }, u = RUN.unitAt(run, loc);
      if (sel && sel.item != null) { if (u) { const r = RUN.equip(run, sel.item, loc); sel = null; if (!r) { renderShop(); return flash('最多 3 件裝備'); } if (r === 'combine') { renderShop(); save(); return flash('合成進階裝備！'); } } }
      else if (sel && sel.wp != null) { if (u) { RUN.equipWeapon(run, sel.wp, loc); sel = null; } }
      else if (sel && sel.zone) { if (!(sel.zone === loc.zone && sel.i === loc.i)) RUN.move(run, sel, loc); sel = null; }
      else if (u) sel = loc;
    }
    renderShop(); save();
  });
  $('bReroll').onclick = () => { RUN.reroll(run); renderShop(); save(); };
  $('bLock').onclick = () => { run.locked = !run.locked; renderShop(); save(); };
  $('bXp').onclick = () => { RUN.buyXp(run); renderShop(); save(); };
  $('bFight').onclick = () => {
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
        mode = 'duel'; duelName = team.name; battle = b; V.reset(); ai = null; ui.aim = null; show('battle'); V.resize(); save();
        V.banner = { txt: '對戰 ' + team.name, life: 1.4 };
      } }, { t: '取消' }]);
  };
  $('bQuit').onclick = () => { save(); toTitle(); };
  function startFight() {
    mode = 'run';
    const b = RUN.startBattle(run); if (!b) { run.node = null; show('shop'); renderShop(); return flash('前台至少要放 1 隻'); }
    battle = b; V.reset(); ai = null; ui.aim = null; show('battle'); V.resize(); save();
    if (run.enemy.boss) V.banner = { txt: '首領：' + run.enemy.name, life: 1.6 };
    else if (run.enemy.reward) V.banner = { txt: '打破撲滿！每隻 +' + RD.piggy.goldEach + ' 金', life: 1.6 };
    else if (run.node === 'encounter') V.banner = { txt: '遭遇・' + RD.encounter[run.encLv].name, life: 1.2 };
  }
  function flash(t) { $('info').innerHTML = `<b style="color:#f88">${t}</b>`; }

  // ---------- 戰鬥 ----------
  const cv = $('cv'); V.init(cv);
  const ptr = e => V.toWorld(e.clientX, e.clientY);
  cv.addEventListener('pointerdown', e => {
    if (paused || !battle || battle.phase !== 'aim' || battle.turn !== 0) return;
    const w = ptr(e); let best = null, bd = 1e9;
    battle.bodies.forEach(o => { if (o.alive && !o.temp && o.team === 0 && !o.stunned) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < o.r + 22 && d < bd) { bd = d; best = o; } } });
    if (best) { drag = best.i; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (drag == null) return;
    const w = ptr(e), o = battle.bodies[drag], vx = o.x - w.x, vy = o.y - w.y, len = Math.hypot(vx, vy);
    const was = ui.aim && ui.aim.power >= C.fullPowerAt;
    ui.aim = len < 12 ? null : { idx: drag, angle: Math.atan2(vy, vx), power: Math.min(1, len / 140) };
    if (ui.aim && ui.aim.power >= C.fullPowerAt && !was) try { navigator.vibrate && navigator.vibrate(20); } catch (e) { }
  });
  const up = () => {
    if (drag == null) return;
    if (ui.aim && ui.aim.power > 0.1) FA.battle.launch(battle, ui.aim.idx, ui.aim.angle, ui.aim.power);
    ui.aim = null; drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { ui.aim = null; drag = null; });

  function hud() {
    const b = battle, hp = t => Math.round(FA.battle.hpSum(b, t));
    if (mode === 'duel') run.enemy = { name: '對戰：' + duelName };
    const env = run.env && mode !== 'duel' ? '🌐' + RD.envs[run.env].name : '';
    $('bhud').innerHTML = `位面${run.plane}｜${run.enemy.name}${b.rules.length ? '｜' + b.rules.map(r => D.enemies.ruleText[r]).join('、') : ''}　${env}<br>` +
      `<span style="color:#5cf">我方 ${hp(0)}　剩 ${b.shots[0]} 彈</span>　<span style="color:#f77">敵方 ${hp(1)}　剩 ${b.shots[1]} 彈</span>`;
    ui.msg = run.enemy && run.enemy.reward && b.phase !== 'over' ? `打破撲滿！剩 ${b.shots[0]} 彈` : b.phase === 'over' ? (b.winner === 0 ? '全滅敵人！' : '沒殺光…') : b.phase === 'aim' ? (b.turn === 0 ? '你的回合：按住棋子往後拉（殺光才算贏）' : '敵方瞄準中…') : '';
    ui.msgCol = b.turn === 0 ? '#ffe066' : '#f99';
  }

  function enemyThink(dt) {
    if (!ai) ai = { t: 0, c: null };
    ai.t += dt;
    if (ai.t > 0.45 && !ai.c) {
      const st = mode === 'duel' ? 15 : run.stage + 1 + (run.node === 'encounter' ? RD.encounter[run.encLv].add : 0);
      ai.c = FA.ai.choose(battle, 1, D.enemies.difficulty(st), battle.rng);
      if (!ai.c) { ai = null; return; }
      ui.aim = { idx: ai.c.idx, angle: ai.c.angle, power: ai.c.power, enemy: true };
    }
    if (ai.c && ai.t > 1.25) { FA.battle.launch(battle, ai.c.idx, ai.c.angle, ai.c.power); ui.aim = null; ai = null; }
  }

  function afterShot() {
    save();
    if (battle.phase !== 'over') return;
    const b = battle;
    setTimeout(() => {
      FA.sound.play(b.winner === 0 ? 'win' : 'lose');
      if (mode === 'duel') { battle = null; mode = 'run'; save(); return modal(`<h2>${b.winner === 0 ? '🎉 你贏了' : '💥 你輸了'}</h2>對手：${duelName}`, [{ t: '回商店', cls: 'go', f: () => { show('shop'); renderShop(); } }]); }
      const res = RUN.endBattle(run, b); battle = null; save();
      const loot = res.drops.map(itemText).concat(res.weapons.map(weaponText));
      if (res.node === 'reward') return modal(`<h2>🐷 撲滿 ${res.pigs} 隻</h2>+${res.gold} 金${res.drops.length ? '<br>全破獎勵：' + res.drops.map(itemText).join('<br>') : ''}<br>收入 ${res.income}＋利息 ${res.interest}`, [{ t: '繼續', cls: 'go', f: flow }]);
      modal(`<h2>${res.win ? '🎉 全滅敵人' : '💥 沒殺光'}</h2>` +
        (res.win ? (res.heal ? `小隊 +${res.heal} ❤<br>` : '') : `小隊 -${res.dmg} ❤（剩 ${run.hp}）<br>`) +
        (res.saved ? '<b style="color:#ffe066">🛡 鎖血免死觸發！剩 1 血</b><br>' : '') +
        `收入 ${res.income}＋利息 ${res.interest}${res.streakBonus ? `＋連${run.streak > 0 ? '勝' : '敗'} ${res.streakBonus}` : ''}${res.gold ? `＋戰利 ${res.gold}` : ''}` +
        (loot.length ? '<br>獲得：<br>' + loot.join('<br>') : ''),
        [{ t: '繼續', cls: 'go', f: flow }]);
    }, 900);
  }

  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (screen === 'battle' && battle) {
      if (!paused) {
        if (battle.phase === 'moving') {
          if (V.hitstop > 0) V.hitstop -= dt;
          else {
            acc += dt; let n = 0;
            while (acc >= C.dt && n++ < 16) {
              acc -= C.dt;
              if (FA.battle.step(battle)) { FA.battle.endShot(battle); acc = 0; V.consume(battle); afterShot(); break; }
            }
          }
        } else if (battle.phase === 'aim' && battle.turn === 1) enemyThink(dt);
        if (battle) { V.consume(battle); V.update(dt); }
      }
      if (battle) { hud(); V.draw(battle, ui, paused ? 0 : dt); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 暫停／切出 ----------
  function pause() {
    if (screen !== 'battle' || paused) return;
    paused = true; ui.aim = null; drag = null; save();
    modal('<h2>⏸ 暫停</h2>', [{ t: '繼續', cls: 'go', f: () => { paused = false; last = performance.now(); } }, { t: `音效：${FA.sound.on ? '開' : '關'}`, f: () => { FA.sound.toggle(); paused = false; pause(); } }, { t: '回標題（進度已存）', f: () => { paused = false; toTitle(); } }]);
  }
  $('bPause').onclick = pause;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); pause(); } });
  addEventListener('pagehide', save);

  // ---------- 圖鑑 ----------
  const CODEX = {
    角色: () => Object.keys(D.units).sort((a, b) => D.units[a].cost - D.units[b].cost).map(id => `<div class="choice">${unitInfo({ id, star: 1, items: [], weapon: null })}</div>`).join(''),
    羈絆: () => Object.values(D.traits).map(T => `<div class="choice"><b style="color:${T.color}">${T.name}</b>：${Object.keys(D.units).filter(k => D.units[k].traits.includes(Object.keys(D.traits).find(x => D.traits[x] === T))).map(k => D.units[k].name).join('、')}<br>` + T.tiers.map(t => `${t.n}：${modsText(t.mods)}`).join('<br>') + '</div>').join(''),
    裝備: () => Object.values(D.items).map(I => `<div class="choice"><b>${I.icon}${I.name}</b>${I.recipe ? `（${I.recipe.map(x => D.items[x].name).join('＋')}）` : '（基礎）'}<br>${Object.entries(I.affix).map(([k, v]) => D.modText[k] ? D.modText[k](v[0]) + (v[0] !== v[1] ? '～' + D.modText[k](v[1]).replace(/^[^\d+-]*/, '') : '') : '').join('、')}</div>`).join(''),
    武器: () => Object.keys(D.weapons).map(id => `<div class="choice">${weaponText(id)}</div>`).join(''),
    策略: () => ['silver', 'gold', 'prism'].map(t => Object.values(RD.strategies).filter(S => S.tier === t).map(S => `<div class="choice"><span class="tier" style="color:${RD.tiers[t].color}">${RD.tiers[t].name}</span><b>${S.name}</b><br>${S.desc}</div>`).join('')).join(''),
    環境: () => '<div class="lbl">投資環境：開局選一次，整局都生效</div>' + Object.values(RD.envs).map(E => `<div class="choice"><b>🌐${E.name}</b><br>${E.desc}</div>`).join('') + '<h3>開局詞綴</h3>' + Object.values(RD.openers).map(E => `<div class="choice"><b>${E.name}</b><br>${E.desc}</div>`).join(''),
    節點: () => Object.values(RD.nodeInfo).map(N => `<div class="choice"><b>${N.icon} ${N.name}</b><br>${N.desc}</div>`).join('') + '<div class="lbl">投資策略：開局 1 次、位面 1、2 首領後各 1 次，部分策略會延後再給（期貨）。黃金讓敵人 +6%、稜彩 +20% 且多 1 隻。</div>' +
      '<h3>補給內容</h3>' + Object.values(RD.supplies).map(E => `<div class="choice"><b>${E.name}</b>：${E.desc}</div>`).join(''),
    首領: () => D.enemies.bosses.map((L, i) => L.map(B => `<div class="choice"><b>位面${i + 1}：${B.name}</b><br>生命 ${B.hp}｜攻擊 ${B.atk}<br>${B.rules.map(r => D.enemies.ruleText[r]).join('、')}${B.split ? '、半血分裂' : ''}${B.ability ? '、' + ({ magnetStop: '停下吸附', freezeHit: '撞到冰凍', poisonHit: '撞到下毒', chainHit: '連鎖閃電' }[B.ability.type] || '') : ''}${B.zap ? '、每回合電擊' : ''}</div>`).join('')).join('')
  };
  function codex(tab) {
    tab = tab || '角色';
    $('modalBox').innerHTML = `<h2>📖 圖鑑</h2><div class="traits">${Object.keys(CODEX).map(k => `<span class="tr ${k === tab ? 'act' : ''}" style="${k === tab ? 'background:#ffc531' : ''}" data-tab="${k}">${k}</span>`).join('')}</div><div class="choices">${CODEX[tab]()}</div><button data-close="1">關閉</button>`;
    $('modal').classList.remove('hidden'); $('modalBox').scrollTop = 0;
    $('modalBox').onclick = e => { if (e.target.dataset.tab) codex(e.target.dataset.tab); else if (e.target.dataset.close) $('modal').classList.add('hidden'); };
  }

  // ---------- 標題 ----------
  function toTitle() { battle = null; $('modal').classList.add('hidden'); show('title'); $('btnCont').classList.toggle('hidden', !load()); }
  $('btnCodex').onclick = () => codex();
  $('btnSound').onclick = () => { FA.sound.init(); $('btnSound').textContent = FA.sound.toggle() ? '🔊 音效開' : '🔇 音效關'; };
  $('btnSound').textContent = FA.sound.on ? '🔊 音效開' : '🔇 音效關';
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
    hs = s.hs || null; run = hs ? hs.players[hs.cur].run : s.run; battle = s.battle; mode = s.mode || 'run'; sel = null;
    if (battle) { show('battle'); V.reset(); V.resize(); paused = false; pause(); } else { show('shop'); renderShop(); flow(); }
  };
  toTitle();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
