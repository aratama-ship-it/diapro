(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  DT.DATA = {
    // v4: 練習の「技術」軸3つ（0-100）。演技構成(composition)はジャンル非依存の単一パラメータへ分離
    METHODS: [
      { id: 'difficulty', label: '難易度',     desc: '技の難易度・数' },
      { id: 'novelty',    label: '新奇性',     desc: '新しい技・稀少な技' },
      { id: 'control',    label: '操作安定度', desc: '巧みさ・美しさ・洗練' }
    ],
    COMPOSITION: { id: 'composition', label: '演技構成', desc: '楽曲・衣装・順序・起承転結' },
    // v4: ジャンル表示順を「1D水平→1D垂直→2D→3D以上」に変更。v1d/h1d/d2/d3はDIVISIONSのidと一致させる
    GENRES: [
      { id: 'h1d', label: '1DH' },
      { id: 'v1d', label: '1DV' },
      { id: 'd2',  label: '2D' },
      { id: 'd3',  label: '3D+' }
    ],
    // 得意技カード。trainingRulesのamountはショート版の2倍処理後に加算する最終値。
    // 1回の練習につきプラス効果・マイナス効果はそれぞれ最大1枠にだけ適用する。
    TECHNIQUE_CARDS: [
      { id: 'integral', label: 'インテグラル',
        trainingRules: [{ genres: ['h1d'], method: 'difficulty', amount: 8 }] },
      { id: 'high_toss', label: 'ハイトス',
        trainingRules: [
          { genres: ['d2', 'd3'], method: 'control', amount: 6 },
          { genres: ['d2', 'd3'], method: 'novelty', amount: -1 }
        ] },
      { id: 'fts', label: 'FTS',
        trainingRules: [{ genres: ['d3'], method: 'difficulty', amount: 10 }] },
      { id: 'picture', label: 'ピクチャー',
        trainingRules: [{ genres: ['h1d', 'v1d'], method: 'novelty', amount: 3 }] },
      { id: 'pirouette', label: 'ピルエット',
        activationRules: [{ genres: ['h1d', 'v1d', 'd2', 'd3'], method: 'difficulty', amount: 1 }] },
      { id: 'sadistic', label: 'サディスティック',
        trainingRules: [{ genres: ['h1d'], method: 'novelty', amount: 5 }] },
      { id: 'on_beat', label: '音はめ',
        activationRules: [{ composition: true, amount: 2 }] },
      { id: 'body', label: 'ボディ系',
        activationRules: [{ genres: ['h1d', 'v1d', 'd2', 'd3'], method: 'novelty', amount: 2 }] },
      { id: 'happening', label: 'ハプニング', judgeRange: 5 }
    ],
    // 初期卒業生。将来は1周を終えた主人公を同じ形で追加し、activeAlumniを最大5名まで選べる。
    DEFAULT_ALUMNI: [
      { id: 'kudo_masashi', name: '工藤まさし', type: 'テクニシャン型', techniqueId: 'high_toss', rank: 'B' },
      { id: 'watanuki_shusuke', name: '綿貫しゅうすけ', type: 'イノベーター型', techniqueId: 'fts', rank: 'B' },
      { id: 'fukada_akira', name: '深田あきら', type: 'ショーマン型', techniqueId: 'on_beat', rank: 'B' }
    ],
    ALUMNI_EVENT: {
      thirdYearTurns: [28, 30, 32, 34, 36],
      fourthYearTurns: [38, 40, 42, 44, 46, 48],
      teachChance: 0.8,
      methodChance: 0.9,
      teachFailMotivation: -8,
      methodFailMotivation: -5,
      // 卒業ランクは、指導の成功率と成功時の鼓舞へ反映する。能力への直接加算は既存効果のまま。
      rankBonuses: {
        S: { chance: 0.10, motivation: 6 },
        A: { chance: 0.08, motivation: 5 },
        B: { chance: 0.05, motivation: 4 },
        C: { chance: 0.03, motivation: 3 },
        D: { chance: 0.01, motivation: 2 },
        E: { chance: 0, motivation: 1 }
      }
    },
    // 毎月のスロット制練習定義。枠= {genre, method}(method∈difficulty/novelty/control) または 'routine'
    // v4: スキルグリッド化でmethodGain/genreGainを統合しgridGain（マス1つへの単一ゲイン）に一本化
    // 2026-07-07(実プレイ反映): 毎月の枠数を4→3に削減（1ヶ月の判断の重みを増やす）。
    //   併せて「1年目は練習の伸びが早い」初期ボーナスを追加（yearOneGrowthBonus）。技術0スタートの大学でも
    //   1年目のうちにh1dを伸ばして2D/1D垂直の解禁に届きやすくする狙い。数値は暫定、最終バランスは後日再調整。
    SLOTS: {
      perMonth: 3,
      // v6(2026-07-07): スケール廃止＋相手80超に合わせ、努力で追いつけるよう練習ゲインを増量（2→4/1→2）。
      //   最終能力avg~59・卒業ランク分布がE偏重{E:19}→{D:10,E:9,C:1}に改善。1位80超は維持。
      gridGain: 4,
      routineGain: 2,
      // 1年目(1〜12ターン)は練習ゲインをこの倍率で底上げ（ルーチン含む全練習枠に適用、失敗枠は対象外）。
      yearOneGrowthBonus: 1.5,
      // 屋外練習デバフ（体育館工事イベント）: state.outdoorTurns>0 の練習セッションはゲインをこの倍率に。
      outdoorGainMult: 0.5,
      // 構成専用の成長減衰（2026-07-15 バランス修正a）: 実測で構成がほぼ全員100に飽和し
      // Type判定がショーマン型に吸われる＋静岡パフォが終盤確定勝ちになっていたため、技術より強い減衰に。
      // 85以上は練習では伸びない(mult 0 → +0、最低+1保証・特別指導/絶好調ボーナスも無効)。
      // 85超はイベント(サーカス観覧・遠征・Mochi Power等)でのみ上振れする＝"実戦とひらめきの領域"。
      compositionCurve: [
        { min: 85, mult: 0 },
        { min: 70, mult: 0.25 },
        { min: 55, mult: 0.5 },
        { min: 40, mult: 0.75 },
        { min: 0,  mult: 1.0 }
      ],
      // バランス調整（スロット別疲労・怪我リスク改定）: ルーチン構成（演技構成づくり）はデスクワーク寄りの
      // 負担が軽い枠と位置づけ、疲労・リスクとも回復（負値）に変更。高難度技は最もリスクが高い枠へ引き上げ。
      fatigue: { difficulty: 5, novelty: 4, control: 3, routine: -2 },
      risk: { difficulty: 3, novelty: 1, control: 1, routine: -1 },
      // ジャンル別怪我リスク補正（ユーザー設計）: 1D垂直軸は落下リスクが高いため+1、1D水平軸は最も安全なため-1。
      // 2D/3Dは中間で補正なし。comboスロットのinjuryRisk増分は risk[method] + genreRisk[genre] になる。
      genreRisk: { v1d: 1, h1d: -1, d2: 0, d3: 0 }
    },
    // 大会: 8月OIDC(大阪国際)、3月AJDC(全日本選手権=頂点)、1月 静岡DC(参加資格全員)。
    // ※CONTESTSはインデックス参照するテストがあるため、静岡は末尾に追加(0-7=oidc/ajdc維持)。順序依存の検索はコード側で最小turnを取る。
    CONTESTS: [
      { turn: 5,  type: 'oidc', name: '1年 OIDC' },
      { turn: 12, type: 'ajdc', name: '1年 AJDC' },
      { turn: 17, type: 'oidc', name: '2年 OIDC' },
      { turn: 24, type: 'ajdc', name: '2年 AJDC' },
      { turn: 29, type: 'oidc', name: '3年 OIDC' },
      { turn: 36, type: 'ajdc', name: '3年 AJDC' },
      { turn: 41, type: 'oidc', name: '4年 OIDC' },
      { turn: 48, type: 'ajdc', name: '4年 AJDC' },
      { turn: 10, type: 'shizuoka', name: '1年 静岡DC' },
      { turn: 22, type: 'shizuoka', name: '2年 静岡DC' },
      { turn: 34, type: 'shizuoka', name: '3年 静岡DC' },
      { turn: 46, type: 'shizuoka', name: '4年 静岡DC' }
    ],
    DIVISIONS: [
      { id: 'overall', label: '個人総合部門',           scoring: 'overall',     contests: ['oidc', 'ajdc'] },
      { id: 'h1d',     label: '1ディアボロ水平軸部門',  scoring: 'specialist',  contests: ['oidc', 'ajdc'] },
      { id: 'v1d',     label: '1ディアボロ垂直軸部門',  scoring: 'specialist',  contests: ['oidc', 'ajdc'] },
      { id: 'd2',      label: '2ディアボロ部門',        scoring: 'specialist',  contests: ['oidc', 'ajdc'] },
      { id: 'd3',      label: '3ディアボロ部門',        scoring: 'specialist',  contests: ['oidc', 'ajdc'] },
      // 静岡DC: テクニカル=12項目(4ジャンル×3技術)の総合、構成は不参加。パフォーマンス=構成のみ
      { id: 'technical',   label: 'テクニカル部門',     scoring: 'technical',   contests: ['shizuoka'] },
      { id: 'performance', label: 'パフォーマンス部門', scoring: 'performance', contests: ['shizuoka'] }
    ],
    // 技術解禁ツリー: ジャンルは基礎ジャンルの習熟(genreAvg)がthresholdを「超える」と解禁される。
    // requires=null は根（常時解禁）。h1d→{v1d,d2}→d3。閾値は厳密に > threshold。
    SKILL_TREE: {
      h1d: { requires: null },
      v1d: { requires: { genre: 'h1d', threshold: 20 } },
      d2:  { requires: { genre: 'h1d', threshold: 20 } },
      d3:  { requires: { genre: 'd2',  threshold: 20 } }
    },
    // JDA採点規則: 総合=男子個人総合部門、スペシャリスト=スペシャリストクラス共通配点
    // variety(多彩性)・base(基礎点)は導出値。variety=Σmin(genreAvg,50)/200×満点、base=genreAvg≥thresholdのジャンル数×perElement
    // v4: スペシャリスト部門のゲート（習熟による減衰）は廃止。スペシャは直接skills[d]の3マスを採点に使う
    SCORING: {
      overall: {
        weights: { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 }
      },
      specialist: {
        weights: { difficulty: 45, control: 15, novelty: 30, composition: 10 }
      },
      // 静岡DC テクニカル部門: 12項目(4ジャンル×3技術)の平均を単一の総合点に（構成は含めない）
      technical: {
        weights: { technical: 100 }
      },
      // 静岡DC パフォーマンス部門: 構成のみで争う（構成95以上で優勝ラインになるよう相手レベルを調整）
      performance: {
        weights: { composition: 100 }
      },
      base: { elements: 4, perElement: 5, threshold: 25 },
      // v6（2026-07-07 実プレイ反映）: 各採点項目に40%下限を導入（能力0で満点の40%、能力100で100%）。
      componentFloor: 0.4,
      // v6: 40%下限で素点合計が既に妥当な帯(40〜100)になるため旧スケール換算を廃止（base:0/mult:1＝素点そのまま表示）。
      scale: { base: 0, mult: 1 },
      // v4新ミスモデル（平均3〜4ミス/演技、ノーミスは高操作安定のみの偉業になるよう設計）
      // rate = clamp(base − control×controlCoef + fatigue×fatigueCoef, min, max)（controlは部門参照値、0-100%）
      // 判定回数 = rolls + (部門のdifficulty参照値 ≥ hardLine ? hardBonusRolls : 0)
      miss: { rolls: 6, hardBonusRolls: 2, hardLine: 60, base: 70, controlCoef: 0.5, fatigueCoef: 0.3, min: 5, max: 90, injuredPenalty: 15 },
      execDeductionMax: 2,
      specialDeduction: 3,
      entryFatigue: 6
    },
    // 演技方針（改善プラン#1・2026-07-16）: 大会ごとに1回選び全部門共通。
    // 難易度点(diffMult)とミス率(missDelta)だけを動かす＝相手レベル(v5調整)は不変。
    // 値は事前sim(tests/simulate-strategies.js 第4引数)で検証して確定する
    // missMult=乗算の根拠(2026-07-16 sim): 固定加算(±15/±25)では方針の損益がゲーム状態に依存せず、
    // どちらかが常に支配/無意味になった(±15=攻め支配、±25=安全微優位)。ミス率を乗算にすると
    // 「操作安定度が高い(素のミス率が低い)選手ほど攻めのコストが安い」＝状態依存の賭けとして機能する
    POLICIES: {
      safe:   { id: 'safe',   label: '安全にまとめる', icon: '🛡️', diffMult: 0.90, missMult: 0.5, hint: '難易度を落とす代わりにミスを減らす' },
      normal: { id: 'normal', label: 'いつも通り',     icon: '🎯', diffMult: 1.0,  missMult: 1.0, hint: '練習どおりの構成で臨む' },
      attack: { id: 'attack', label: '攻め切る',       icon: '🔥', diffMult: 1.10, missMult: 1.5, hint: '難易度を上げる代わりにミスが増える' }
    },
    // v4: モブ対戦相手の命名プール（日本人選手風）。runDivisionでrngを消費せず決定的に割り当てる
    OPPONENT_NAMES: [
      '蒼真', '隼人', '玲於', '悠斗', '湊', '葵', '颯太', '大和',
      '律', '樹', '陸斗', '海翔', '俊介', '慎之介', '光希', '達也',
      '直樹', '亮平', '拓海', '翔平', '健心', '一颯', '玄', '遼'
    ],
    // 国際大会(OIDC等)用の対戦相手名: 台湾風・フランス風・アメリカ風を混在
    OPPONENT_NAMES_INTL: [
      'Chen Yu-hao', 'Lin Chih-wei', 'Wang Po-han', 'Huang Kai-lin', 'Chang Ming-jie', 'Lee Cheng-en', 'Wu Shang-ju', 'Tsai Ping',
      'Julien Dubois', 'Antoine Moreau', 'Léo Girard', 'Mathis Roux', 'Baptiste Faure', 'Théo Lambert', 'Rémi Blanc', 'Hugo Mercier',
      'Jake Miller', 'Ryan Carter', 'Tyler Brooks', 'Ethan Cole', 'Nathan Reed', 'Aaron Scott', 'Dylan Price', 'Cody Turner',
      'William Lee'
    ],
    // やる気: 0-100の連続値。帯ラベルと寄与係数
    MOTIVATION: {
      initial: 50,
      bands: [
        { min: 80, label: '絶好調' },
        { min: 60, label: '好調' },
        { min: 40, label: '普通' },
        { min: 20, label: '不調' },
        { min: 0,  label: '絶不調' }
      ],
      greatCoef: 0.003,   // outcomeProbs: (motivation-50)*greatCoef → ±0.15
      failCoef: 0.0015,   // fail側: -(motivation-50)*failCoef → ∓0.075
      judgeCoef: 0.08,    // judgeMod: (motivation-50)*judgeCoef → ±4
      hotLine: 80,        // 絶好調帯
      hotBonus: 1,        // 絶好調時、成功スロットのゲイン+1
      reversion: 0.1,     // 毎月、50への平均回帰率（0/100張り付きの二極化を防ぐ減衰項）
      greatBonus: 8,      // 練習で大成功したときのやる気上昇（全種別・大幅）
      noveltySuccessBonus: 3, // 新技開発が成功したときのやる気上昇（新しい技を覚えた高揚。大成功はgreatBonus側）
      failPenalty: 3      // 練習失敗（＝新技開発の失敗のみ）でのやる気低下
    },
    // 覚醒モードの調整値（2026-07-15）。hard=経歴「大学から」(college)限定の強化:
    //   ハードは覚醒が「Sへの賭けルート」になる設計（やる気80で発動・×2.4・3-5ヶ月・回数無制限）。
    //   sim実測(N=800・おみくじ導入後): 全ジャンル育成の最適プレイでS≈2%（弱点補強2.5%/全力疾走1.75%）。
    //   ※おみくじの好運勢(やる気+)がハードの覚醒頻度を押し上げるため、発動線80/倍率2.4で相殺調整済み。
    //   ノーマル/イージーは従来どおり（motivationLine 90・×1.5・2-4ヶ月・年代枠1回ずつ）。
    AWAKEN: {
      mult: 1.5, motivationLine: 90, durationBonus: 0,
      hard: { mult: 2.4, motivationLine: 80, durationBonus: 1, noSlotLimit: true }
    },
    // 初詣おみくじ（2026-07-15）: 毎年1月(turn 10/22/34/46)の頭に全モード共通で発生する固定イベント。
    //   大凶=能力マイナスの「大変悪いレアイベント」枠。ランクの下振れ(D/E)を残すための運要素。
    //   確率は合計1.0。効果は events の applyEffects 形式（能力プラスは覚醒中ブースト対象になる）。
    OMIKUJI: {
      turns: [10, 22, 34, 46],
      fortunes: [
        { id: 'daikichi', label: '大吉', p: 0.12, text: 'なんと大吉！ 今年は何をやってもうまくいく気がする！',
          effects: { stats: [{ id: 'difficulty', amount: 2 }, { id: 'novelty', amount: 2 }, { id: 'control', amount: 2 }], motivation: 10 } },
        { id: 'chukichi', label: '中吉', p: 0.20, text: '中吉。「思い描いた舞台に近づく年」だそうだ。',
          effects: { stat: { id: 'composition', amount: 3 }, motivation: 6 } },
        { id: 'shokichi', label: '小吉', p: 0.25, text: '小吉。焦らずコツコツ、が吉らしい。',
          effects: { motivation: 5, fatigue: -5 } },
        { id: 'suekichi', label: '末吉', p: 0.23, text: '末吉。まあ、こんなものか。',
          effects: { motivation: 2 } },
        { id: 'kyo', label: '凶', p: 0.15, text: '凶……。「慢心に足元をすくわれる」と書いてある。',
          effects: { stat: { id: 'control', amount: -2 }, motivation: -6 } },
        { id: 'daikyo', label: '大凶', p: 0.05, text: '大凶——！ 帰り道で転び、ディアボロも川に流れた。今年は前途多難だ……',
          effects: { stats: [{ id: 'difficulty', amount: -6 }, { id: 'novelty', amount: -6 }, { id: 'control', amount: -6 }, { id: 'composition', amount: -6 }], motivation: -15, fatigue: 10 } }
      ]
    },
    // 新技開発の大成功で発生するSNS投稿イベント（投稿=高確率バズでやる気↑・低確率で既存技判明↓）
    SNS_EVENT: { viralChance: 0.8, viralMotivation: 15, existingPenalty: 8 },
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
    // 定期イベント（固定・非ランダム）: 通常版はturn、ショート版は奇数月側のshortTurnで必ず1回発生する。
    // welcome=新入生歓迎会: 現在解禁済みジャンルの全技術(難易度/新奇性/操作安定度)が gain ずつ上がる。
    SCHEDULED_EVENTS: [
      { turn: 1, shortTurn: 2, id: 'welcome', name: '新入生歓迎会', text: '新入生歓迎会！先輩たちが基礎のコツを教えてくれた。' },
      // 協会事務所（1年6月・必ず発生）。行く→SAITO会長に会う(metSaitoフラグ)＝以降 台湾合宿の誘いが発生し得る
      { turn: 3, shortTurn: 6, id: 'saito_office', name: 'ディアボロ協会事務所', speaker: '🏢 ディアボロ協会',
        text: 'ディアボロ協会の事務所に顔を出さないか、と声をかけられた。行ってみる？',
        choices: [
          { label: '行く', effects: { motivation: 10, flag: 'metSaito' },
            result: '事務所でSAITO会長に挨拶できた。「若いのは応援するよ」と励まされ、やる気が湧いた！' },
          { label: '行かない', effects: {},
            result: '今回は事務所には行かなかった。（SAITO会長には会えなかった）' } ] },
      // 大会前の緊張（1年7月・初の公式大会OIDCの前月）
      { turn: 4, shortTurn: 4, id: 'nerves', name: '大会前の緊張', speaker: '💭 大会前',
        text: '初めての公式大会が近づいてきた。緊張で、少し眠れない夜が続く……',
        choices: [
          { label: '深呼吸して落ち着く', effects: { motivation: 8 }, result: '「大丈夫、練習してきた」肩の力がふっと抜けた。' },
          { label: '本番を想定して詰める', effects: { stat: { id: 'control', amount: 2 }, fatigue: 8 }, result: '通し練習を重ね、不安を自信に変えた。' } ] },
      // 後輩が入部（2年4月）
      { turn: 13, shortTurn: 14, id: 'junior', name: '後輩が入部', speaker: '🎋 新学期',
        text: '2年生になり、後輩が入ってきた。慕われて、教える立場になった。',
        choices: [
          { label: '熱心に指導する', effects: { stat: { id: 'control', amount: 2 }, fatigue: 6 }, result: '教えるうちに、自分の基礎も見つめ直せた。' },
          { label: '背中で見せる', effects: { motivation: 10 }, result: '「あんな先輩になりたい」憧れの目が力になった。' } ] },
      // 進路の悩み（4年4月）
      { turn: 37, shortTurn: 38, id: 'career', name: '進路の悩み', speaker: '🎓 進路',
        text: '4年生。周りは就活を始めた。ディアボロと将来、どう向き合う……？',
        choices: [
          { label: '競技に専念する', effects: { motivation: 12, study: -5 }, result: '「悔いの残らないように」腹をくくった。' },
          { label: '将来も見据える', effects: { study: 8, motivation: -3 }, result: '現実と向き合い、二足のわらじを選んだ。' } ] },
      // 夏合宿（2年6月・国内版の強化合宿）。台湾=新奇性に対し、こちらは難易度/操作を追い込む。疲労大・学業のツケ
      { turn: 15, shortTurn: 16, id: 'summer_camp', name: '夏合宿', speaker: '☀ 夏合宿',
        text: '2年の夏。部の強化合宿の季節がやってきた。山ごもりで朝から晩まで技術を追い込むらしい。参加する？',
        choices: [
          { label: '参加する', effects: { stats: [{ id: 'difficulty', amount: 4 }, { id: 'control', amount: 4 }], motivation: 5, fatigue: 28, study: -6 },
            result: '回して回して回しまくった。技術は大きく伸びたが、心身ともにヘトヘトだ……' },
          { label: '見送る', effects: { fatigue: -12, study: 6, motivation: -8 },
            result: '合宿は見送り、自分のペースで練習と学業を進めた。' } ] }
    ],
    SCHEDULED_WELCOME_GAIN: 10,
    // JJF(ジャグリング全国大会・ディアボロ): 毎年10月開催・9月予選。大会扱い。
    //   予選=参加任意。突破判定は「全パラメータ(4ジャンル習熟＋演技構成)がバランス良く高いか」。
    //   passSure(全日本総合top-3相当)=確実突破 / passHalf(入賞圏4-8相当)=50% / それ未満=不可。
    //   突破でやる気↑＋決勝進出(+finalistPoints)。決勝は10人・上位3名のみ追加ポイント(全日本優勝より難しい高レベル)。
    JJF: {
      qualifierTurns: [6, 18, 30, 42],   // 9月
      finalTurns: [7, 19, 31, 43],       // 10月
      passSure: { avg: 60, min: 50 },
      passHalf: { avg: 50, min: 40 },
      passMotivation: 12,
      finalistPoints: 10,
      finalEntrants: 10,
      finalRankPoints: [30, 20, 10],     // 決勝1位/2位/3位の追加ポイント（それ以外は0）
      finalLevel: { base: 90, growth: 0.5, sd: 6 } // 全日本優勝より明確に難しい高レベル（上位3名は能力80級でも稀）
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
    // 定期テスト: 7月/2月の月末に学力判定。赤点で2ヶ月補習（練習禁止）。イベント枠としても通知する
    EXAMS: { turns: [4, 11, 16, 23, 28, 35, 40, 47], passLine: 40, banMonths: 2 },
    // 難易度調整: ディアボロを始めた時期。初期能力のロール幅が変わる（学力は共通）
    BACKGROUNDS: [
      { id: 'college',    label: '大学から始めた', difficulty: 'ハード',         statMin: 0,  statSpread: 0, compMin: 3, compSpread: 8 },
      { id: 'highschool', label: '高校から始めた', difficulty: 'ノーマル',       statMin: 10, statSpread: 26 },
      { id: 'juniorhigh', label: '中学から始めた', difficulty: 'イージー',       statMin: 15, statSpread: 26, shortStatMin: 12 }
      // childhood(幼少期から/ベリーイージー)は2026-07-15に廃止（イージーと差が薄く不要のため）
    ],
    // v2: 登場キャラクター（名前はdata.jsで一元管理 — 変更はここだけでよい）
    CHARACTERS: [
      { id: 'coach',  name: '野中コーチ', role: '部の指導者。元世界チャンピオン' },
      { id: 'yota',   name: 'コースケ',   role: '同期のムードメーカー・お調子者' },
      { id: 'mikoto', name: '美琴先輩',   role: '理論派の先輩' },
      { id: 'shion',  name: '志音',       role: '同学年の天才ライバル' },
      { id: 'kaito',  name: '魁人',       role: 'AJDC連覇中の王者' },
      { id: 'irie',   name: 'イリエ',     role: '同期のディアボロ仲間' },
      { id: 'ujiji',  name: 'うじじ',     role: '大陸からの刺客' },
      { id: 'kazuki', name: 'Dr. Kazuki', role: '（役割・イベントは後日設定）' },
      { id: 'george', name: '大道芸人ジョージ', role: '流しの大道芸人。魅せる技術の達人' },
      { id: 'saito', name: 'SAITO会長', role: '協会事務所と台湾合宿をつなぐ人物' },
      { id: 'youtube', name: 'YouTube', role: '解説動画を介した状況イベント' },
      { id: 'malaysia', name: 'マレーシア遠征', role: '海外遠征の状況イベント' }
    ],
    EVENTS: {
      probs: { char: 0.125, happening: 0.05 },
      // 現状オン（発火する）キャラ別イベント。方針(2026-07): 野中コーチ＋コースケ(旧・陽太)のみ。台湾合宿・YouTubeは状況イベントとして常時オン。
      charEvents: [
        { id: 'coach1', char: 'coach', text: '「基礎ができてない奴に応用はない」野中コーチが反復練習を命じてきた。',
          choices: [
            { label: '黙って従う',       effects: { stat: { id: 'control', amount: 3 }, fatigue: 8 },       result: '地味な反復の先に、確かな手応えがあった。' },
            { label: '自分の練習を主張', effects: { stat: { id: 'novelty', amount: 2 }, motivation: 8 },     result: '「…好きにしろ」意外にも認めてくれた。' } ] },
        { id: 'coach2', char: 'coach', text: '野中コーチが自分の現役時代の映像を見せてくれた。',
          choices: [
            { label: '技術を盗む',       effects: { stat: { id: 'difficulty', amount: 3 } },                  result: '世界レベルの技術を目に焼き付けた。' },
            { label: '見せ方を学ぶ',     effects: { stat: { id: 'composition', amount: 3 } },                 result: '「魅せて初めて点になる」深い言葉だった。' } ] },
        { id: 'coach3', char: 'coach', text: '野中コーチが「お前、本番でこうなったらどうする？」と不測の状況を突きつけてきた。',
          choices: [
            { label: '冷静に対処する', effects: { stat: { id: 'control', amount: 3 } }, result: '想定外にも動じない胆力がついた。' },
            { label: '攻めの一手で返す', effects: { stat: { id: 'difficulty', amount: 2 }, motivation: 6 }, result: '「面白い、それでいい」コーチが珍しく笑った。' } ] },
        // コースケ（お調子者・同期のムードメーカー。旧・陽太）
        { id: 'yota1', char: 'yota', text: 'コースケが「息抜きしようぜ！」とゲームセンターに誘ってきた。',
          choices: [
            { label: '付き合う',         effects: { fatigue: -15, motivation: 8 },                            result: '思い切り笑って、心が軽くなった。' },
            { label: '練習を優先',       effects: { stat: { id: 'control', amount: 2 }, motivation: -8 },     result: '断った罪悪感はあるが、腕は上がった。' } ] },
        { id: 'yota2', char: 'yota', text: 'コースケが動画撮影を手伝ってくれると言う。',
          choices: [
            { label: '演技を撮ってもらう', effects: { stat: { id: 'composition', amount: 2 } },               result: '客観的に見ると構成の粗がよく分かった。' },
            { label: '技のスローを撮る',   effects: { stat: { id: 'control', amount: 2 } },                   result: 'フォームの癖を修正できた。' } ] },
        { id: 'yota3', char: 'yota', text: 'コースケが「お前の演技、俺が実況したら映えると思うんだよな」と言い出した。',
          choices: [
            { label: '撮影を頼む', effects: { stat: { id: 'composition', amount: 2 }, motivation: 6 }, result: '賑やかな実況付き動画で、見せ場がはっきり分かった。' },
            { label: '練習に集中する', effects: { stat: { id: 'control', amount: 2 } }, result: '「相変わらず真面目だなー」呆れ半分、感心半分。' } ] },
        // イリエ: 過去のキャライベント(旧・美琴先輩「採点規則の読み合わせ」)の内容を流用
        { id: 'irie1', char: 'irie', text: 'イリエが採点規則の読み合わせに誘ってくれた。',
          choices: [
            { label: '構成理論を教わる', effects: { stat: { id: 'composition', amount: 3 } },                 result: '「起承転結は音楽で決まる」目から鱗だった。' },
            { label: '試験勉強も教わる', effects: { study: 8 },                                               result: 'ついでに レポートの書き方まで教わった。' } ] },
        // 台湾合宿: 一度きりの大きな決断イベント。行く=技術と刺激だが疲労大・学業のツケ / 行かない=堅実に学業
        // requires: 協会事務所イベントでSAITO会長に会っている(metSaito)場合のみ発生
        { id: 'taiwan_camp', char: 'saito', speaker: 'SAITO会長', requires: 'metSaito', minTurn: 13,
          text: 'SAITO会長が「台湾に合宿に行かないか？」と誘ってくれた。海外の強豪と練習できる、めったにない機会だ。',
          choices: [
            { label: '行く', effects: { stats: [{ id: 'novelty', amount: 8 }, { id: 'control', amount: 3 }], motivation: 12, fatigue: 25, study: -12 },
              result: '台湾の強豪から新しい技を数多く吸収した！新奇性が大きく伸び、刺激も持ち帰った。ただし疲労と、休んだ授業のツケも残った……' },
            { label: '行かない', effects: { study: 6, motivation: -3 },
              result: '「また次の機会に」丁重に断り、今回は国内での練習と学業に専念した。' } ] },
        // YouTube解説動画: 3択。コメント=学び(新奇性) / 高評価=やる気 / 低評価=軽い罠
        { id: 'youtube', char: 'youtube', speaker: '📺 YouTube',
          text: 'ディアボロの技の解説動画を見つけた。よく分からなかったが……どうする？',
          choices: [
            { label: '高評価ボタンを押す', effects: { motivation: 8 },
              result: 'とりあえず高評価。誰かを応援するのは気持ちがいい。' },
            { label: 'コメントで質問する', effects: { stat: { id: 'novelty', amount: 2 }, motivation: 3 },
              result: '思い切って質問をコメント。投稿者が技のコツを丁寧に教えてくれた！' },
            { label: '低評価ボタンを押す', effects: { motivation: -6 },
              result: 'よく分からないまま低評価を押した。少し大人げなかったかも……' } ] },
        // 大道芸人ジョージ（流しの大道芸人・NPC）: 魅せる技術＝演技構成/新奇性に効く人物イベント
        { id: 'george1', char: 'george',
          text: '街角で大道芸人のジョージが人だかりを作っていた。声をかけてみる？',
          choices: [
            { label: '見せ技を教わる', effects: { stat: { id: 'novelty', amount: 3 } },
              result: 'ジョージ直伝の"魅せ技"を伝授された。「技はよ、驚かせてナンボだぜ」' },
            { label: '飛び入りで共演する', effects: { stat: { id: 'composition', amount: 2 }, motivation: 6 },
              result: '路上ライブに飛び入り。観客の熱気の中で、構成の組み立て方を体で掴んだ。' } ] },
        { id: 'george2', char: 'george',
          text: 'ジョージが「相棒、次の街まで一緒に流さねえか？」と誘ってきた。',
          choices: [
            { label: 'ついて行く（週末だけ）', effects: { stat: { id: 'composition', amount: 3 }, fatigue: 6 },
              result: 'あちこちで投げ銭ライブ。人前で魅せる度胸と構成力がついた。' },
            { label: '練習を優先する', effects: { stat: { id: 'control', amount: 2 }, motivation: 4 },
              result: '「真面目だねぇ」ジョージは笑って旅立っていった。地道な反復に集中できた。' } ] },
        // マレーシア国際大会（海外遠征の決断イベント）: 台湾合宿(新奇性)と役割を分け、舞台度胸＝演技構成/やる気に振る
        { id: 'malaysia_trip', char: 'malaysia', speaker: '✈ マレーシア遠征', minTurn: 13,
          text: 'マレーシアの国際大会に招待が届いた。海外の舞台で腕試しできる、またとない機会だ。遠征する？',
          choices: [
            { label: '遠征する', effects: { stats: [{ id: 'composition', amount: 5 }, { id: 'novelty', amount: 3 }], motivation: 15, fatigue: 22, study: -10 },
              result: '灼熱の会場、多国籍のパフォーマーたち。刺激的な舞台で度胸と構成力を持ち帰った！（疲労と、休んだ授業のツケも残った……）' },
            { label: '国内に専念する', effects: { study: 6, motivation: -8 },
              result: '「また次の機会に」丁重に断り、今回は国内の練習と学業に専念した。' } ] }
      ],
      // 現状オフ（無効化）のキャラ別イベント。ゲームからは未参照。復活時は charEvents へ戻す。（2026-07方針: 美琴先輩・志音・魁人は保留）
      charEventsDisabled: [
        { id: 'mikoto1', char: 'mikoto', text: '美琴先輩が採点規則の読み合わせに誘ってくれた。',
          choices: [
            { label: '構成理論を教わる', effects: { stat: { id: 'composition', amount: 3 } },                 result: '「起承転結は音楽で決まるのよ」目から鱗だった。' },
            { label: '試験勉強も教わる', effects: { study: 8 },                                               result: 'ついでに レポートの書き方まで教わった。' } ] },
        { id: 'mikoto2', char: 'mikoto', text: '美琴先輩が「あなたの演技、もったいないのよね」と呟いた。',
          choices: [
            { label: '詳しく聞く',       effects: { stat: { id: 'novelty', amount: 3 } },                     result: '技の引き出しの偏りを指摘され、新しい技を開拓したくなった。' },
            { label: '聞き流す',         effects: { motivation: 8 },                                          result: '自分のスタイルを貫くのも大事だ。' } ] },
        { id: 'mikoto3', char: 'mikoto', text: '卒業を控えた美琴先輩が「私の技のノート、あなたに託すわ」と差し出した。',
          choices: [
            { label: '構成理論を継ぐ', effects: { stat: { id: 'composition', amount: 3 } }, result: '先輩の理論の結晶。構成の引き出しが増えた。' },
            { label: '技の記録を継ぐ', effects: { stat: { id: 'novelty', amount: 2 }, motivation: 5 }, result: '書き込まれた技の数々に胸が高鳴った。' } ] },
        { id: 'shion1', char: 'shion', text: '志音の練習を偶然見てしまった。異次元の完成度だった。',
          choices: [
            { label: '闘志を燃やす',     effects: { motivation: 15 },                                          result: '「次の大会で絶対に勝つ」' },
            { label: '技を研究する',     effects: { stat: { id: 'novelty', amount: 2 }, fatigue: 5 },         result: '深夜まで分析ノートを書き込んだ。' } ] },
        { id: 'shion2', char: 'shion', text: '志音に「お前、最近ちょっと面白いな」と声をかけられた。',
          choices: [
            { label: '勝負を挑む',       effects: { stat: { id: 'difficulty', amount: 2 }, fatigue: 8 },      result: '即席の技比べ。負けたが、得るものがあった。' },
            { label: '素直に喜ぶ',       effects: { motivation: 8, study: -3 },                               result: '浮かれてその日は勉強が手につかなかった。' } ] },
        { id: 'shion3', char: 'shion', text: '志音が「次の大会、どっちが上か決着つけようぜ」と不敵に笑った。',
          choices: [
            { label: '受けて立つ', effects: { stat: { id: 'difficulty', amount: 2 }, motivation: 10 }, result: 'ライバルの存在が、自分を一段引き上げる。' },
            { label: '自分の演技に集中', effects: { stat: { id: 'composition', amount: 2 }, motivation: 6 }, result: '「勝負は結果がつける」静かに闘志を燃やした。' } ] },
        { id: 'kaito1', char: 'kaito', text: 'SNSで王者・魁人の新技映像が流れてきた。世界が違う。',
          choices: [
            { label: '何度も見返す',     effects: { stat: { id: 'difficulty', amount: 2 } },                  result: '理屈は分かった。あとは体で覚えるだけだ。' },
            { label: '自分の道を行く',   effects: { stat: { id: 'composition', amount: 2 } },                 result: '同じ土俵で戦わない。それも戦略だ。' } ] },
        { id: 'kaito2', char: 'kaito', text: '大会会場で魁人に「学生で面白いのが居ると聞いた」と話しかけられた。',
          choices: [
            { label: '目標です、と言う', effects: { motivation: 15 },                                          result: '「なら早く上がってこい」胸が熱くなった。' },
            { label: '倒す相手です、と言う', effects: { stat: { id: 'control', amount: 2 }, motivation: 8 },  result: '「…いい目だ」王者は笑った。' } ] },
        { id: 'kaito3', char: 'kaito', text: '魁人が「お前の演技、去年より断然良くなってる」と真顔で言った。',
          choices: [
            { label: '素直に受け取る', effects: { motivation: 12 }, result: '王者に認められた事実が、大きな自信になった。' },
            { label: 'まだまだです、と返す', effects: { stat: { id: 'control', amount: 2 }, motivation: 8 }, result: '「その飢えがいい」王者は満足げに頷いた。' } ] }
      ],
      happenings: [
        { id: 'hap1', text: 'バイト代で新しいディアボロを購入した！', effects: { stat: { id: 'control', amount: 2 } } },
        { id: 'hap2', text: '風邪をひいてしまった……', effects: { fatigue: 15, motivation: -8 } },
        { id: 'hap3', text: '文化祭で演技を披露して大ウケだった！', effects: { stat: { id: 'composition', amount: 2 }, motivation: 8 } },
        { id: 'hap4', text: '練習動画がSNSで少しバズった！', effects: { motivation: 15 } },
        { id: 'hap5', text: '大雨で体育館が使えず、家でゆっくり過ごした。', effects: { fatigue: -10 } },
        // outdoor=次の練習セッションのゲインを半減させるデバフ（体育館工事）
        { id: 'hap_gym', text: '体育館が工事のため、屋外での練習を余儀なくされた。次の練習は伸びが半減してしまう……', effects: { outdoor: 1 } },
        // サーカス観覧: プロのディアボロ演技を見て構成のヒント（演技構成が少しアップ）
        { id: 'hap_circus', text: 'サーカスを見に行った。プロのディアボロ演技に見入り、構成のヒントを得た。', effects: { stat: { id: 'composition', amount: 3 } } },
        // 望月勇作さんに偶然出会う: Mochi Powerで構成力とやる気アップ
        { id: 'hap_mochi', text: '偶然、望月勇作さんに出会った。「Mochi Power」を浴び、構成力とやる気が上がった！', effects: { stat: { id: 'composition', amount: 5 }, motivation: 10 } },
        // --- 追加ハプニング（2026-07 バッチ） ---
        { id: 'hap_string', text: 'バイト代で新しいストリングに交換した。手元がぐっと安定した。', effects: { stat: { id: 'control', amount: 2 } } },
        { id: 'hap_sleep',  text: '課題に追われて寝不足……練習に身が入らなかった。', effects: { fatigue: 12, motivation: -5 } },
        { id: 'hap_teach',  text: '後輩にディアボロの基礎を教えた。教えることで自分の理解も深まった。', effects: { stat: { id: 'control', amount: 2 }, motivation: 6 } },
        { id: 'hap_street', text: '地元のイベントで大道芸を披露！ 拍手喝采を浴びて自信がついた。', effects: { stat: { id: 'composition', amount: 2 }, motivation: 12 } },
        { id: 'hap_slump',  text: '原因不明のスランプ……どうにも調子が上がらない。', effects: { motivation: -10 } },
        { id: 'hap_overseas', minTurn: 13, text: '海外トップ選手の新作動画に衝撃を受けた。新しい発想が湧いてきた。', effects: { stat: { id: 'novelty', amount: 3 }, motivation: 8 } },
        { id: 'hap_malaysia', minTurn: 13, text: 'マレーシア合宿で、現地の歌を歌わされた。陽気なノリが構成のヒントになった。', effects: { stat: { id: 'composition', amount: 1 } } },
        { id: 'hap_gainen', text: 'コースケの概念モノマネを見ていたら、ふと新しい技を思いついた！', effects: { genreStat: { genre: 'v1d', id: 'novelty', amount: 3 } } },
        // 大谷はちみつ園（地元スポンサー）: 差し入れで体力回復＋やる気アップ
        { id: 'hap_honey', text: '地元の大谷はちみつ園がスポンサーについてくれた！ 差し入れのはちみつで、疲れが吹き飛んだ。', effects: { motivation: 10, fatigue: -8 } }
      ],
      // ショート版の奇数月を必ず1イベントにするための日常枠。数値効果は持たず、
      // 強イベントの従来確率（キャラ12.5%・ハプニング5%）を維持して難易度の膨張を防ぐ。
      quietEvents: [
        { id: 'quiet_string', text: 'ストリングを張り替えながら、今月の練習を静かに振り返った。', effects: {} },
        { id: 'quiet_clean', text: '部室の大掃除。棚の奥から、先輩たちの古い大会パンフレットが出てきた。', effects: {} },
        { id: 'quiet_video', text: '練習動画を見返した。大きな発見はなかったが、今の自分の形が少し見えた。', effects: {} },
        { id: 'quiet_music', text: '部員同士で演技に使いたい曲を聴かせ合った。好みの違いで少し盛り上がった。', effects: {} },
        { id: 'quiet_floor', text: '体育館の床に落下位置の跡が残っていた。今日もいつもの場所で回し続けた。', effects: {} },
        { id: 'quiet_rain', text: '窓の外は雨。ディアボロの回転音だけが体育館に響いていた。', effects: {} },
        { id: 'quiet_note', text: '練習ノートに、できたことと次に試したいことを一行ずつ書いた。', effects: {} },
        { id: 'quiet_tools', text: 'ハンドスティックの傷を眺める。使い込んだ道具が、少しだけ誇らしかった。', effects: {} },
        { id: 'quiet_watch', text: '隣の部員の練習をぼんやり眺めた。同じ技でも、癖は人それぞれだ。', effects: {} },
        { id: 'quiet_pack', text: '練習後、ディアボロをケースへ戻した。今月も無事に終わった。', effects: {} }
      ]
    },
    // v2: ライバル（総合部門に実在する対戦相手）
    // v6: スケール廃止に伴い表示スコア空間で再設定。志音=同学年の強豪(上位帯76→82)、魁人=王者の壁(88→92.5)。
    RIVALS: [
      { id: 'shion', name: '志音', contests: ['oidc', 'ajdc'], base: 76, growth: 2, sd: 5 },
      { id: 'kaito', name: '魁人', contests: ['ajdc', 'worlds'],         base: 88, growth: 1.5, sd: 4 }
    ],
    // 実装予定のイベント草案（テキストと選択肢のみを記録。効果パラメータは後日設定するため未実装。
    // ゲームループからは未参照 ＝ まだ発生しない）
    // 実装予定のイベント草案（未実装・ゲーム未参照）。youtube・taiwan_camp は実装済み（EVENTS.charEvents へ移動）
    EVENT_DRAFTS: []
  };
})(typeof window !== 'undefined' ? window : globalThis);
