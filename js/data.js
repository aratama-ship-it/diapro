(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  DT.DATA = {
    // v3: 練習種別スタッツ4つ（0-100）。旧variety/fundamentalsは導出値へ移行しSTATSから削除
    STATS: [
      { id: 'difficulty',  label: '難易度',     desc: '技の難易度・数' },
      { id: 'novelty',     label: '新奇性',     desc: '新しい技・稀少な技' },
      { id: 'control',     label: '操作安定度', desc: '巧みさ・美しさ・洗練' },
      { id: 'composition', label: '演技構成',   desc: '楽曲・衣装・順序・起承転結' }
    ],
    // v3: ジャンル習熟4つ（0-100）。v1d/h1d/d2はDIVISIONSのidと一致させる
    GENRES: [
      { id: 'v1d', label: '1ディアボロ垂直軸' },
      { id: 'h1d', label: '1ディアボロ水平軸' },
      { id: 'd2',  label: '2ディアボロ' },
      { id: 'd3',  label: '3ディアボロ以上' }
    ],
    // v3: 毎月4枠のスロット制練習定義。枠= {genre, method}(method∈difficulty/novelty/control) または 'routine'
    // バランス調整（Task4）: 「毎月弱点狙い」の合理的方針でも4年で能力が青天井近くまで伸びきってしまい
    // AJDC総合を年1で確実に制してしまう（=毎回S）問題があったため、ゲインを3/2/3→1/1/1へ縮小。
    // 詳細な反復調整記録は .superpowers/sdd/v3-task-4-report.md 参照
    SLOTS: {
      perMonth: 4,
      methodGain: 1,
      genreGain: 1,
      routineGain: 1,
      // バランス調整（スロット別疲労・怪我リスク改定）: ルーチン構成（演技構成づくり）はデスクワーク寄りの
      // 負担が軽い枠と位置づけ、疲労・リスクとも回復（負値）に変更。高難度技は最もリスクが高い枠へ引き上げ。
      fatigue: { difficulty: 5, novelty: 4, control: 3, routine: -2 },
      risk: { difficulty: 3, novelty: 1, control: 1, routine: -1 },
      // ジャンル別怪我リスク補正（ユーザー設計）: 1D垂直軸は落下リスクが高いため+1、1D水平軸は最も安全なため-1。
      // 2D/3Dは中間で補正なし。comboスロットのinjuryRisk増分は risk[method] + genreRisk[genre] になる。
      genreRisk: { v1d: 1, h1d: -1, d2: 0, d3: 0 }
    },
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
      { id: 'd2',      label: '2ディアボロ部門',        scoring: 'specialist' },
      { id: 'd3',      label: '3ディアボロ部門',        scoring: 'specialist' }
    ],
    // JDA採点規則: 総合=男子個人総合部門、スペシャリスト=スペシャリストクラス共通配点
    // variety(多彩性)・base(基礎点)は導出値。variety=Σmin(genre,50)/200×満点、base=習熟threshold以上のジャンル数×perElement
    SCORING: {
      overall: {
        weights: { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 }
      },
      specialist: {
        weights: { difficulty: 45, control: 15, novelty: 30, composition: 10 }
      },
      base: { elements: 4, perElement: 5, threshold: 25 },
      gate: { min: 0.4, span: 0.6 },
      scale: { base: 30, mult: 0.7 },
      execDeductionMax: 2,
      specialDeduction: 3,
      entryFatigue: 6
    },
    STUDY: { id: 'study', label: '勉強', gain: 10, fatigue: 4 },
    REST:  { id: 'rest',  label: '休養' },
    // 大会前後のタイミング補正（大会月の枠と、演技翌月の休養に適用）。キーはmethod id(difficulty/control)またはroutine
    TIMING: {
      contestMonth: {
        routine:    { gainMult: 1.5, note: '（本番前の仕上げが効いた！）' },
        difficulty: { gainMult: 0.5, extraFatiguePerSlot: 1, note: '（本番前に大技の詰め込みは逆効果だ…）' },
        control:    { gainMult: 2.0, note: '（本番前の反復が効いた！）' },
        restExtra: 10,
        restNote: '（本番に向けて体を整えた）'
      },
      afterContest: {
        restExtra: 20,
        restRiskExtra: 8,
        restNote: '（大会の疲れがよく抜けた）'
      }
    },
    // 練習会: 4ヶ月ごとの定期イベント月。対象枠の伸びがブーストされる
    MEETUP: {
      interval: 4,
      offset: 3, // turn % interval === offset の月に開催（6月/10月/2月）
      boosts: { routine: 1.5, novelty: 1.5 },
      note: '（練習会で磨かれた！）',
      label: '今月は練習会！（ルーチン構成・新技開発が伸びやすい）'
    },
    TOTAL_TURNS: 48,
    WORLDS_TURNS: [8, 20, 32, 44],
    STUDY_MIN: 20,          // 学力がこれ未満の月が続くと退学
    STUDY_LIMIT_MONTHS: 3,  // 退学までの連続月数
    STUDY_BONUS: 70,        // 学力がこれ以上なら練習成功率ボーナス
    // 定期テスト: 6月/12月の月末に学力判定。赤点で2ヶ月補習（練習禁止）
    EXAMS: { turns: [3, 9, 15, 21, 27, 33, 39, 45], passLine: 40, banMonths: 2 },
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
      probs: { char: 0.15, happening: 0.05 },
      charEvents: [
        { id: 'coach1', char: 'coach', text: '「基礎ができてない奴に応用はない」剣持コーチが反復練習を命じてきた。',
          choices: [
            { label: '黙って従う',       effects: { stat: { id: 'control', amount: 3 }, fatigue: 8 },       result: '地味な反復の先に、確かな手応えがあった。' },
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
            { label: '詳しく聞く',       effects: { stat: { id: 'novelty', amount: 3 } },                     result: '技の引き出しの偏りを指摘され、新しい技を開拓したくなった。' },
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
