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
  // 詞條顯示名稱（羈絆、裝備、武器、策略共用）
  const p = v => Math.round(v * 100) + '%', s = v => (v < 0 ? '' : '+');
  FA.DATA.modText = {
    atkPct: v => `攻擊${s(v)}${p(v)}`, hpPct: v => `生命${s(v)}${p(v)}`, speedPct: v => `速度${s(v)}${p(v)}`, massPct: v => `重量${s(v)}${p(v)}`,
    blastMul: v => `爆炸傷害+${p(v)}`, pullMul: v => `吸力+${p(v)}`, shieldPct: v => `開場護盾 ${p(v)} 生命`, wallAdd: v => `每次撞牆加成+${p(v)}`,
    bounces: v => `撞牆加成可疊+${v}`, poisonMul: v => `毒傷+${p(v)}`, lifesteal: v => `吸血${p(v)}`, blastR: v => `撞擊爆炸範圍${v}`, blastMult: v => `撞擊爆炸${p(v)}攻擊`
  };
})(globalThis);
