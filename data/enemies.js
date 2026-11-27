// 敵人：AI 流派、首領、難度曲線（stage = 第幾個節點，1～17）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.enemies = {
    archetypes: [
      { id: 'blastAI', name: '爆破流', front: ['spark', 'barrel', 'detonator', 'splitter', 'bullet', 'spark'], back: ['barrel', 'medic', 'tesla'] },
      { id: 'magnetAI', name: '磁力流', front: ['magnet', 'jelly', 'ironball', 'magnet', 'blackhole', 'jelly'], back: ['tesla', 'blackhole', 'medic'] },
      { id: 'wallAI', name: '鐵壁流', front: ['shield', 'ironball', 'captain', 'shield', 'spring', 'ironball'], back: ['medic', 'captain', 'tesla'] },
      { id: 'swiftAI', name: '疾風流', front: ['feather', 'boomer', 'spark', 'berserker', 'feather', 'bullet'], back: ['medic', 'tesla', 'barrel'] },
      { id: 'toxicAI', name: '毒素流', front: ['shroom', 'mine', 'vampire', 'shroom', 'thunder', 'vampire'], back: ['medic', 'turret', 'tesla'] },
      { id: 'mechAI', name: '機械流', front: ['drill', 'curler', 'quake', 'comet', 'drill', 'ironball'], back: ['tesla', 'drill', 'turret'] },
      { id: 'bounceAI', name: '彈跳流', front: ['boomer', 'feather', 'splitter', 'spring', 'boomer', 'splitter'], back: ['medic', 'captain', 'tesla'] },
      { id: 'snipeAI', name: '狙擊流', front: ['javelin', 'hawk', 'javelin', 'bullet', 'hawk', 'comet'], back: ['sniper', 'medic', 'tesla'] },
      { id: 'shadeAI', name: '幽影流', front: ['shadow', 'illusion', 'nightmare', 'shadow', 'spider', 'illusion'], back: ['illusion', 'medic', 'sniper'] }
    ],
    // 每個位面一個首領；終局首領會分裂
    // 每個位面 2 種首領隨機出現；ability/zap/split/rules 可自由組合
    bosses: [
      [{ name: '圓環魔王', hp: 665, atk: 40, mass: 4, r: 42, color: '#b0306e', rules: ['spikes'] },
       { name: '毒沼領主', hp: 650, atk: 36, mass: 3.5, r: 40, color: '#558b2f', rules: ['swamp'], ability: { type: 'poisonHit', mult: 0.3, turns: 3 } }],
      [{ name: '磁極女王', hp: 1150, atk: 48, mass: 3.5, r: 40, color: '#3d5afe', rules: ['shrink'], ability: { type: 'magnetStop', r: 260, pull: 600, mult: 0.3 } },
       { name: '冰霜巨獸', hp: 830, atk: 44, mass: 4.5, r: 44, color: '#4fc3f7', rules: ['spikes'], ability: { type: 'freezeHit' } }],
      [{ name: '分裂巨像', hp: 670, atk: 40, mass: 5, r: 48, color: '#6d4c41', rules: ['spikes', 'shrink'], split: { at: 0.5 } },
       { name: '雷霆君王', hp: 690, atk: 38, mass: 3.8, r: 44, color: '#fbc02d', rules: ['shrink'], ability: { type: 'chainHit', n: 3, mult: 0.5, r: 260 }, zap: 1.0 }]
    ],
    ruleText: { spikes: '牆面尖刺：我方撞牆受傷', shrink: '場地縮小：每回合縮圈', swamp: '毒沼：場上有毒池' },
    // ---- 敵人詞綴（參考貨幣戰爭；開局依難度抽，整局生效；tier: soft 較溫和 / hard 較兇）----
    // fx 欄位：plane+hpPct+speedPct 位面強化｜boss:{hpPct,shots} 首領強化｜minion:{hpPct,massPct} 嘍囉強化｜hitSlow 被撞後下一發力道上限 -X
    //   trauma+cap 損血轉最大生命下降｜cheatDeath 第一次將死保留 X 生命（cheatN 每場最多幾隻）｜vsStar1 對 1 星碰撞傷害 +X｜emptySlotDmg 每空裝備格被撞傷害 +X
    //   firstHitSpeed 第一次被撞後速度 +X｜lowHp:{at,atkPct,counter} 低血狂暴反擊｜cleanse:{at,heal} 低血淨化回血｜lava 每回合燒第一個前台（疊加）｜rules 追加場地規則
    affixes: {
      aff_p1: { name: '第一位面強化', desc: '第一位面敵人生命 +20%、速度 +10%', tier: 'soft', fx: { plane: 1, hpPct: 0.2, speedPct: 0.1 } },
      aff_p2: { name: '第二位面強化', desc: '第二位面敵人生命 +25%、速度 +15%', tier: 'soft', fx: { plane: 2, hpPct: 0.25, speedPct: 0.15 } },
      aff_p3: { name: '第三位面強化', desc: '第三位面敵人生命 +30%、速度 +20%', tier: 'soft', fx: { plane: 3, hpPct: 0.3, speedPct: 0.2 } },
      aff_boss: { name: '首領強化', desc: '首領生命 +30%，首領戰敵方多 2 動', tier: 'hard', fx: { boss: { hpPct: 0.3, shots: 1 } } },
      aff_minion: { name: '嘍囉強化', desc: '非首領敵人生命 +20%、重量 +15%', tier: 'soft', fx: { minion: { hpPct: 0.2, massPct: 0.15 } } },
      aff_quake: { name: '沉重腳步', desc: '我方被敵人撞到的角色，下一發力道上限 -20%', tier: 'hard', fx: { hitSlow: 0.2 } },
      aff_trauma: { name: '永久創傷', desc: '我方損失的生命有 30% 變成本場最大生命下降（最多 -40%）', tier: 'hard', fx: { trauma: 0.3, cap: 0.4 } },
      aff_jail: { name: '免死金牌', desc: '每場第一隻將死的敵人保留 10% 生命', tier: 'hard', fx: { cheatDeath: 0.1, cheatN: 1 } },
      aff_bully: { name: '欺弱', desc: '敵人對我方 1 星角色的碰撞傷害 +20%', tier: 'soft', fx: { vsStar1: 0.2 } },
      aff_naked: { name: '空格打擊', desc: '我方角色每空 1 格裝備，被撞傷害 +5%', tier: 'soft', fx: { emptySlotDmg: 0.05 } },
      aff_inertia: { name: '慣性', desc: '敵人第一次被撞後，彈射速度永久 +30%', tier: 'soft', fx: { firstHitSpeed: 0.3 } },
      aff_frenzy: { name: '戰或逃', desc: '敵人生命第一次低於 50% 時攻擊 +30%，並立刻朝最近的我方反衝', tier: 'hard', fx: { lowHp: { at: 0.5, atkPct: 0.3, counter: true } } },
      aff_cleanse: { name: '純淨身心', desc: '敵人第一次低於 50% 生命時，解除中毒與冰凍並回 10% 生命', tier: 'soft', fx: { cleanse: { at: 0.5, heal: 0.1 } } },
      aff_lava: { name: '熔岩轟炸', desc: '我方第一個前台每回合開始受到 3% 生命燒傷（每回合疊加，最多 5 層）', tier: 'hard', fx: { lava: 0.03, lavaMax: 5 } },
      aff_spikes: { name: '尖刺圍欄', desc: '一般戰鬥也有牆面尖刺（我方撞牆受傷）', tier: 'hard', fx: { rules: ['spikes'] } }
    },
    eliteBonus: 3, // 精英 = 難度 +3 關、必帶裝備
    difficulty: function (stage) {
      return {
        front: Math.min(6, 2 + Math.floor(stage / 4)),
        back: stage >= 4 ? (stage >= 10 ? 2 : 1) : 0,
        star2: Math.max(0, Math.min(0.6, (stage - 5) * 0.05)),
        star3: Math.max(0, Math.min(0.2, (stage - 13) * 0.05)),
        itemChance: Math.max(0, Math.min(0.5, (stage - 6) * 0.04)),
        aimNoise: Math.max(0.05, 0.22 - stage * 0.01),
        candidates: 6 + Math.round(stage * 1.5)
      };
    }
  };
})(globalThis);
