// 羈絆：同羈絆角色獲得小 buff（只加給有該羈絆的角色）。數量算前台＋後台，同角色只算一次
// mods：blastMul 爆炸傷害 / pullMul 吸力 / shieldPct 開場護盾 / speedPct 速度 / massPct 重量 / hpPct 生命 / wallAdd 每次撞牆加成 / bounces 撞牆加成可疊次數
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.traits = {
    blast: { name: '爆破', color: '#ff6b3d', tiers: [{ n: 2, mods: { blastMul: 0.1 } }, { n: 4, mods: { blastMul: 0.2 } }, { n: 6, mods: { blastMul: 0.3 } }] },
    magnet: { name: '磁力', color: '#6b8cff', tiers: [{ n: 2, mods: { pullMul: 0.3, atkPct: 0.1 } }, { n: 4, mods: { pullMul: 0.7, atkPct: 0.12 } }] },
    wall: { name: '鐵壁', color: '#7fbf5a', tiers: [{ n: 2, mods: { shieldPct: 0.12 } }, { n: 4, mods: { shieldPct: 0.16 } }, { n: 6, mods: { shieldPct: 0.3 } }] },
    swift: { name: '疾風', color: '#7fe3ff', tiers: [{ n: 2, mods: { speedPct: 0.05 } }, { n: 4, mods: { speedPct: 0.08 } }] },
    heavy: { name: '重裝', color: '#b08d57', tiers: [{ n: 2, mods: { massPct: 0.2, hpPct: 0.1 } }, { n: 4, mods: { massPct: 0.4, hpPct: 0.2 } }] },
    toxic: { name: '毒素', color: '#9ccc65', tiers: [{ n: 2, mods: { poisonMul: 0.6, hpPct: 0.08 } }, { n: 3, mods: { poisonMul: 0.8, hpPct: 0.1 } }] },
    mech: { name: '機械', color: '#90a4ae', tiers: [{ n: 2, mods: { atkPct: 0.1, massPct: 0.1 } }, { n: 4, mods: { atkPct: 0.12, massPct: 0.2, hpPct: 0.05 } }] },
    bounce: { name: '彈跳', color: '#2ec4b6', tiers: [{ n: 2, mods: { wallAdd: 0.15 } }, { n: 4, mods: { wallAdd: 0.3, bounces: 2 } }] }
  };
  // 詞條顯示名稱（羈絆、裝備、武器、策略共用）
  const p = v => Math.round(v * 100) + '%', s = v => (v < 0 ? '' : '+');
  FA.DATA.modText = {
    atkPct: v => `攻擊${s(v)}${p(v)}`, hpPct: v => `生命${s(v)}${p(v)}`, speedPct: v => `速度${s(v)}${p(v)}`, massPct: v => `重量${s(v)}${p(v)}`,
    blastMul: v => `爆炸傷害+${p(v)}`, pullMul: v => `吸力+${p(v)}`, shieldPct: v => `開場護盾 ${p(v)} 生命`, wallAdd: v => `每次撞牆加成+${p(v)}`,
    bounces: v => `撞牆加成可疊+${v}`, poisonMul: v => `毒傷+${p(v)}`, lifesteal: v => `吸血${p(v)}`, blastR: v => `撞擊爆炸範圍${v}`, blastMult: v => `撞擊爆炸${p(v)}攻擊`
  };
})(globalThis);
