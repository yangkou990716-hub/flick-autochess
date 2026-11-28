// 裝備（每隻最多 3 件，只加數值詞條，範圍 [min,max] 隨機）＋ 武器（每隻 1 把，改變彈射行為）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.items = {
    fist: { name: '鐵拳', tier: 'base', icon: '✊', affix: { atkPct: [0.10, 0.20] } },
    spring: { name: '彈簧', tier: 'base', icon: '🌀', affix: { bounces: [1, 1], wallAdd: [0.05, 0.12] } },
    charm: { name: '護符', tier: 'base', icon: '🧿', affix: { hpPct: [0.1, 0.2], lifesteal: [0.05, 0.10] } },
    boots: { name: '疾行靴', tier: 'base', icon: '👟', affix: { speedPct: [0.08, 0.15] } },
    blastspring: { name: '爆裂彈簧', tier: 'adv', icon: '💥', recipe: ['fist', 'spring'],
      affix: { atkPct: [0.12, 0.2], bounces: [1, 1], blastR: [70, 90], blastMult: [0.21, 0.31] } },
    vampfist: { name: '吸血拳', tier: 'adv', icon: '🩸', recipe: ['fist', 'charm'],
      affix: { atkPct: [0.15, 0.22], lifesteal: [0.15, 0.25] } },
    jetboots: { name: '彈射靴', tier: 'adv', icon: '🚀', recipe: ['spring', 'boots'],
      affix: { speedPct: [0.14, 0.20], wallAdd: [0.09, 0.16], bounces: [1, 1] } },
    vampboots: { name: '吸血疾靴', tier: 'adv', icon: '🦇', recipe: ['charm', 'boots'],
      affix: { speedPct: [0.12, 0.2], lifesteal: [0.12, 0.2], hpPct: [0.1, 0.15] } }
  };
  // ---- 道具 ----
  // 消耗品（放在物品欄，點或拖到目標使用）：target unit=角色 / item=裝備 / none=直接打開
  // act: clone 複製 1 星到備戰區（maxCost 費用上限）/ strip 拆回裝備與武器（reusable 可重複用）/ pick 3 選 1 裝備（tier）/ reforge 重骰同階裝備
  FA.DATA.consumables = {
    projector: { name: '員工投影儀', icon: '📽️', target: 'unit', act: 'clone', maxCost: 3, desc: '點 ≤3 費角色：在備戰區做出 1 隻同角色 1 星（不複製裝備）' },
    projectorX: { name: '完美投影儀', icon: '🎞️', target: 'unit', act: 'clone', maxCost: 99, desc: '點任何角色：在備戰區做出 1 隻同角色 1 星（不複製裝備）' },
    wrench: { name: '精密扳手', icon: '🔧', target: 'unit', act: 'strip', reusable: true, desc: '點角色：把裝備＋武器全部拆回物品欄（可重複使用）' },
    wrench1: { name: '拆裝扳手', icon: '🪚', target: 'unit', act: 'strip', reusable: false, desc: '點角色：把裝備＋武器全部拆回物品欄（用一次就沒了）' },
    armory: { name: '簡易武裝箱', icon: '🎁', target: 'none', act: 'pick', pick: 3, tier: 'base', desc: '打開：3 選 1 基礎裝備' },
    armoryP: { name: '特權武裝箱', icon: '💎', target: 'none', act: 'pick', pick: 3, tier: 'adv', desc: '打開：3 選 1 進階裝備' },
    furnace: { name: '冶金爐', icon: '🔥', target: 'item', act: 'reforge', desc: '點 1 件裝備（物品欄或角色身上）：重骰成同階的隨機一件，數值也重骰' }
  };
  // 武器：mods 數值 + fx 特殊效果
  // fx: shieldPierce 無視護盾 / noWallLoss 撞牆不減速 / hitPull 撞到時吸附 / everyN 每 N 次碰撞爆炸 / glide 自身摩擦力倍率 / exposeHit 撞到破甲
  FA.DATA.weapons = {
    spikes: { name: '尖刺殼', icon: '🦔', mods: { atkPct: 0.1 }, fx: { shieldPierce: true }, desc: '攻擊+10%，撞擊無視護盾' },
    ring: { name: '彈力圈', icon: '🛞', mods: { bounces: 1 }, fx: { noWallLoss: true }, desc: '撞牆不減速，撞牆加成可疊+1' },
    glove: { name: '磁鐵手套', icon: '🧲', mods: { atkPct: 0.09 }, fx: { hitPull: { r: 120, pull: 450 } }, desc: '攻擊+9%，撞到敵人時把附近敵人拉過來' },
    dynamite: { name: '炸藥包', icon: '🧨', mods: {}, fx: { everyN: { n: 3, r: 110, mult: 1.05 } }, desc: '每第 3 次碰撞大爆炸' },
    featherW: { name: '輕羽', icon: '🪶', mods: { massPct: -0.3, speedPct: 0.16 }, fx: {}, desc: '重量-30%，速度+16%' },
    needle: { name: '毒針', icon: '💉', mods: {}, fx: { poisonHit: { mult: 0.3, turns: 3 } }, desc: '撞到敵人下毒 3 回合' },
    icepick: { name: '冰錐', icon: '🧊', mods: { atkPct: 0.1 }, fx: { freezeEvery: 2 }, desc: '攻擊+10%，每第 2 次碰撞冰凍對手' },
    rod: { name: '雷擊棒', icon: '⚡', mods: { atkPct: 0.05 }, fx: { chainHit: { n: 1, mult: 0.75, r: 200 } }, desc: '撞到時閃電連鎖 1 隻敵人' },
    hammer: { name: '重錘', icon: '🔨', mods: { massPct: 0.24, atkPct: 0.06 }, fx: {}, desc: '重量+24%，攻擊+6%' },
    hover: { name: '磁浮板', icon: '🛹', mods: { speedPct: 0.12 }, fx: { glide: 0.65 }, desc: '自身摩擦力 -35%，滑更遠；速度+12%' },
    breaker: { name: '破甲鑽', icon: '🪛', mods: {}, fx: { exposeHit: { turns: 2, amp: 0.2 } }, desc: '撞到的敵人受傷 +20%（2 回合）' }
  };
})(globalThis);
