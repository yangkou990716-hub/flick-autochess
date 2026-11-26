// 裝備（每隻最多 3 件，只加數值詞條，範圍 [min,max] 隨機）＋ 武器（每隻 1 把，改變彈射行為）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.items = {
    fist: { name: '鐵拳', tier: 'base', icon: '✊', affix: { atkPct: [0.10, 0.20] } },
    spring: { name: '彈簧', tier: 'base', icon: '🌀', affix: { bounces: [1, 1], wallAdd: [0.05, 0.12] } },
    charm: { name: '護符', tier: 'base', icon: '🧿', affix: { hpPct: [0.12, 0.25], lifesteal: [0.05, 0.10] } },
    boots: { name: '疾行靴', tier: 'base', icon: '👟', affix: { speedPct: [0.08, 0.15] } },
    blastspring: { name: '爆裂彈簧', tier: 'adv', icon: '💥', recipe: ['fist', 'spring'],
      affix: { atkPct: [0.15, 0.25], bounces: [1, 1], blastR: [70, 90], blastMult: [0.35, 0.5] } },
    vampfist: { name: '吸血拳', tier: 'adv', icon: '🩸', recipe: ['fist', 'charm'],
      affix: { atkPct: [0.15, 0.22], lifesteal: [0.15, 0.25] } },
    jetboots: { name: '彈射靴', tier: 'adv', icon: '🚀', recipe: ['spring', 'boots'],
      affix: { speedPct: [0.15, 0.22], wallAdd: [0.1, 0.18], bounces: [1, 1] } },
    vampboots: { name: '吸血疾靴', tier: 'adv', icon: '🦇', recipe: ['charm', 'boots'],
      affix: { speedPct: [0.12, 0.2], lifesteal: [0.12, 0.2], hpPct: [0.1, 0.15] } }
  };
  // 武器：mods 數值 + fx 特殊效果
  // fx: shieldPierce 無視護盾 / noWallLoss 撞牆不減速 / hitPull 撞到時吸附 / everyN 每 N 次碰撞爆炸 / glide 自身摩擦力倍率 / exposeHit 撞到破甲
  FA.DATA.weapons = {
    spikes: { name: '尖刺殼', icon: '🦔', mods: { atkPct: 0.1 }, fx: { shieldPierce: true }, desc: '攻擊+10%，撞擊無視護盾' },
    ring: { name: '彈力圈', icon: '🛞', mods: { bounces: 1 }, fx: { noWallLoss: true }, desc: '撞牆不減速，撞牆加成可疊+1' },
    glove: { name: '磁鐵手套', icon: '🧲', mods: { atkPct: 0.08 }, fx: { hitPull: { r: 120, pull: 450 } }, desc: '攻擊+8%，撞到敵人時把附近敵人拉過來' },
    dynamite: { name: '炸藥包', icon: '🧨', mods: {}, fx: { everyN: { n: 3, r: 110, mult: 0.95 } }, desc: '每第 3 次碰撞大爆炸' },
    featherW: { name: '輕羽', icon: '🪶', mods: { massPct: -0.3, speedPct: 0.12 }, fx: {}, desc: '重量-30%，速度+12%' },
    needle: { name: '毒針', icon: '💉', mods: {}, fx: { poisonHit: { mult: 0.3, turns: 3 } }, desc: '撞到敵人下毒 3 回合' },
    icepick: { name: '冰錐', icon: '🧊', mods: { atkPct: 0.1 }, fx: { freezeEvery: 2 }, desc: '攻擊+10%，每第 2 次碰撞冰凍對手' },
    rod: { name: '雷擊棒', icon: '⚡', mods: { atkPct: 0.05 }, fx: { chainHit: { n: 1, mult: 0.6, r: 200 } }, desc: '撞到時閃電連鎖 1 隻敵人' },
    hammer: { name: '重錘', icon: '🔨', mods: { massPct: 0.4, atkPct: 0.1 }, fx: {}, desc: '重量+40%，攻擊+10%' },
    hover: { name: '磁浮板', icon: '🛹', mods: { speedPct: -0.05 }, fx: { glide: 0.65 }, desc: '自身摩擦力 -35%，滑更遠；速度-5%' },
    breaker: { name: '破甲鑽', icon: '🪛', mods: {}, fx: { exposeHit: { turns: 2, amp: 0.2 } }, desc: '撞到的敵人受傷 +20%（2 回合）' }
  };
})(globalThis);
