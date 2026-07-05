(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  DT.DATA = {
    // 競技能力（仮項目 — 実際の大会採点基準の入手後に差し替え予定）
    STATS: [
      { id: 'multiplex',   label: 'マルチプレックス', group: 'tech' },
      { id: 'isolation',   label: 'アイソレーション', group: 'tech' },
      { id: 'saisai',      label: 'サイサイド系',     group: 'tech' },
      { id: 'basic',       label: 'ベーシック安定度', group: 'tech' },
      { id: 'composition', label: '構成力',           group: 'expr' },
      { id: 'music',       label: '音楽との調和',     group: 'expr' },
      { id: 'staging',     label: 'ステージング',     group: 'expr' }
    ],
    TRAININGS: [
      { id: 'multiplex',   label: 'マルチ練習',       stat: 'multiplex',   gain: 6, fatigue: 14, risk: 6 },
      { id: 'isolation',   label: 'アイソ練習',       stat: 'isolation',   gain: 6, fatigue: 14, risk: 6 },
      { id: 'saisai',      label: 'サイサイド練習',   stat: 'saisai',      gain: 6, fatigue: 16, risk: 8 },
      { id: 'basic',       label: 'ベーシック練習',   stat: 'basic',       gain: 5, fatigue: 8,  risk: 2 },
      { id: 'composition', label: 'ルーチン構成',     stat: 'composition', gain: 5, fatigue: 8,  risk: 2 },
      { id: 'music',       label: '曲合わせ',         stat: 'music',       gain: 5, fatigue: 6,  risk: 1 },
      { id: 'staging',     label: 'ステージング練習', stat: 'staging',     gain: 5, fatigue: 10, risk: 3 }
    ],
    STUDY: { id: 'study', label: '勉強', gain: 10, fatigue: 4 },
    REST:  { id: 'rest',  label: '休養' },
    // ターン1 = 1年生4月。夏大会=8月、全国大会=2月
    CONTESTS: [
      { turn: 5,  type: 'summer',   name: '1年 夏大会' },
      { turn: 11, type: 'national', name: '1年 全国大会' },
      { turn: 17, type: 'summer',   name: '2年 夏大会' },
      { turn: 23, type: 'national', name: '2年 全国大会' },
      { turn: 29, type: 'summer',   name: '3年 夏大会' },
      { turn: 35, type: 'national', name: '3年 全国大会' },
      { turn: 41, type: 'summer',   name: '4年 夏大会' },
      { turn: 47, type: 'national', name: '4年 全国大会' }
    ],
    TOTAL_TURNS: 48,
    STUDY_MIN: 20,          // 学力がこれ未満の月が続くと退学
    STUDY_LIMIT_MONTHS: 3,  // 退学までの連続月数
    STUDY_BONUS: 70         // 学力がこれ以上なら練習成功率ボーナス
  };
})(typeof window !== 'undefined' ? window : globalThis);
