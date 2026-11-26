// 連線自走棋模式（多人排位，參考貨幣戰爭／自走棋）數值
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.league = {
    minPlayers: 2, maxPlayers: 4,
    hp: 80, // 小隊血量
    maxRounds: 15, // 到時依血量排名
    shopSec: 45, // 商店階段限時（秒），可提早按準備
    shopGrace: 3, // 房主多等幾秒（給慢一點的手機送出隊伍）
    turnSec: 30, // 對戰每發限時（秒），超過由 AI 代打
    aiDelay: 1.5, // 離線玩家／幽靈出手前的等待（秒）
    // 輸家扣血＝base＋ceil(對方剩餘動數 / config.deathCost) × perLeft＋floor(回合 / roundDiv)
    loss: { base: 2, perLeft: 3, roundDiv: 2 }, // 模擬 4 人平均淘汰約 2 人／15 回合（sim/league_sim.js）
    stratEvery: 3, stratFirst: 1, // 第 1、4、7、10、13 回合商店發投資策略 3 選 1
    // 每回合戰後掉落：itemChance 機率 1 件基礎裝備，否則 gold 金
    drop: { itemChance: 0.5, gold: 2 },
    // 配對成本：和上回合同一人、累計打過幾次、拿幽靈的次數（越低越優先）
    pairCost: { repeatLast: 100, perMet: 10, perGhost: 6 }
  };
})(globalThis);
