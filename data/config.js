// 全域設定（數值都在這裡調）
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.config = {
    arenaR: 300, dt: 1 / 120, friction: 0.75, linDecel: 35, stopV: 6, maxSimSec: 12,
    maxLaunch: 1000, dmgSpeedRef: 330, minHitSpeed: 60, wallBonusPer: 0.25, baseBounces: 2,
    restitution: 0.97, wallRest: 0.95,
    fullPowerAt: 0.95, fullPowerBonus: 0.15, // 力道：拉滿 95% 以上為「全力」，速度 +15%
    turnsEach: 5, roundsEach: 2, bossRoundsAdd: 1, // 一輪內雙方交替、每隻都動一次才換輪；一般戰 2 輪、首領戰 3 輪
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
