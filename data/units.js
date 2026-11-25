// 角色資料
// role: front 前台 / back 後台 / both 兩用（站位賦能：前台用 front 能力，後台用 back 被動）
// back.type: atkPct 前台加攻 / shield 每回合護盾 / heal 每回合回血 / bounce 反彈加成次數 / launchPct 彈射速度
// front.type: deathBlast 陣亡爆炸 / thorns 反傷
// link.combo.type: blast 大爆炸 / launch 把夥伴射向最近敵人 / shieldAll 全隊護盾 / pullBlast 吸附再爆炸 / healAll 全隊回血
(function (g) {
  const FA = g.FA = g.FA || {}; FA.DATA = FA.DATA || {};
  FA.DATA.units = {
    spark: { name: '火花', cost: 1, traits: ['blast'], role: 'front', hp: 100, atk: 32, mass: 1, r: 22, color: '#ff7a45',
      link: { with: 'barrel', combo: { type: 'blast', r: 150, mult: 1.6, name: '火海' } } },
    barrel: { name: '油桶', cost: 2, traits: ['blast'], role: 'both', hp: 160, atk: 20, mass: 1.8, r: 27, color: '#c0632d',
      front: { type: 'deathBlast', r: 130, mult: 1.5 }, back: { type: 'atkPct', val: 0.15, trait: 'blast' },
      link: { with: 'spark', combo: { type: 'blast', r: 150, mult: 1.6, name: '火海' } } },
    magnet: { name: '小磁', cost: 1, traits: ['magnet'], role: 'front', hp: 125, atk: 32, mass: 1, r: 22, color: '#5b8cff',
      link: { with: 'ironball', combo: { type: 'launch', speed: 850, name: '磁軌砲' } } },
    ironball: { name: '鐵球', cost: 2, traits: ['wall', 'magnet'], role: 'front', hp: 170, atk: 26, mass: 2.2, r: 28, color: '#7d8aa3',
      link: { with: 'magnet', combo: { type: 'launch', speed: 850, name: '磁軌砲' } } },
    shield: { name: '盾兵', cost: 1, traits: ['wall'], role: 'front', hp: 150, atk: 16, mass: 1.6, r: 25, color: '#8fbf5a',
      link: { with: 'captain', combo: { type: 'shieldAll', amt: 40, name: '盾陣' } } },
    captain: { name: '守衛長', cost: 3, traits: ['wall'], role: 'both', hp: 200, atk: 22, mass: 2, r: 28, color: '#4f9a3c',
      front: { type: 'thorns', val: 0.2 }, back: { type: 'shield', val: 15 },
      link: { with: 'shield', combo: { type: 'shieldAll', amt: 40, name: '盾陣' } } },
    tesla: { name: '磁暴', cost: 3, traits: ['magnet'], role: 'back', hp: 130, atk: 22, mass: 1.2, r: 24, color: '#8a6bff',
      back: { type: 'atkPct', val: 0.25, trait: 'magnet' },
      link: { with: 'detonator', combo: { type: 'pullBlast', r: 220, mult: 1.4, name: '電磁爆縮' } } },
    detonator: { name: '引爆者', cost: 4, traits: ['blast'], role: 'front', hp: 170, atk: 40, mass: 1.4, r: 26, color: '#e0402f',
      link: { with: 'tesla', combo: { type: 'pullBlast', r: 220, mult: 1.4, name: '電磁爆縮' } } },
    medic: { name: '醫官', cost: 2, traits: ['wall'], role: 'back', hp: 120, atk: 14, mass: 1.2, r: 23, color: '#3fc1a5',
      back: { type: 'heal', val: 10 },
      link: { with: 'bullet', combo: { type: 'healAll', pct: 0.2, name: '急救彈' } } },
    bullet: { name: '彈頭', cost: 5, traits: ['magnet', 'blast'], role: 'front', hp: 180, atk: 40, mass: 1.3, r: 24, color: '#ffc531',
      pierce: true, launchPct: 0.15,
      link: { with: 'medic', combo: { type: 'healAll', pct: 0.2, name: '急救彈' } } }
  };
})(globalThis);
