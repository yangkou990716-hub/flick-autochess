// 敵人：AI 流派、Boss、難度曲線
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.enemies = {
    archetypes: [
      { id: 'blastAI', name: '爆破流', front: ['spark', 'barrel', 'detonator', 'spark', 'bullet', 'barrel'], back: ['barrel', 'medic', 'tesla'] },
      { id: 'magnetAI', name: '磁力流', front: ['magnet', 'ironball', 'magnet', 'bullet', 'ironball', 'detonator'], back: ['tesla', 'medic', 'captain'] },
      { id: 'wallAI', name: '鐵壁流', front: ['shield', 'ironball', 'captain', 'shield', 'barrel', 'ironball'], back: ['medic', 'captain', 'tesla'] }
    ],
    boss: { id: 'ringlord', name: '圓環魔王', hp: 700, atk: 40, mass: 4, r: 42, color: '#b0306e',
      stageScale: 0.12, // 每關 +12% 血與攻
      rules: { 5: ['spikes'], 10: ['shrink'], 15: ['spikes', 'shrink'] },
      minions: 'mixed' },
    ruleText: { spikes: '牆面尖刺：我方撞牆受傷', shrink: '場地縮小：每回合縮圈' },
    // 依關卡算難度
    difficulty: function (stage) {
      return {
        front: Math.min(6, 2 + Math.floor(stage / 3.5)),
        back: stage >= 4 ? (stage >= 9 ? 2 : 1) : 0,
        star2: Math.max(0, Math.min(0.7, (stage - 4) * 0.06)),
        star3: Math.max(0, Math.min(0.3, (stage - 12) * 0.08)),
        itemChance: Math.max(0, Math.min(0.6, (stage - 5) * 0.06)),
        aimNoise: Math.max(0.03, 0.22 - stage * 0.013),
        candidates: 6 + stage * 2
      };
    }
  };
})(globalThis);
