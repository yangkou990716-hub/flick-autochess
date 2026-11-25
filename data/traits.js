// 羈絆：數量算前台＋後台（同角色只算一次）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.traits = {
    blast: { name: '爆破', color: '#ff6b3d',
      desc: ['2：爆破角色撞到敵人時小爆炸', '4：爆炸會連鎖'], counter: '剋聚集；怕護盾（護盾擋爆炸效率 2 倍）',
      tiers: [{ n: 2, r: 70, mult: 0.35 }, { n: 4, r: 80, mult: 0.32, chain: true }] },
    magnet: { name: '磁力', color: '#6b8cff',
      desc: ['2：磁力角色撞到敵人時把附近敵人吸過來並造成傷害', '4：範圍變大並暈眩（下回合不能彈）'], counter: '剋分散；怕高速（高速中的目標吸不動）',
      tiers: [{ n: 2, r: 150, pull: 500, dmg: 0.15 }, { n: 4, r: 230, pull: 650, dmg: 0.2, stun: true }] },
    wall: { name: '鐵壁', color: '#7fbf5a',
      desc: ['2：前台全員開場護盾', '4：護盾破裂時反彈傷害'], counter: '剋爆破；怕穿透',
      tiers: [{ n: 2, shieldPct: 0.2 }, { n: 4, shieldPct: 0.22, breakReflect: 30 }] }
  };
})(globalThis);
