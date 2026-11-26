// 全域設定（數值都在這裡調）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.config = {
    arenaR: 300, dt: 1 / 120, friction: 0.75, linDecel: 35, stopV: 6, maxSimSec: 12,
    maxLaunch: 1000, dmgSpeedRef: 400, hpMul: 1.6, minHitSpeed: 60, wallBonusPer: 0.25, baseBounces: 2,
    // hpMul：全體（含首領）生命倍率，拉長每場發數
    restitution: 0.97, wallRest: 0.95,
    fullPowerAt: 0.95, fullPowerBonus: 0.15, // 力道：拉滿 95% 以上為「全力」，速度 +15%
    turnsEach: 5, roundsEach: 2, bossRoundsAdd: 1,
    // 戰鬥規則（參考豹豹碰碰大作戰）：一輪內雙方交替、每隻都動一次才換輪；雙方各有總動數，每彈一次 -1，
    // 棋子被打倒在出生點滿血復活但該方動數再扣 deathCost；對方動數先歸零就贏
    movesEach: 12, bossMovesAdd: 4, deathCost: 3, bossDeathCost: 6, spikeWall: 0.04, // spikeWall：牆面尖刺規則每次撞牆扣最大生命比例
    arena: { w: 560, h: 840 }, // 直式長方形場地（世界座標）
    // 障礙柱：[x(半寬比例), y(半高比例), 半徑(半寬比例), ring 泳圈柱加速加攻 / spike 尖刺柱受傷]
    pillarLayouts: [
      [[-0.55, 0, 0.08, 'ring'], [0.55, 0, 0.08, 'ring']],
      [[0, 0, 0.1, 'spike'], [-0.6, -0.22, 0.07, 'ring'], [0.6, 0.22, 0.07, 'ring']],
      [[-0.5, 0, 0.08, 'spike'], [0.5, 0, 0.08, 'spike'], [0, 0, 0.08, 'ring']],
      [[0, -0.2, 0.07, 'ring'], [0, 0.2, 0.07, 'ring'], [-0.65, 0, 0.06, 'spike'], [0.65, 0, 0.06, 'spike']]
    ],
    // 大招：能量滿 100 可發動（彈射時、撞到敵人、被撞都會充能）
    ult: { max: 100, start: 80, gainLaunch: 40, gainHit: 15, gainHurt: 30 }, // start 開場能量
    squadHp: 80, winHeal: 2, lastStand: 1, // 開局 80 血；贏 +2（上限 80）；一次鎖一血免死
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
    shopSize: 5, benchSize: 6, starMult: [1, 1.8, 3.2], maxItems: 3, maxFront: 7,
    lossDamage: { base: 3, perEnemy: 2, perStage: 0.4 }, // 沒殺光敵人就算輸：基礎 + 每隻存活敵人 + 關卡
    dropChance: 0.35
  };
})(globalThis);
