// 介面流程：標題 → 商店 → 戰鬥 → 結算；存檔、暫停、輸入
(function () {
  const FA = globalThis.FA, D = FA.DATA, C = D.config, V = FA.view, RUN = FA.run;
  const $ = id => document.getElementById(id), KEY = 'flick_autochess_save_v1';
  let run = null, battle = null, sel = null, screen = 'title', paused = false, ai = null, drag = null;
  const ui = { aim: null, msg: '' };

  // ---------- 存檔 ----------
  const save = () => { try { if (run) localStorage.setItem(KEY, JSON.stringify({ run, battle })); } catch (e) { } };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const clearSave = () => { try { localStorage.removeItem(KEY); } catch (e) { } };

  function show(id) { screen = id; ['title', 'shop', 'battle'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
  function modal(html, btns) {
    $('modalBox').innerHTML = html + btns.map((b, i) => `<button data-m="${i}" class="${b.cls || ''}">${b.t}</button>`).join('');
    $('modal').classList.remove('hidden');
    $('modalBox').onclick = e => { const i = e.target.dataset.m; if (i == null) return; $('modal').classList.add('hidden'); btns[i].f && btns[i].f(); };
  }

  // ---------- 文字說明 ----------
  const pct = v => Math.round(v * 100) + '%';
  const AFX = { atkPct: v => '攻擊+' + pct(v), hpPct: v => '生命+' + pct(v), bounce: v => '反彈加成+' + v, launchPct: v => '速度+' + pct(v), lifesteal: v => '吸血' + pct(v), blastR: v => '爆炸範圍' + v, blastMult: v => '爆炸傷害' + pct(v) };
  const itemText = it => `${D.items[it.id].icon}${D.items[it.id].name}（${Object.entries(it.rolls).map(([k, v]) => AFX[k](v)).join('、')}）`;
  function backText(U) {
    const b = U.back; if (!b) return '';
    return { atkPct: `${b.trait ? D.traits[b.trait].name + '角色' : '前台'}攻擊+${pct(b.val)}`, shield: `每回合前台護盾+${b.val}`, heal: `每回合前台回血+${b.val}`, bounce: `前台反彈加成次數+${b.val}`, launchPct: `前台速度+${pct(b.val)}` }[b.type];
  }
  function frontText(U) { const f = U.front; if (!f || U.role !== 'both') return ''; return f.type === 'thorns' ? `反傷 ${pct(f.val)}` : `陣亡時大爆炸`; }
  function unitInfo(u) {
    const U = D.units[u.id], m = C.starMult[u.star - 1];
    const role = { front: '前台', back: '後台', both: '兩用（站位賦能）' }[U.role];
    let s = `<b>${U.name} ${'★'.repeat(u.star)}</b>　<span class="k">${U.cost}費</span>　${U.traits.map(t => D.traits[t].name).join('・')}　${role}<br>`;
    s += `生命 ${Math.round(U.hp * m)}　攻擊 ${Math.round(U.atk * m)}　重量 ${U.mass}${U.pierce ? '　穿透' : ''}<br>`;
    if (frontText(U)) s += `<span class="k">前台：</span>${frontText(U)}<br>`;
    if (backText(U)) s += `<span class="k">後台：</span>${backText(U)}<br>`;
    if (U.link) s += `<span class="k">聯動：</span>撞到${D.units[U.link.with].name} →「${U.link.combo.name}」<br>`;
    if (u.items.length) s += u.items.map(itemText).join('<br>') + '<br>';
    return s;
  }

  // ---------- 商店畫面 ----------
  function renderShop() {
    const lv = RUN.lv(run), boss = RUN.isBoss(run.stage);
    $('tStage').textContent = `第 ${run.stage}/${C.battles} 戰${boss ? ' 👑' : ''}`;
    $('tHp').textContent = `❤ ${run.hp}`; $('tGold').textContent = `💰 ${run.gold}`;
    const nx = C.levels[run.level]; $('tLv').textContent = `Lv${run.level}${nx ? ` (${run.xp}/${nx.xp})` : ''}`;
    $('enemyInfo').textContent = boss ? `下一戰 BOSS：${D.enemies.boss.name}｜${(D.enemies.boss.rules[run.stage] || ['spikes', 'shrink']).map(r => D.enemies.ruleText[r]).join('、')}` :
      (run.streak ? (run.streak > 0 ? `連勝 ${run.streak}` : `連敗 ${-run.streak}`) : '') + `　利息 +${Math.min(C.interestMax, Math.floor(run.gold / C.interestPer))}`;
    const onTeam = run.front.slice(0, lv.front).concat(run.back.slice(0, lv.back)).filter(Boolean).map(u => u.id);
    const tt = FA.battle.traitTiers(onTeam);
    $('traits').innerHTML = Object.keys(D.traits).map(k => {
      const T = D.traits[k], n = tt.counts[k] || 0, a = tt.active[k];
      return `<span class="tr ${a ? 'act' : ''}" style="${a ? 'background:' + T.color : ''}" data-tr="${k}">${T.name} ${n}/${(T.tiers.find(t => t.n > n) || T.tiers[T.tiers.length - 1]).n}</span>`;
    }).join('');
    ['front', 'back', 'bench'].forEach(z => {
      const lim = z === 'front' ? lv.front : z === 'back' ? lv.back : C.benchSize;
      $(z).innerHTML = run[z].map((u, i) => {
        const isSel = sel && sel.zone === z && sel.i === i;
        return `<div class="slot ${i >= lim ? 'lock' : ''} ${isSel ? 'sel' : ''} ${sel && sel.zone && !isSel && i < lim ? 'tgt' : ''}" data-z="${z}" data-i="${i}">${u ? unitHTML(u) : (i >= lim ? '🔒' : '')}</div>`;
      }).join('');
    });
    $('items').innerHTML = run.items.length ? run.items.map((it, i) => `<span class="item ${sel && sel.item === i ? 'sel' : ''}" data-it="${i}">${D.items[it.id].icon}${D.items[it.id].name}</span>`).join('') : '<span class="lbl">裝備：贏得戰鬥有機會掉落</span>';
    let info = '';
    if (sel && sel.zone && RUN.unitAt(run, sel)) { const u = RUN.unitAt(run, sel); info = unitInfo(u) + `<button id="bSell">賣出 +${RUN.sellPrice(u)}</button>　<span class="lbl">點空位移動／點其他角色交換</span>`; }
    else if (sel && sel.item != null) info = itemText(run.items[sel.item]) + '<br><span class="lbl">點角色裝上。鐵拳＋彈簧＝爆裂彈簧</span>';
    else if (sel && sel.trait) { const T = D.traits[sel.trait]; info = `<b>${T.name}</b><br>${T.desc.join('<br>')}<br><span class="k">${T.counter}</span>`; }
    else info = '<span class="lbl">點商店卡片購買；點角色查看／移動；3 隻同角色同星自動升星。<br>前台人數隨等級增加（3→6）。</span>';
    $('info').innerHTML = info;
    $('shopRow').innerHTML = run.shop.map((id, i) => {
      if (!id) return `<div class="card empty"></div>`;
      const U = D.units[id], cc = ['#888', '#3fb950', '#4ea0ff', '#b072ff', '#ffb000'][U.cost - 1];
      return `<div class="card" data-b="${i}" style="border-color:${cc}"><div class="dot" style="background:${U.color}"></div>${U.name}<div class="c">${U.cost}💰</div><div class="t">${U.traits.map(t => D.traits[t].name).join('・')}</div></div>`;
    }).join('');
    $('bReroll').disabled = run.gold < C.rerollCost; $('bXp').disabled = run.gold < C.xpCost || run.level >= C.levels.length;
    $('bLock').classList.toggle('on', run.locked); $('bLock').textContent = run.locked ? '已鎖定' : '鎖定';
  }
  function unitHTML(u) {
    const U = D.units[u.id];
    return `<div class="u" style="background:${U.color}"><span>${U.name}</span><span class="st">${'★'.repeat(u.star)}</span>${u.items.length ? `<span class="it">${u.items.map(i => D.items[i.id].icon).join('')}</span>` : ''}</div>`;
  }

  $('shop').addEventListener('click', e => {
    const t = e.target.closest('[data-z],[data-it],[data-b],[data-tr],#bSell'); if (!t) return;
    if (t.id === 'bSell') { RUN.sell(run, sel); sel = null; }
    else if (t.dataset.b != null) { if (!RUN.buy(run, +t.dataset.b)) flash('金幣或空位不足'); }
    else if (t.dataset.it != null) { const i = +t.dataset.it; sel = sel && sel.item === i ? null : { item: i }; }
    else if (t.dataset.tr) sel = { trait: t.dataset.tr };
    else {
      const loc = { zone: t.dataset.z, i: +t.dataset.i }, u = RUN.unitAt(run, loc);
      if (sel && sel.item != null) { if (u) { const r = RUN.equip(run, sel.item, loc); if (!r) flash('最多 3 件裝備'); else if (r === 'combine') flash('合成爆裂彈簧！'); sel = null; } }
      else if (sel && sel.zone) { if (sel.zone === loc.zone && sel.i === loc.i) sel = null; else { RUN.move(run, sel, loc); sel = u ? null : null; } }
      else if (u) sel = loc;
    }
    renderShop(); save();
  });
  $('bReroll').onclick = () => { RUN.reroll(run); renderShop(); save(); };
  $('bLock').onclick = () => { run.locked = !run.locked; renderShop(); save(); };
  $('bXp').onclick = () => { RUN.buyXp(run); renderShop(); save(); };
  $('bFight').onclick = () => {
    const b = RUN.startBattle(run); if (!b) return flash('前台至少要放 1 隻');
    battle = b; sel = null; V.reset(); ai = null; ui.aim = null; show('battle'); V.resize(); save();
    if (run.enemy.boss) V.banner = { txt: 'BOSS：' + run.enemy.name, life: 1.6 };
  };
  function flash(t) { V.banner = null; const el = $('info'); el.innerHTML = `<b style="color:#f88">${t}</b>`; }

  // ---------- 戰鬥 ----------
  const cv = $('cv'); V.init(cv);
  const ptr = e => V.toWorld(e.clientX, e.clientY);
  cv.addEventListener('pointerdown', e => {
    if (paused || !battle || battle.phase !== 'aim' || battle.turn !== 0) return;
    const w = ptr(e); let best = null, bd = 1e9;
    battle.bodies.forEach(o => { if (o.alive && o.team === 0 && !o.stunned) { const d = Math.hypot(o.x - w.x, o.y - w.y); if (d < o.r + 22 && d < bd) { bd = d; best = o; } } });
    if (best) { drag = best.i; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (drag == null) return;
    const w = ptr(e), o = battle.bodies[drag], vx = o.x - w.x, vy = o.y - w.y, len = Math.hypot(vx, vy);
    ui.aim = len < 12 ? null : { idx: drag, angle: Math.atan2(vy, vx), power: Math.min(1, len / 140) };
  });
  const up = () => {
    if (drag == null) return;
    if (ui.aim && ui.aim.power > 0.1) FA.battle.launch(battle, ui.aim.idx, ui.aim.angle, ui.aim.power);
    ui.aim = null; drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { ui.aim = null; drag = null; });

  function hud() {
    const b = battle, hp = t => Math.round(FA.battle.hpSum(b, t));
    $('bhud').innerHTML = `第 ${run.stage} 戰｜${run.enemy.name}${b.rules.length ? '｜' + b.rules.map(r => D.enemies.ruleText[r]).join('、') : ''}<br>` +
      `<span style="color:#5cf">我方 ${hp(0)}　剩 ${b.shots[0]} 彈</span>　<span style="color:#f77">敵方 ${hp(1)}　剩 ${b.shots[1]} 彈</span>`;
    ui.msg = b.phase === 'over' ? (b.winner === 0 ? '勝利！' : '落敗…') : b.phase === 'aim' ? (b.turn === 0 ? '你的回合：按住棋子往後拉' : '敵方瞄準中…') : '';
    ui.msgCol = b.turn === 0 ? '#ffe066' : '#f99';
  }

  function enemyThink(dt) {
    if (!ai) ai = { t: 0, c: null };
    ai.t += dt;
    if (ai.t > 0.45 && !ai.c) {
      ai.c = FA.ai.choose(battle, 1, D.enemies.difficulty(run.stage), battle.rng);
      if (!ai.c) { ai = null; return; }
      ui.aim = { idx: ai.c.idx, angle: ai.c.angle, power: ai.c.power, enemy: true };
    }
    if (ai.c && ai.t > 1.25) { FA.battle.launch(battle, ai.c.idx, ai.c.angle, ai.c.power); ui.aim = null; ai = null; }
  }

  function afterShot() {
    save();
    if (battle.phase === 'over') {
      const b = battle;
      setTimeout(() => {
        const res = RUN.endBattle(run, b); battle = null; save();
        const drops = res.drops.length ? '<br>掉落：' + res.drops.map(itemText).join('<br>') : '';
        modal(`<h2>${res.win ? '🎉 勝利' : '💥 落敗'}</h2>${res.win ? '' : `小隊 -${res.dmg} ❤（剩 ${run.hp}）<br>`}` +
          `收入 ${res.income}＋利息 ${res.interest}＋連${run.streak > 0 ? '勝' : '敗'} ${res.streakBonus}${res.winBonus ? '＋勝利 1' : ''}${drops}`,
          [{ t: '繼續', cls: 'go', f: () => {
            if (run.over) {
              const won = run.over === 'win'; clearSave();
              modal(`<h2>${won ? '🏆 通關！' : '☠ 小隊全滅'}</h2>打到第 ${Math.min(run.stage, C.battles)} 戰`, [{ t: '回標題', f: toTitle }]);
            } else { show('shop'); renderShop(); }
          } }]);
      }, 900);
    }
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
        V.consume(battle); V.update(dt);
      }
      hud(); V.draw(battle, ui, paused ? 0 : dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 暫停／切出 ----------
  function pause() {
    if (screen !== 'battle' || paused) return;
    paused = true; ui.aim = null; drag = null; save();
    modal('<h2>⏸ 暫停</h2>', [{ t: '繼續', cls: 'go', f: () => { paused = false; last = performance.now(); } }, { t: '回標題（進度已存）', f: () => { paused = false; toTitle(); } }]);
  }
  $('bPause').onclick = pause;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); pause(); } });
  addEventListener('pagehide', save);

  // ---------- 標題 ----------
  function toTitle() { battle = null; show('title'); $('btnCont').classList.toggle('hidden', !load()); }
  $('btnNew').onclick = () => {
    const go = () => { run = RUN.newRun((Date.now() ^ (Math.random() * 1e9)) | 0); battle = null; sel = null; save(); show('shop'); renderShop(); };
    if (load()) modal('<h2>開新局？</h2>目前進度會被覆蓋', [{ t: '開新局', cls: 'go', f: go }, { t: '取消' }]); else go();
  };
  $('btnCont').onclick = () => {
    const s = load(); if (!s) return;
    run = s.run; battle = s.battle; sel = null;
    if (battle) { show('battle'); V.reset(); V.resize(); paused = false; pause(); } else { show('shop'); renderShop(); }
  };
  toTitle();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
