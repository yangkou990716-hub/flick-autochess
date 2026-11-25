// 裝備：affix 為詞條範圍 [min,max]，取得時隨機
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.items = {
    fist: { name: '鐵拳', tier: 'base', icon: '✊', affix: { atkPct: [0.10, 0.20] } },
    spring: { name: '彈簧', tier: 'base', icon: '🌀', affix: { bounce: [1, 1], launchPct: [0.05, 0.12] } },
    charm: { name: '護符', tier: 'base', icon: '🧿', affix: { hpPct: [0.12, 0.25], lifesteal: [0.05, 0.10] } },
    blastspring: { name: '爆裂彈簧', tier: 'adv', icon: '💥', recipe: ['fist', 'spring'],
      affix: { atkPct: [0.15, 0.25], bounce: [1, 1], blastR: [70, 90], blastMult: [0.35, 0.5] } }
  };
})(globalThis);
