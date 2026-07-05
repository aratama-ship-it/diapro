(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  DT.DATA = {
    // JDA「ディアボロ競技採点規則 第八版」オーバーオールクラス個人部門の採点項目に対応
    STATS: [
      { id: 'difficulty',   label: '難易度',     desc: '技の難易度・数' },
      { id: 'variety',      label: '多彩性',     desc: '技の多彩さ' },
      { id: 'control',      label: '操作安定度', desc: '巧みさ・美しさ・洗練' },
      { id: 'novelty',      label: '新奇性',     desc: '新しい技・稀少な技' },
      { id: 'composition',  label: '演技構成',   desc: '楽曲・衣装・順序・起承転結' },
      { id: 'fundamentals', label: '基礎',       desc: '1D水平軸/1D垂直軸/2D/3D以上' }
    ],
    TRAININGS: [
      { id: 'difficulty',   label: '高難度技練習',     stat: 'difficulty',   gain: 9, fatigue: 16, risk: 8 },
      { id: 'variety',      label: 'レパートリー開拓', stat: 'variety',      gain: 9, fatigue: 12, risk: 5 },
      { id: 'control',      label: '反復練習',         stat: 'control',      gain: 9, fatigue: 10, risk: 3 },
      { id: 'novelty',      label: '新技開発',         stat: 'novelty',      gain: 9, fatigue: 14, risk: 7 },
      { id: 'composition',  label: 'ルーチン構成',     stat: 'composition',  gain: 9, fatigue: 8,  risk: 2 },
      { id: 'fundamentals', label: '基礎練習',         stat: 'fundamentals', gain: 9, fatigue: 8,  risk: 2 }
    ],
    // JDA男子個人総合部門の配点（満点100点）
    SCORING: {
      weights: { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 },
      base: { stat: 'fundamentals', elements: 4, perElement: 5 },
      execDeductionMax: 2,
      specialDeduction: 3
    },
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
