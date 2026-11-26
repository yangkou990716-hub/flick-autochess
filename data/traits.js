// 羈絆：同羈絆角色獲得小 buff（只加給有該羈絆的角色）。數量算前台＋後台，同角色只算一次
// mods：blastMul 爆炸傷害 / pullMul 吸力 / shieldPct 開場護盾 / speedPct 速度 / massPct 重量 / hpPct 生命 / wallAdd 每次撞牆加成 / bounces 撞牆加成可疊次數
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  // ---- 羈絆抽獎 ----（C6-1：在觸發時機用戰鬥的可重現亂數抽獎；2 階只開前兩種）
  // on：wall 撞牆（該羈絆角色）／boom 我方爆炸／pull 我方吸附；pool：[獎項, 權重, 數值]
  // 獎項：none 沒中／dmg 本發傷害 +值／stack 本發撞牆加成多 1 層／shot 本隊多 1 發（每場 1 次）／gold +1 金（每場上限，只有玩家）
  const LOT = {
    bounce2: { on: 'wall', pool: [['none', 60], ['dmg', 40, 0.06]] },
    bounce4: { on: 'wall', pool: [['none', 44], ['dmg', 26, 0.08], ['stack', 16], ['shot', 7], ['gold', 7]] },
    blast2: { on: 'boom', pool: [['none', 60], ['dmg', 40, 0.06]] },
    blast4: { on: 'boom', pool: [['none', 48], ['dmg', 26, 0.08], ['stack', 14], ['shot', 6], ['gold', 6]] },
    blast6: { on: 'boom', pool: [['none', 36], ['dmg', 30, 0.1], ['stack', 16], ['shot', 9], ['gold', 9]] },
    magnet2: { on: 'pull', pool: [['none', 55], ['dmg', 45, 0.06]] },
    magnet4: { on: 'pull', pool: [['none', 40], ['dmg', 28, 0.08], ['stack', 16], ['shot', 8], ['gold', 8]] }
  };
  FA.DATA.lotteryRules = { perShot: 2, goldCap: 2, shotCap: 1, name: { none: '沒中', dmg: '本發傷害', stack: '撞牆加成多 1 層', shot: '大獎！多 1 發', gold: '特別獎 +1 金' }, onName: { wall: '撞牆', boom: '爆炸', pull: '吸附' } };
  FA.DATA.traits = {
    blast: { name: '爆破', color: '#ff6b3d', tiers: [{ n: 2, mods: { blastMul: 0.1 }, lottery: LOT.blast2 }, { n: 4, mods: { blastMul: 0.2 }, lottery: LOT.blast4 }, { n: 6, mods: { blastMul: 0.3 }, lottery: LOT.blast6 }] },
    magnet: { name: '磁力', color: '#6b8cff', tiers: [{ n: 2, mods: { pullMul: 0.3, atkPct: 0.1 }, lottery: LOT.magnet2 }, { n: 4, mods: { pullMul: 0.7, atkPct: 0.12 }, lottery: LOT.magnet4 }] },
    wall: { name: '鐵壁', color: '#7fbf5a', tiers: [{ n: 2, mods: { shieldPct: 0.12 } }, { n: 4, mods: { shieldPct: 0.16 } }, { n: 6, mods: { shieldPct: 0.3 } }] },
    swift: { name: '疾風', color: '#7fe3ff', tiers: [{ n: 2, mods: { speedPct: 0.05 } }, { n: 4, mods: { speedPct: 0.08 } }] },
    heavy: { name: '重裝', color: '#b08d57', tiers: [{ n: 2, mods: { massPct: 0.2, hpPct: 0.1 } }, { n: 4, mods: { massPct: 0.4, hpPct: 0.2 } }] },
    toxic: { name: '毒素', color: '#9ccc65', tiers: [{ n: 2, mods: { poisonMul: 0.6, hpPct: 0.08 } }, { n: 3, mods: { poisonMul: 0.8, hpPct: 0.1 } }] },
    mech: { name: '機械', color: '#90a4ae', tiers: [{ n: 2, mods: { atkPct: 0.1, massPct: 0.1 } }, { n: 4, mods: { atkPct: 0.12, massPct: 0.2, hpPct: 0.05 } }] },
    bounce: { name: '彈跳', color: '#2ec4b6', tiers: [{ n: 2, mods: { wallAdd: 0.15 }, lottery: LOT.bounce2 }, { n: 4, mods: { wallAdd: 0.3, bounces: 2 }, lottery: LOT.bounce4 }] }
  };
  // 大招：角色依第一個羈絆決定（units 可用 ult 欄位覆蓋）
  FA.DATA.traitUlt = { blast: 'nova', magnet: 'vortex', wall: 'bulwark', swift: 'phase', heavy: 'quake', toxic: 'plague', bounce: 'ricochet', mech: 'overdrive' };
  FA.DATA.ults = {
    nova: { name: '核爆衝擊', desc: '第一次撞到敵人時引發大爆炸（1.6 倍攻擊）' },
    vortex: { name: '黑洞漩渦', desc: '停下時把大範圍敵人吸過來並造成傷害' },
    bulwark: { name: '鐵壁號令', desc: '全隊獲得 30% 生命護盾，本發自己重量 ×3' },
    phase: { name: '疾影穿梭', desc: '速度 ×1.35，穿過所有敵人並造成傷害' },
    quake: { name: '震天撼地', desc: '撞到的敵人被大力震飛並冰凍' },
    plague: { name: '瘟疫', desc: '停下時讓周圍所有敵人中毒' },
    ricochet: { name: '無限反彈', desc: '本發每次撞牆加成 +50%，可多疊 6 層' },
    overdrive: { name: '超載', desc: '停下後自動高速衝向最近的敵人' },
    heal: { name: '聖光衝刺', desc: '速度 ×1.2，碰到的隊友回復 40% 生命' }
  };
  // ---- 陣營 ----（C6-2 第二條軸：經濟／規則加成，和流派的戰鬥數值分開；計數同流派：前台＋後台、同角色算一次）
  // fx：drop 戰後掉基礎裝備機率 / gold 戰後金幣 / shots 每場多幾發 / firstMul 每場第一發沒先撞牆時的碰撞傷害倍率
  //     rerollOff 商店刷新費 -值 / nodeReroll 每節點免費刷新 / lossRed 戰敗扣血 -值 / winHeal 勝利多回血
  FA.DATA.factions = {
    workshop: { name: '工坊', icon: '🔧', color: '#ffb74d', members: ['spark', 'barrel', 'ironball', 'turret', 'mine', 'detonator', 'drill'],
      tiers: [{ n: 3, fx: { drop: 0.25 }, desc: '每場戰鬥後 25% 機率得 1 件基礎裝備' }, { n: 5, fx: { drop: 0.5, gold: 1 }, desc: '每場戰鬥後 50% 機率得 1 件基礎裝備，並 +1 金' }] },
    circus: { name: '馬戲團', icon: '🎪', color: '#f06292', members: ['feather', 'boomer', 'spring', 'splitter', 'thunder', 'curler'],
      tiers: [{ n: 3, fx: { shots: 1, firstMul: 0.8 }, desc: '每場多 1 發；但第一發要先撞牆，否則碰撞傷害 -20%' }, { n: 5, fx: { shots: 2, firstMul: 0.8 }, desc: '每場多 2 發；但第一發要先撞牆，否則碰撞傷害 -20%' }] },
    lab: { name: '研究所', icon: '🧪', color: '#4dd0e1', members: ['magnet', 'jelly', 'tesla', 'icy', 'blackhole', 'shroom', 'comet'],
      tiers: [{ n: 3, fx: { rerollOff: 1 }, desc: '商店刷新費 -1' }, { n: 5, fx: { rerollOff: 1, nodeReroll: 1 }, desc: '商店刷新費 -1，每個節點 +1 次免費刷新' }] },
    guard: { name: '衛隊', icon: '🛡', color: '#aed581', members: ['shield', 'medic', 'captain', 'berserker', 'vampire', 'angel', 'bullet', 'quake'],
      tiers: [{ n: 3, fx: { lossRed: 2 }, desc: '戰敗扣血 -2' }, { n: 5, fx: { lossRed: 4, winHeal: 1 }, desc: '戰敗扣血 -4，勝利多回 1 血' }] }
  };
  for (const k in FA.DATA.factions) FA.DATA.factions[k].members.forEach(id => { if (FA.DATA.units && FA.DATA.units[id]) FA.DATA.units[id].faction = k; });

  // ---- 徽章 ----（裝備的一種，佔 1 格；穿上的角色多 1 個該羈絆（計數 +1）＋小數值。run.js 會併進 items，tier:'emblem'）
  const EMB = { blast: { blastMul: 0.05 }, magnet: { pullMul: 0.1 }, wall: { shieldPct: 0.04 }, swift: { speedPct: 0.04 }, heavy: { massPct: 0.08 }, toxic: { poisonMul: 0.1 }, mech: { atkPct: 0.04 }, bounce: { wallAdd: 0.04 } };
  FA.DATA.emblems = {};
  for (const k in EMB) {
    const affix = {}; for (const m in EMB[k]) affix[m] = [EMB[k][m], EMB[k][m]];
    FA.DATA.emblems['emblem_' + k] = { name: FA.DATA.traits[k].name + '徽章', tier: 'emblem', icon: '🎖', addTrait: k, affix };
  }

  // 詞條顯示名稱（羈絆、裝備、武器、策略共用）
  const p = v => Math.round(v * 100) + '%', s = v => (v < 0 ? '' : '+');
  FA.DATA.modText = {
    atkPct: v => `攻擊${s(v)}${p(v)}`, hpPct: v => `生命${s(v)}${p(v)}`, speedPct: v => `速度${s(v)}${p(v)}`, massPct: v => `重量${s(v)}${p(v)}`,
    blastMul: v => `爆炸傷害+${p(v)}`, pullMul: v => `吸力+${p(v)}`, shieldPct: v => `開場護盾 ${p(v)} 生命`, wallAdd: v => `每次撞牆加成+${p(v)}`,
    bounces: v => `撞牆加成可疊+${v}`, poisonMul: v => `毒傷+${p(v)}`, lifesteal: v => `吸血${p(v)}`, blastR: v => `撞擊爆炸範圍${v}`, blastMult: v => `撞擊爆炸${p(v)}攻擊`
  };
})(globalThis);
