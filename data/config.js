// 全域設定（數值都在這裡調）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.config = {
    arenaR: 300, dt: 1 / 120, friction: 1.3, linDecel: 70, stopV: 8, maxSimSec: 8,
    maxLaunch: 1000, dmgSpeedRef: 600, minHitSpeed: 60, wallBonusPer: 0.25, baseBounces: 2,
    restitution: 0.92, wallRest: 0.85,
    turnsEach: 5,
    squadHp: 30, battles: 15, bossEvery: 5,
    startGold: 8, baseIncome: 5, interestPer: 10, interestMax: 5,
    streak: [[2, 1], [4, 2], [6, 3]],
    rerollCost: 2, xpCost: 4, xpGain: 4, xpPerRound: 2,
    levels: [
      { xp: 0, front: 3, back: 2 },
      { xp: 4, front: 4, back: 2 },
      { xp: 12, front: 5, back: 3 },
      { xp: 26, front: 6, back: 3 }
    ],
    odds: [[70, 25, 5, 0, 0], [45, 35, 15, 5, 0], [30, 30, 25, 12, 3], [15, 25, 30, 20, 10]],
    shopSize: 5, benchSize: 6, starMult: [1, 1.8, 3.2], maxItems: 3,
    lossDamage: { base: 2, perEnemy: 1, perStage: 0.2 },
    dropChance: 0.35
  };
})(globalThis);
