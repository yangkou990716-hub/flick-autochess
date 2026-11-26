// 一局結構（參考貨幣戰爭）：開局詞綴 → 投資環境（整局持續）→ 首個投資策略 → 3 個位面的節點 → 首領後投資策略
// 節點：戰鬥 / 遭遇（選難度，越難獎勵越好）/ 獎勵（打撲滿拿錢，不扣血）/ 補給（3 選 1 角色或裝備）/ 首領
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.run = {
    // 每個位面的節點：fixed 為固定類型，否則 2 條路選 1
    planes: [
      { steps: ['battle', null, 'supply', null, 'boss'] },
      { steps: [null, null, 'supply', null, null, 'boss'] },
      { steps: [null, null, 'supply', null, null, 'boss'] }
    ],
    // 難度等級（開局選）：敵人強化、扣血加重、開局血量
    ascensions: [
      { name: 'A0 新手', desc: '標準難度', threat: 0, lossAdd: 0, hp: 80 },
      { name: 'A1', desc: '敵人生命/攻擊 +10%', threat: 0.1, lossAdd: 0, hp: 80 },
      { name: 'A2', desc: '敵人 +20%', threat: 0.2, lossAdd: 0, hp: 80 },
      { name: 'A3', desc: '敵人 +30%，戰敗多扣 2 血', threat: 0.3, lossAdd: 2, hp: 80 },
      { name: 'A4', desc: '敵人 +40%，戰敗多扣 3 血', threat: 0.4, lossAdd: 3, hp: 80 },
      { name: 'A5 地獄', desc: '敵人 +50%，戰敗多扣 4 血，開局 60 血', threat: 0.5, lossAdd: 4, hp: 60 }
    ],
    nodeWeights: { battle: 4, encounter: 3, reward: 2, supply: 1 },
    nodeInfo: {
      battle: { name: '戰鬥', icon: '⚔️', desc: '一般敵人' },
      encounter: { name: '遭遇', icon: '❗', desc: '自選難度，越難獎勵越好' },
      reward: { name: '獎勵', icon: '🐷', desc: '打破撲滿拿金幣，失敗不扣血' },
      supply: { name: '補給', icon: '📦', desc: '3 選 1：角色或裝備' },
      boss: { name: '首領', icon: '👑', desc: '位面首領，打完選投資策略' }
    },
    // 遭遇的難度分支：stage 加成、多派敵人、獎勵
    encounter: [
      { name: '難度 1', add: 0, extra: 0, reward: { gold: 4 } },
      { name: '難度 2', add: 2, extra: 0, reward: { gold: 7, item: 1 } },
      { name: '難度 3', add: 4, extra: 1, reward: { gold: 10, weapon: 1 } },
      { name: '難度 4', add: 6, extra: 1, reward: { gold: 14, weapon: 1, strategy: 'gold' } }
    ],
    piggy: { hpBase: 120, hpPerStage: 25, goldEach: 3, allBonus: { item: 1 } },
    // 開局詞綴（3 選 1）
    openers: {
      rich: { name: '富二代', desc: '開局 +10 金', fx: { gold: 10 } },
      veteran: { name: '老兵', desc: '開局送 1 隻 2 星 1～2 費角色', fx: { unit2: 1 } },
      arms: { name: '軍火商', desc: '開局送 1 把隨機武器', fx: { weapon: 1 } },
      insured: { name: '保險', desc: '鎖血免死 +1 次', fx: { lastStand: 1 } },
      scholar: { name: '學霸', desc: '開局直接 2 級', fx: { xp: 4 } },
      gambler: { name: '賭徒', desc: '每節點 1 次免費刷新', fx: { freeReroll: 1 } },
      dualwield: { name: '雙槍俠', desc: '開局送 2 把武器，但少 4 金', fx: { weapon: 2, gold: -4 } },
      angelinv: { name: '天使投資人', desc: '選完首個投資策略後，再選 1 張黃金策略', fx: { bonusPick: 'gold' } }
    },
    // 投資環境：開局 3 選 1，持續整局
    envs: {
      ice: { name: '冰面', desc: '摩擦力減半，全場超滑', fx: { frictionMul: 0.5 } },
      springwall: { name: '彈簧牆', desc: '撞牆加成翻倍', fx: { wallBonusMul: 2 } },
      overheat: { name: '經濟過熱', desc: '利息上限 +3，但角色價格 +1', fx: { interestAdd: 3, costAdd: 1 } },
      small: { name: '小場地', desc: '競技場縮小 20%，更容易連鎖', fx: { arenaMul: 0.8 } },
      storm: { name: '磁暴', desc: '每回合開始，全場被吸向隨機一點', fx: { storm: 300 } },
      bounty: { name: '懸賞', desc: '每勝 +3 金，但敵人生命 +10%', fx: { winGold: 3, enemyHp: 0.1 } },
      giant: { name: '巨人國', desc: '所有棋子變大 20%', fx: { radiusMul: 1.2 } },
      heavyg: { name: '重力場', desc: '摩擦力 +40%，重棋子更吃香', fx: { frictionMul: 1.4 } },
      toxicfog: { name: '毒霧', desc: '雙方每回合開始全員受 3% 生命毒傷', fx: { fog: 0.03 } },
      golden: { name: '黃金時代', desc: '投資策略出現黃金的機率大增', fx: { tierBias: 'gold' } },
      rainbow: { name: '彩虹時代', desc: '投資策略出現稜彩的機率大增（敵人也會更強）', fx: { tierBias: 'prism' } },
      longrun: { name: '長線作戰', desc: '每場戰鬥後小隊回 2 血', fx: { battleHeal: 2 } },
      silverage: { name: '白銀時代', desc: '投資策略都是白銀，但每次多 1 個選項（4 選 1）', fx: { tierBias: 'silver', stratOptions: 4 } },
      warfront: { name: '戰爭邊疆', desc: '第三位面的戰鬥節點全部換成遭遇節點', fx: { planeSwap: { plane: 3, from: 'battle', to: 'encounter' } } }
    },
    // 投資策略：越高階越強，也讓之後的敵人越強（threat 加到敵人生命與攻擊；extraEnemy 多派敵人）
    tiers: {
      silver: { name: '白銀', color: '#c9d1d9', chance: 60, threat: 0, extraEnemy: 0 },
      gold: { name: '黃金', color: '#ffc531', chance: 32, threat: 0.06, extraEnemy: 0 },
      prism: { name: '稜彩', color: '#d38cff', chance: 8, threat: 0.2, extraEnemy: 1 }
    },
    // 投資策略取得：開局 1 次、位面 1、2 首領後各 1 次；部分策略會再觸發（期貨）
    // fx：gold xp freeRerolls lastStand heal | units:{cost,n,star} items weapons | perNode:{gold,xp,rerolls,n} | onBoss:{gold}
    //     atLevel:{lv,gold} | interestCap | interestAdd 利息上限加值 | streakMul | income 每節點收入 | flawlessGold 完勝金幣 | swapHpGold 生命金幣互換 | echo:{r,mult} | blastGold 爆炸給金上限 | streakAdd | openFreeze | stormZap
    //     mods(戰鬥數值) | shots | future:{after,tier} | pickNow:tier
    strategies: {
      // 白銀：經濟、資源
      s_bossfund: { tier: 'silver', name: '特戰資金', desc: '每次進入首領節點時 +8 金', fx: { onBoss: { gold: 8 } } },
      s_xp: { tier: 'silver', name: '經驗到賬', desc: '立刻 +10 經驗', fx: { xp: 10 } },
      s_lunch: { tier: 'silver', name: '免費午餐', desc: '立刻獲得 10 次免費刷新', fx: { freeRerolls: 10 } },
      s_aid2: { tier: 'silver', name: '二費援軍', desc: '立刻獲得 3 隻隨機 2 費角色', fx: { units: { cost: 2, n: 3, star: 1 } } },
      s_growth: { tier: 'silver', name: '成長基金', desc: '升到 4 級時 +25 金', fx: { atLevel: { lv: 4, gold: 25 } } },
      s_team: { tier: 'silver', name: '擴充團隊', desc: '立刻獲得 2 隻 1 費、1 隻 3 費角色', fx: { units2: [[1, 2], [3, 1]] } },
      s_arms: { tier: 'silver', name: '軍火貿易', desc: '立刻獲得 1 把武器與 6 金', fx: { weapons: 1, gold: 6 } },
      s_atk: { tier: 'silver', name: '磨刀', desc: '全隊攻擊 +8%', fx: { mods: { atkPct: 0.08 } } },
      s_piggybank: { tier: 'silver', name: '招財豬', desc: '每場完勝（我方沒有陣亡）+1 金', fx: { flawlessGold: 1 } },
      s_echo: { tier: 'silver', name: '回音彈', desc: '每發第一次撞到敵人時，追加一次小爆炸', fx: { echo: { r: 70, mult: 0.35 } } },
      // 黃金：持續收益、期貨
      g_station: { tier: 'gold', name: '加油站', desc: '立刻 +8 金與 1 次免費刷新，之後每節點 +1 次免費刷新', fx: { gold: 8, freeRerolls: 1, perNode: { rerolls: 1, n: 99 } } },
      g_gun: { tier: 'gold', name: '槍在手', desc: '立刻獲得 1 件裝備＋1 把武器', fx: { items: 1, weapons: 1 } },
      g_long: { tier: 'gold', name: '長期主義', desc: '接下來 3 個節點各 +7 金', fx: { perNode: { gold: 7, n: 3 } } },
      g_fixed: { tier: 'gold', name: '固定理財', desc: '每個節點 +2 經驗', fx: { perNode: { xp: 2, n: 99 } } },
      g_silverinv: { tier: 'gold', name: '白銀投資', desc: '立刻選 1 張白銀策略，3 個節點後再選 1 張', fx: { pickNow: 'silver', future: { after: 3, tier: 'silver' } } },
      g_futures: { tier: 'gold', name: '彩虹期貨', desc: '5 個節點後選 1 張稜彩策略', fx: { future: { after: 5, tier: 'prism' } } },
      g_shot: { tier: 'gold', name: '多一發', desc: '每場我方多 1 次彈射', fx: { shots: 1 } },
      g_blastfund: { tier: 'gold', name: '爆破分紅', desc: '我方每次爆炸 +1 金，每場最多 3 金', fx: { blastGold: 3 } },
      g_streak: { tier: 'gold', name: '連勝紅利', desc: '連勝／連敗獎勵每次 +1；開場凍住 1 隻敵人', fx: { streakAdd: 1, openFreeze: 1 } },
      g_angel: { tier: 'gold', name: '守護', desc: '每場第一隻陣亡的隊友以 40% 生命復活', fx: { revive: 1 } },
      // 稜彩：改變玩法（敵人難度大增）
      p_open: { tier: 'prism', name: '開源節流', desc: '立刻 +10 金，利息上限變 9', fx: { gold: 10, interestCap: 9 } },
      p_rescue: { tier: 'prism', name: '天降救兵', desc: '立刻獲得 1 隻隨機 3 星 1 費角色與 1 把武器', fx: { units: { cost: 1, n: 1, star: 3 }, weapons: 1 } },
      p_rain: { tier: 'prism', name: '及時雨', desc: '立刻獲得 2 隻 2 星 4 費角色與 4 次免費刷新', fx: { units: { cost: 4, n: 2, star: 2 }, freeRerolls: 4 } },
      p_conquest: { tier: 'prism', name: '偉大征服', desc: '連勝獎勵變 3 倍，立刻 +12 經驗', fx: { streakMul: 3, xp: 12 } },
      p_front: { tier: 'prism', name: '擴編', desc: '前台上限 +1（最多 7）', fx: { frontAdd: 1 } },
      p_chain: { tier: 'prism', name: '連環爆', desc: '我方所有爆炸都會連鎖', fx: { chainAll: true } },
      p_swap: { tier: 'prism', name: '不等價交換', desc: '小隊生命和金幣數值互換（生命最多到上限，多的變金幣）', fx: { swapHpGold: true } },
      p_double: { tier: 'prism', name: '雙響', desc: '每場我方多 2 次彈射', fx: { shots: 2 } }
    },
    // 補給節點：3 選 1
    supplies: {
      unit2: { name: '援軍', desc: '隨機 2 星 1～2 費角色', fx: { unit2: 1 } },
      unit3c: { name: '精英招募', desc: '隨機 3 費角色 ×2', fx: { units: { cost: 3, n: 2, star: 1 } } },
      item: { name: '裝備箱', desc: '隨機基礎裝備 2 件', fx: { items: 2 } },
      weapon: { name: '武器箱', desc: '隨機武器 1 把', fx: { weapons: 1 } },
      heal: { name: '醫療包', desc: '小隊回 12 血', fx: { heal: 12 } },
      xp: { name: '特訓', desc: '+6 經驗', fx: { xp: 6 } },
      gold: { name: '資金', desc: '+8 金', fx: { gold: 8 } }
    }
  };
})(globalThis);
