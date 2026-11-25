// 一局結構：位面與節點、開局詞綴、投資環境、投資策略（白銀/黃金/稜彩）、獎勵節點
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.run = {
    // 3 個位面；steps = 首領前的節點數；每步給 2 條路選
    planes: [{ steps: 4 }, { steps: 5 }, { steps: 5 }],
    // 難度等級（開局選）：敵人強化、扣血加重、開局血量
    ascensions: [
      { name: 'A0 新手', desc: '標準難度', threat: 0, lossAdd: 0, hp: 80 },
      { name: 'A1', desc: '敵人生命/攻擊 +10%', threat: 0.1, lossAdd: 0, hp: 80 },
      { name: 'A2', desc: '敵人 +20%', threat: 0.2, lossAdd: 0, hp: 80 },
      { name: 'A3', desc: '敵人 +30%，戰敗多扣 2 血', threat: 0.3, lossAdd: 2, hp: 80 },
      { name: 'A4', desc: '敵人 +40%，戰敗多扣 3 血', threat: 0.4, lossAdd: 3, hp: 80 },
      { name: 'A5 地獄', desc: '敵人 +50%，戰敗多扣 4 血，開局 60 血', threat: 0.5, lossAdd: 4, hp: 60 }
    ],
    nodeWeights: { battle: 5, elite: 2, reward: 3 },
    nodeInfo: {
      battle: { name: '戰鬥', icon: '⚔️', desc: '一般敵人' },
      elite: { name: '精英', icon: '💀', desc: '較強敵人，勝利必得武器' },
      reward: { name: '獎勵', icon: '🎁', desc: '不用打，3 選 1 獎勵' },
      boss: { name: '首領', icon: '👑', desc: '位面首領，打完選投資策略' }
    },
    // 開局詞綴（3 選 1）
    openers: {
      rich: { name: '富二代', desc: '開局 +10 金', fx: { gold: 10 } },
      veteran: { name: '老兵', desc: '開局送 1 隻 2 星 1 費角色', fx: { unit2: 1 } },
      arms: { name: '軍火商', desc: '開局送 1 把隨機武器', fx: { weapon: 1 } },
      insured: { name: '保險', desc: '鎖血免死 +1 次', fx: { lastStand: 1 } },
      scholar: { name: '學霸', desc: '開局直接 2 級', fx: { xp: 4 } },
      gambler: { name: '賭徒', desc: '每輪 1 次免費刷新', fx: { freeReroll: 1 } }
    },
    // 投資環境：每個位面開始 3 選 1，整個位面生效
    envs: {
      ice: { name: '冰面', desc: '摩擦力減半，全場超滑', fx: { frictionMul: 0.5 } },
      springwall: { name: '彈簧牆', desc: '撞牆加成翻倍', fx: { wallBonusMul: 2 } },
      inflation: { name: '通膨', desc: '利息上限+3，但角色價格+1', fx: { interestAdd: 3, costAdd: 1 } },
      small: { name: '小場地', desc: '競技場縮小 20%，更容易連鎖', fx: { arenaMul: 0.8 } },
      storm: { name: '磁暴', desc: '每回合開始，全場被吸向隨機一點', fx: { storm: 300 } },
      bounty: { name: '懸賞', desc: '每勝 +3 金，但敵人生命+10%', fx: { winGold: 3, enemyHp: 0.1 } },
      giant: { name: '巨人國', desc: '所有棋子變大 20%', fx: { radiusMul: 1.2 } }
    },
    // 投資策略：越高階越強，也讓之後的敵人越強（threat 加到敵人生命與攻擊；extraEnemy 多派敵人）
    tiers: {
      silver: { name: '白銀', color: '#c9d1d9', chance: 55, threat: 0, extraEnemy: 0 },
      gold: { name: '黃金', color: '#ffc531', chance: 33, threat: 0.08, extraEnemy: 0 },
      prism: { name: '稜彩', color: '#d38cff', chance: 12, threat: 0.15, extraEnemy: 1 }
    },
    strategies: {
      s_speed: { tier: 'silver', name: '疾風訓練', desc: '全隊速度+8%', fx: { mods: { speedPct: 0.08 } } },
      s_hp: { tier: 'silver', name: '厚皮', desc: '全隊生命+10%', fx: { mods: { hpPct: 0.1 } } },
      s_atk: { tier: 'silver', name: '磨刀', desc: '全隊攻擊+8%', fx: { mods: { atkPct: 0.08 } } },
      s_allow: { tier: 'silver', name: '零用錢', desc: '每輪收入+1', fx: { income: 1 } },
      s_wall: { tier: 'silver', name: '反彈專家', desc: '全隊每次撞牆加成+10%', fx: { mods: { wallAdd: 0.1 } } },
      g_blastgold: { tier: 'gold', name: '爆破分紅', desc: '我方每次爆炸+1 金（每場最多 4）', fx: { blastGold: 4 } },
      g_shield: { tier: 'gold', name: '鐵壁庇護', desc: '全隊開場護盾 15% 生命', fx: { mods: { shieldPct: 0.15 } } },
      g_streak: { tier: 'gold', name: '連勝狂熱', desc: '連勝/連敗獎勵+2', fx: { streakAdd: 2 } },
      g_shot: { tier: 'gold', name: '多一發', desc: '每場我方多 1 次彈射', fx: { shots: 1 } },
      g_interest: { tier: 'gold', name: '複利', desc: '利息上限+3', fx: { interestAdd: 3 } },
      p_front: { tier: 'prism', name: '擴編', desc: '前台上限+1（最多 7）', fx: { frontAdd: 1 } },
      p_chain: { tier: 'prism', name: '連環爆', desc: '我方所有爆炸都會連鎖', fx: { chainAll: true } },
      p_phoenix: { tier: 'prism', name: '不死鳥', desc: '鎖血免死+1，立刻回 20 血', fx: { lastStand: 1, heal: 20 } },
      p_echo: { tier: 'prism', name: '回音', desc: '每發第一次撞到敵人時爆炸', fx: { echo: { r: 90, mult: 0.7 } } },
      p_double: { tier: 'prism', name: '雙響', desc: '每場我方多 2 次彈射', fx: { shots: 2 } }
    },
    // 獎勵節點（3 選 1）
    rewards: {
      gold: { name: '金幣', desc: '+8 金', fx: { gold: 8 } },
      weapon: { name: '武器', desc: '隨機武器 1 把', fx: { weapon: 1 } },
      item: { name: '裝備', desc: '隨機基礎裝備 2 件', fx: { item: 2 } },
      unit2: { name: '援軍', desc: '隨機 2 星 1～2 費角色', fx: { unit2: 1 } },
      heal: { name: '補給', desc: '小隊回 12 血', fx: { heal: 12 } },
      xp: { name: '特訓', desc: '+6 經驗', fx: { xp: 6 } },
      strategy: { name: '投資', desc: '選 1 張投資策略', fx: { strategy: 1 } }
    }
  };
})(globalThis);
