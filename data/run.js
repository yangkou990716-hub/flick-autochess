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
    // 難度等級（開局選）：敵人強化、扣血加重、開局血量；affixN 敵人詞綴數（affixSoft 只抽 soft）
    ascensions: [
      { name: 'A0 新手', desc: '敵人生命/攻擊不加成', threat: 0, lossAdd: 0, hp: 80, wrench: 'wrench' },
      { name: 'A1', desc: '敵人生命/攻擊 +12%', threat: 0.12, lossAdd: 0, hp: 80, wrench: 'wrench' },
      { name: 'A2', desc: '敵人 +18%，敵人詞綴 1（溫和）', threat: 0.18, lossAdd: 0, hp: 80, affixN: 1, affixSoft: true, wrench: 'wrench' },
      { name: 'A3', desc: '敵人 +24%，戰敗多扣 2 血，敵人詞綴 1', threat: 0.24, lossAdd: 2, hp: 80, affixN: 1, wrench: 'wrench1' },
      { name: 'A4', desc: '敵人 +30%，戰敗多扣 3 血，敵人詞綴 2', threat: 0.3, lossAdd: 3, hp: 80, affixN: 2, wrench: 'wrench1' },
      { name: 'A5 地獄', desc: '敵人 +20%，戰敗多扣 4 血，開局 75 血，敵人詞綴 3', threat: 0.2, lossAdd: 4, hp: 75, affixN: 3, wrench: 'wrench1' }
    ],
    nodeWeights: { battle: 4, encounter: 3, reward: 2, supply: 1 },
    nodeInfo: {
      battle: { name: '戰鬥', icon: '⚔️', desc: '一般敵人' },
      encounter: { name: '遭遇', icon: '❗', desc: '自選難度，越難獎勵越好' },
      reward: { name: '獎勵', icon: '🐷', desc: '打破撲滿拿金幣，失敗不扣血' },
      supply: { name: '補給', icon: '📦', desc: '4 隻帶裝角色選 1（可重骰），或拿保底' },
      boss: { name: '首領', icon: '👑', desc: '位面首領，打完選投資策略' }
    },
    // 遭遇的難度分支：stage 加成、多派敵人、獎勵
    encounter: [
      { name: '難度 1', add: 0, extra: 0, reward: { gold: 4 } },
      { name: '難度 2', add: 2, extra: 0, reward: { gold: 7, cons: { armory: 1 } } },
      { name: '難度 3', add: 4, extra: 1, reward: { gold: 10, weapon: 1, emblem: 1, cons: { projector: 1 } } },
      { name: '難度 4', add: 6, extra: 1, reward: { gold: 14, weapon: 1, strategy: 'gold', emblem: 1, consOne: ['projectorX', 'armoryP'] } }
    ],
    piggy: { hpBase: 220, hpPerStage: 35, goldEach: 3, allBonus: { cons: { armory: 1 } },
      // ---- 次元撲滿 ----：被撞往反方向逃（flee 速度）；我方每次彈射時撲滿往遠離我方的方向蹦一下（hop 速度、jitter 弧度亂偏）
      //                   每撞掉 25% 生命掉 goldPerQuarter 金，打倒再多 killGold 金
      flee: 400, hop: 260, hopJitter: 0.7, goldPerQuarter: 1, killGold: 1, count: [3, 3, 4] }, // count：各位面撲滿數（撲滿更值錢，數量變少）
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
      springwall: { name: '彈簧牆', desc: '撞牆加成 ×1.6', fx: { wallBonusMul: 1.6 } },
      overheat: { name: '經濟過熱', desc: '利息上限 +4，但角色價格 +1', fx: { interestAdd: 4, costAdd: 1 } },
      small: { name: '小場地', desc: '競技場縮小 20%，更容易連鎖', fx: { arenaMul: 0.8 } },
      storm: { name: '磁暴', desc: '每回合開始，全場被吸向隨機一點', fx: { storm: 300 } },
      bounty: { name: '懸賞', desc: '每勝 +3 金，但敵人生命 +10%', fx: { winGold: 3, enemyHp: 0.1 } },
      giant: { name: '巨人國', desc: '所有棋子變大 20%', fx: { radiusMul: 1.2 } },
      heavyg: { name: '重力場', desc: '摩擦力 +40%，重棋子更吃香', fx: { frictionMul: 1.4 } },
      toxicfog: { name: '毒霧', desc: '雙方每回合開始全員受 2% 生命毒傷', fx: { fog: 0.02 } },
      golden: { name: '黃金時代', desc: '投資策略出現黃金的機率大增', fx: { tierBias: 'gold' } },
      rainbow: { name: '彩虹時代', desc: '投資策略出現稜彩的機率大增（敵人也會更強）', fx: { tierBias: 'prism' } },
      longrun: { name: '長線作戰', desc: '每場戰鬥後小隊回 2 血', fx: { battleHeal: 2 } },
      silverage: { name: '白銀時代', desc: '投資策略都是白銀，但每次多 1 個選項（4 選 1）', fx: { tierBias: 'silver', stratOptions: 4 } },
      warfront: { name: '戰爭邊疆', desc: '第三位面的戰鬥節點全部換成遭遇節點', fx: { planeSwap: { plane: 3, from: 'battle', to: 'encounter' } } },
      // ---- 經濟擴充 ----（概念股 c_<羈絆> 由 src/core/run.js 依 FA.DATA.traits 自動產生，選項中最多出現 1 個）
      insurance: { name: '人身意外險', desc: '每個首領節點前，多一次補給（選 1 隻帶裝角色）', fx: { preBossSupply: 1 } },
      rotation: { name: '輪崗', desc: '每個節點隨機一種費用的角色出現機率 ×2（商店上方顯示）', fx: { rotateCost: 2 } },
      evolve: { name: '進化演算法', desc: '每進入新節點，全隊攻擊永久 +1%（可疊）', fx: { perNodeAtk: 0.01 } },
      secondhand: { name: '二手市場', desc: '商店手動刷新累計 20 次，送 20 金＋1 個員工投影儀', fx: { rerollQuest: { n: 20, gold: 20, cons: { projector: 1 } } } }
    },
    // 投資策略：越高階越強，也讓之後的敵人越強（threat 加到敵人生命與攻擊；extraEnemy 多派敵人）
    tiers: {
      silver: { name: '白銀', color: '#c9d1d9', chance: 60, threat: 0, extraEnemy: 0 },
      gold: { name: '黃金', color: '#ffc531', chance: 32, threat: 0.03, extraEnemy: 0 },
      prism: { name: '稜彩', color: '#d38cff', chance: 8, threat: 0.1, extraEnemy: 0 }
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
      s_growth: { tier: 'silver', name: '成長基金', desc: '升到 5 級時 +25 金', fx: { atLevel: { lv: 5, gold: 25 } } },
      s_team: { tier: 'silver', name: '擴充團隊', desc: '立刻獲得 2 隻 1 費、1 隻 3 費角色', fx: { units2: [[1, 2], [3, 1]] } },
      s_arms: { tier: 'silver', name: '軍火貿易', desc: '立刻獲得 1 把武器與 6 金', fx: { weapons: 1, gold: 6 } },
      s_atk: { tier: 'silver', name: '磨刀', desc: '全隊攻擊 +6%', fx: { mods: { atkPct: 0.06 } } },
      s_piggybank: { tier: 'silver', name: '招財豬', desc: '每場完勝（我方沒有陣亡）+1 金', fx: { flawlessGold: 1 } },
      s_lotto: { tier: 'silver', name: '買彩票', desc: '立刻獲得 1 個隨機羈絆徽章（穿上的角色多 1 個羈絆）', fx: { emblem: 1 } }, // ---- 徽章 ----
      s_echo: { tier: 'silver', name: '回音彈', desc: '每發第一次撞到敵人時，追加一次小爆炸', fx: { echo: { r: 70, mult: 0.35 } } },
      // ---- 經濟擴充 ----
      s_save: { tier: 'silver', name: '存款回報', desc: '上個節點沒花任何金幣，下個節點 +2 次免費刷新', fx: { saveRerolls: 2 } },
      s_diode: { tier: 'silver', name: '二極體', desc: '遭遇節點只剩難度 1 和難度 4；立刻 +6 血、+5 金', fx: { heal: 6, gold: 5, encMode: 'diode' } },
      s_teamS: { tier: 'silver', name: '團隊力量·銀', desc: '每個已啟動的羈絆，全隊攻擊 +3%', fx: { perTrait: { atkPct: 0.03 } } },
      // 黃金：持續收益、期貨
      g_station: { tier: 'gold', name: '加油站', desc: '立刻 +8 金與 1 次免費刷新，之後每節點 +1 次免費刷新', fx: { gold: 8, freeRerolls: 1, perNode: { rerolls: 1, n: 99 } } },
      g_gun: { tier: 'gold', name: '槍在手', desc: '立刻獲得 1 件裝備＋1 把武器', fx: { items: 1, weapons: 1 } },
      g_long: { tier: 'gold', name: '長期主義', desc: '接下來 3 個節點各 +7 金', fx: { perNode: { gold: 7, n: 3 } } },
      g_fixed: { tier: 'gold', name: '固定理財', desc: '每個節點 +3 經驗', fx: { perNode: { xp: 3, n: 99 } } },
      g_silverinv: { tier: 'gold', name: '白銀投資', desc: '立刻選 1 張白銀策略，3 個節點後再選 1 張', fx: { pickNow: 'silver', future: { after: 3, tier: 'silver' } } },
      g_futures: { tier: 'gold', name: '彩虹期貨', desc: '5 個節點後選 1 張稜彩策略', fx: { future: { after: 5, tier: 'prism' } } },
      g_shot: { tier: 'gold', name: '多兩動', desc: '每場我方多 2 動', fx: { shots: 1 } },
      g_blastfund: { tier: 'gold', name: '爆破分紅', desc: '我方每次爆炸 +1 金，每場最多 3 金', fx: { blastGold: 3 } },
      g_streak: { tier: 'gold', name: '連勝紅利', desc: '連勝／連敗獎勵每次 +1；開場凍住 1 隻敵人', fx: { streakAdd: 1, openFreeze: 1 } },
      g_angel: { tier: 'gold', name: '守護', desc: '每場第一隻陣亡的隊友以 40% 生命復活', fx: { revive: 1 } },
      // ---- 經濟擴充 ----
      g_value: { tier: 'gold', name: '價值投資', desc: '立刻獲得 1 隻 2 星 1 費角色；之後 6 個節點，每節點再送 1 隻同角色 1 星', fx: { valueInv: { cost: 1, star: 2, n: 6 } } },
      g_layoff: { tier: 'gold', name: '大裁員', desc: '立刻賣掉場上和備戰區全部角色，拿 2 倍售價（裝備退回物品欄），再給 9 次免費刷新', fx: { sellAll: 2, freeRerolls: 9 } },
      g_starpress: { tier: 'gold', name: '星級壓制', desc: '全隊速度 +4%；撞擊星級比自己低的敵人，傷害 +12%', fx: { mods: { speedPct: 0.04 }, lowStarDmg: 0.12 } },
      // 稜彩：改變玩法（敵人難度大增）
      p_open: { tier: 'prism', name: '開源節流', desc: '立刻 +15 金，利息上限變 9', fx: { gold: 15, interestCap: 9 } },
      p_rescue: { tier: 'prism', name: '天降救兵', desc: '立刻獲得 1 隻隨機 3 星 1 費角色、1 把武器與 8 金', fx: { units: { cost: 1, n: 1, star: 3 }, weapons: 1, gold: 8 } },
      p_rain: { tier: 'prism', name: '及時雨', desc: '立刻獲得 2 隻 2 星 4 費角色與 4 次免費刷新', fx: { units: { cost: 4, n: 2, star: 2 }, freeRerolls: 4 } },
      p_conquest: { tier: 'prism', name: '偉大征服', desc: '連勝獎勵變 3 倍，立刻 +16 經驗', fx: { streakMul: 3, xp: 16 } },
      p_front: { tier: 'prism', name: '擴編', desc: '前台上限 +1（最多 7）', fx: { frontAdd: 1 } },
      p_chain: { tier: 'prism', name: '連環爆', desc: '我方所有爆炸都會連鎖', fx: { chainAll: true } },
      p_swap: { tier: 'prism', name: '不等價交換', desc: '小隊生命和金幣數值互換（生命最多到上限，多的變金幣）', fx: { swapHpGold: true } },
      p_double: { tier: 'prism', name: '雙響', desc: '每場我方多 2 次彈射', fx: { shots: 2 } },
      // ---- 經濟擴充 ----
      p_pinpoint: { tier: 'prism', name: '定點爆破', desc: '每場開打時，對生命最高的敵人造成其最大生命 40% 的傷害（首領 20%）', fx: { pinpoint: { pct: 0.4, bossPct: 0.2 } } },
      p_expand: { tier: 'prism', name: '擴張的代價', desc: '前台上限 +2（最多 7）、全隊受到傷害 -10%；戰敗扣血 ×1.5', fx: { frontAdd: 2, dmgTaken: -0.1, lossMul: 1.5 } },
      p_vision: { tier: 'prism', name: '遠見', desc: '立刻 +15 金並選 1 張黃金策略；之後的投資策略全是稜彩，而且不再加敵人強度', fx: { gold: 15, pickNow: 'gold', lockTier: 'prism', noThreat: true } },
      p_network: { tier: 'prism', name: '人脈進階', desc: '單場啟動 2 個羈絆就領獎（8 金＋簡易武裝箱），之後門檻 +1、獎金 +4', fx: { bondQuest: { need: 2, gold: 8, cons: { armory: 1 }, step: 1, goldStep: 4 } } },
      p_headhunt: { tier: 'prism', name: '獵頭', desc: '立刻獲得 2 個完美投影儀（任何費用都能複製）與 10 金', fx: { cons: { projectorX: 2 }, gold: 10 } }
    },
    // ---- 道具 ----
    // 首領獎勵、戰鬥掉落（取代原本直接給裝備）、進入位面時送的道具（ascensions[].wrench＝開局扳手）
    bossReward: { weapon: 1, cons: { armoryP: 1 } },
    dropReward: { cons: { armory: 1 } },
    planeStartCons: { 2: ['furnace'] },
    // ---- 補給 ----
    // 選人帶裝：n 隻角色（依目前等級商店機率）各帶 1 件隨機基礎裝備，選 1；可花 rerollCost 重骰 rerolls 次；另有 1 格保底（fallback 隨機 1 個 supplies）
    supplyMode: { mode: 'carrier', n: 4, rerollCost: 2, rerolls: 1, fallback: ['heal', 'gold'] },
    // 補給節點（supplyMode 關閉時的舊版 3 選 1；heal/gold 也是選人帶裝的保底）
    supplies: {
      unit2: { name: '援軍', desc: '隨機 2 星 1～2 費角色', fx: { unit2: 1 } },
      unit3c: { name: '精英招募', desc: '隨機 3 費角色 ×2', fx: { units: { cost: 3, n: 2, star: 1 } } },
      item: { name: '裝備箱', desc: '簡易武裝箱 ×2', fx: { cons: { armory: 2 } } },
      weapon: { name: '武器箱', desc: '隨機武器 1 把', fx: { weapons: 1 } },
      heal: { name: '醫療包', desc: '小隊回 12 血', fx: { heal: 12 } },
      xp: { name: '特訓', desc: '+6 經驗', fx: { xp: 6 } },
      gold: { name: '資金', desc: '+8 金', fx: { gold: 8 } },
      emblem: { name: '徽章', desc: '隨機羈絆徽章 1 個（穿上的角色多 1 個羈絆）', fx: { emblem: 1 } } // ---- 徽章 ----
    }
  };
})(globalThis);
