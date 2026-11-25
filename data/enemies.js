// 敵人：AI 流派、首領、難度曲線（stage = 第幾個節點，1～17）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.enemies = {
    archetypes: [
      { id: 'blastAI', name: '爆破流', front: ['spark', 'barrel', 'detonator', 'splitter', 'bullet', 'spark'], back: ['barrel', 'medic', 'tesla'] },
      { id: 'magnetAI', name: '磁力流', front: ['magnet', 'jelly', 'ironball', 'magnet', 'blackhole', 'jelly'], back: ['tesla', 'blackhole', 'medic'] },
      { id: 'wallAI', name: '鐵壁流', front: ['shield', 'ironball', 'captain', 'shield', 'spring', 'ironball'], back: ['medic', 'captain', 'tesla'] },
      { id: 'swiftAI', name: '疾風流', front: ['feather', 'boomer', 'spark', 'berserker', 'feather', 'bullet'], back: ['medic', 'tesla', 'barrel'] },
      { id: 'bounceAI', name: '彈跳流', front: ['boomer', 'feather', 'splitter', 'spring', 'boomer', 'splitter'], back: ['medic', 'captain', 'tesla'] }
    ],
    // 每個位面一個首領；終局首領會分裂
    bosses: [
      { name: '圓環魔王', hp: 650, atk: 40, mass: 4, r: 42, color: '#b0306e', rules: ['spikes'] },
      { name: '磁極女王', hp: 900, atk: 46, mass: 3.5, r: 40, color: '#3d5afe', rules: ['shrink'],
        ability: { type: 'magnetStop', r: 260, pull: 600, mult: 0.3 } },
      { name: '分裂巨像', hp: 1250, atk: 52, mass: 5, r: 48, color: '#6d4c41', rules: ['spikes', 'shrink'], split: { at: 0.5 } }
    ],
    ruleText: { spikes: '牆面尖刺：我方撞牆受傷', shrink: '場地縮小：每回合縮圈' },
    eliteBonus: 3, // 精英 = 難度 +3 關、必帶裝備
    difficulty: function (stage) {
      return {
        front: Math.min(6, 2 + Math.floor(stage / 4)),
        back: stage >= 4 ? (stage >= 10 ? 2 : 1) : 0,
        star2: Math.max(0, Math.min(0.7, (stage - 4) * 0.06)),
        star3: Math.max(0, Math.min(0.3, (stage - 12) * 0.07)),
        itemChance: Math.max(0, Math.min(0.6, (stage - 5) * 0.05)),
        aimNoise: Math.max(0.03, 0.22 - stage * 0.012),
        candidates: 6 + stage * 2
      };
    }
  };
})(globalThis);
