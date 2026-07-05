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
    // 大会: 8月OIDC(大阪国際)、3月AJDC(全日本選手権=頂点)
    CONTESTS: [
      { turn: 5,  type: 'oidc', name: '1年 OIDC' },
      { turn: 12, type: 'ajdc', name: '1年 AJDC' },
      { turn: 17, type: 'oidc', name: '2年 OIDC' },
      { turn: 24, type: 'ajdc', name: '2年 AJDC' },
      { turn: 29, type: 'oidc', name: '3年 OIDC' },
      { turn: 36, type: 'ajdc', name: '3年 AJDC' },
      { turn: 41, type: 'oidc', name: '4年 OIDC' },
      { turn: 48, type: 'ajdc', name: '4年 AJDC' }
    ],
    DIVISIONS: [
      { id: 'overall', label: '個人総合部門',           scoring: 'overall' },
      { id: 'v1d',     label: '1ディアボロ垂直軸部門',  scoring: 'specialist' },
      { id: 'h1d',     label: '1ディアボロ水平軸部門',  scoring: 'specialist' },
      { id: 'd2',      label: '2ディアボロ部門',        scoring: 'specialist' }
    ],
    // JDA採点規則: 総合=男子個人総合部門、スペシャリスト=スペシャリストクラス共通配点
    SCORING: {
      overall: {
        weights: { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 },
        base: { stat: 'fundamentals', elements: 4, perElement: 5 }
      },
      specialist: {
        weights: { difficulty: 45, control: 15, novelty: 30, composition: 10 }
      },
      execDeductionMax: 2,
      specialDeduction: 3,
      entryFatigue: 6
    },
    STUDY: { id: 'study', label: '勉強', gain: 10, fatigue: 4 },
    REST:  { id: 'rest',  label: '休養' },
    TOTAL_TURNS: 48,
    WORLDS_TURNS: [8, 20, 32, 44],
    STUDY_MIN: 20,          // 学力がこれ未満の月が続くと退学
    STUDY_LIMIT_MONTHS: 3,  // 退学までの連続月数
    STUDY_BONUS: 70,        // 学力がこれ以上なら練習成功率ボーナス
    // 難易度調整: ディアボロを始めた時期。初期能力のロール幅が変わる（学力は共通）
    BACKGROUNDS: [
      { id: 'college',    label: '大学から始めた', difficulty: 'ハード',         statMin: 5,  statSpread: 16 },
      { id: 'highschool', label: '高校から始めた', difficulty: 'ノーマル',       statMin: 10, statSpread: 26 },
      { id: 'juniorhigh', label: '中学から始めた', difficulty: 'イージー',       statMin: 20, statSpread: 26 },
      { id: 'childhood',  label: '幼少期から',     difficulty: 'ベリーイージー', statMin: 30, statSpread: 26 }
    ],
    // v2: 登場キャラクター（名前はdata.jsで一元管理 — 変更はここだけでよい）
    CHARACTERS: [
      { id: 'coach',  name: '剣持コーチ', role: '部の指導者。元世界チャンピオン' },
      { id: 'yota',   name: '陽太',       role: '同期のムードメーカー' },
      { id: 'mikoto', name: '美琴先輩',   role: '理論派の先輩' },
      { id: 'shion',  name: '志音',       role: '同学年の天才ライバル' },
      { id: 'kaito',  name: '魁人',       role: 'AJDC連覇中の王者' }
    ],
    EVENTS: {
      charEvents: [
        { id: 'coach1', char: 'coach', text: '「基礎ができてない奴に応用はない」剣持コーチが基礎の反復を命じてきた。',
          choices: [
            { label: '黙って従う',       effects: { stat: { id: 'fundamentals', amount: 3 }, fatigue: 8 },  result: '地味な反復の先に、確かな手応えがあった。' },
            { label: '自分の練習を主張', effects: { stat: { id: 'novelty', amount: 2 }, motivation: 1 },     result: '「…好きにしろ」意外にも認めてくれた。' } ] },
        { id: 'coach2', char: 'coach', text: '剣持コーチが自分の現役時代の映像を見せてくれた。',
          choices: [
            { label: '技術を盗む',       effects: { stat: { id: 'difficulty', amount: 3 } },                  result: '世界レベルの技術を目に焼き付けた。' },
            { label: '見せ方を学ぶ',     effects: { stat: { id: 'composition', amount: 3 } },                 result: '「魅せて初めて点になる」深い言葉だった。' } ] },
        { id: 'yota1', char: 'yota', text: '陽太が「息抜きしようぜ！」とゲームセンターに誘ってきた。',
          choices: [
            { label: '付き合う',         effects: { fatigue: -15, motivation: 1 },                            result: '思い切り笑って、心が軽くなった。' },
            { label: '練習を優先',       effects: { stat: { id: 'control', amount: 2 }, motivation: -1 },     result: '断った罪悪感はあるが、腕は上がった。' } ] },
        { id: 'yota2', char: 'yota', text: '陽太が動画撮影を手伝ってくれると言う。',
          choices: [
            { label: '演技を撮ってもらう', effects: { stat: { id: 'composition', amount: 2 } },               result: '客観的に見ると構成の粗がよく分かった。' },
            { label: '技のスローを撮る',   effects: { stat: { id: 'control', amount: 2 } },                   result: 'フォームの癖を修正できた。' } ] },
        { id: 'mikoto1', char: 'mikoto', text: '美琴先輩が採点規則の読み合わせに誘ってくれた。',
          choices: [
            { label: '構成理論を教わる', effects: { stat: { id: 'composition', amount: 3 } },                 result: '「起承転結は音楽で決まるのよ」目から鱗だった。' },
            { label: '試験勉強も教わる', effects: { study: 8 },                                               result: 'ついでに レポートの書き方まで教わった。' } ] },
        { id: 'mikoto2', char: 'mikoto', text: '美琴先輩が「あなたの演技、もったいないのよね」と呟いた。',
          choices: [
            { label: '詳しく聞く',       effects: { stat: { id: 'variety', amount: 3 } },                     result: '技の引き出しの偏りを指摘された。' },
            { label: '聞き流す',         effects: { motivation: 1 },                                          result: '自分のスタイルを貫くのも大事だ。' } ] },
        { id: 'shion1', char: 'shion', text: '志音の練習を偶然見てしまった。異次元の完成度だった。',
          choices: [
            { label: '闘志を燃やす',     effects: { motivation: 2 },                                          result: '「次の大会で絶対に勝つ」' },
            { label: '技を研究する',     effects: { stat: { id: 'novelty', amount: 2 }, fatigue: 5 },         result: '深夜まで分析ノートを書き込んだ。' } ] },
        { id: 'shion2', char: 'shion', text: '志音に「お前、最近ちょっと面白いな」と声をかけられた。',
          choices: [
            { label: '勝負を挑む',       effects: { stat: { id: 'difficulty', amount: 2 }, fatigue: 8 },      result: '即席の技比べ。負けたが、得るものがあった。' },
            { label: '素直に喜ぶ',       effects: { motivation: 1, study: -3 },                               result: '浮かれてその日は勉強が手につかなかった。' } ] },
        { id: 'kaito1', char: 'kaito', text: 'SNSで王者・魁人の新技映像が流れてきた。世界が違う。',
          choices: [
            { label: '何度も見返す',     effects: { stat: { id: 'difficulty', amount: 2 } },                  result: '理屈は分かった。あとは体で覚えるだけだ。' },
            { label: '自分の道を行く',   effects: { stat: { id: 'composition', amount: 2 } },                 result: '同じ土俵で戦わない。それも戦略だ。' } ] },
        { id: 'kaito2', char: 'kaito', text: '大会会場で魁人に「学生で面白いのが居ると聞いた」と話しかけられた。',
          choices: [
            { label: '目標です、と言う', effects: { motivation: 2 },                                          result: '「なら早く上がってこい」胸が熱くなった。' },
            { label: '倒す相手です、と言う', effects: { stat: { id: 'control', amount: 2 }, motivation: 1 },  result: '「…いい目だ」王者は笑った。' } ] }
      ],
      happenings: [
        { id: 'hap1', text: 'バイト代で新しいディアボロを購入した！', effects: { stat: { id: 'control', amount: 2 } } },
        { id: 'hap2', text: '風邪をひいてしまった……', effects: { fatigue: 15, motivation: -1 } },
        { id: 'hap3', text: '文化祭で演技を披露して大ウケだった！', effects: { stat: { id: 'composition', amount: 2 }, motivation: 1 } },
        { id: 'hap4', text: '練習動画がSNSで少しバズった！', effects: { motivation: 2 } },
        { id: 'hap5', text: '大雨で体育館が使えず、家でゆっくり過ごした。', effects: { fatigue: -10 } }
      ]
    },
    // v2: ライバル（総合部門に実在する対戦相手）
    RIVALS: [
      { id: 'shion', name: '志音', contests: ['oidc', 'ajdc'], base: 22, growth: 10, sd: 4 },
      { id: 'kaito', name: '魁人', contests: ['ajdc', 'worlds'],         base: 66, growth: 2.5, sd: 4 }
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);
