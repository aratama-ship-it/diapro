# V3: 練習2軸化＋スコアスケール再調整 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to実装 this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 練習を「ジャンル4×練習種別3＋ルーチン構成」の毎月4スロット制に再設計し、部門スコアにジャンル習熟を乗算ゲートで効かせる。同時に大会スコアを「平均60点・上限100点・90点超=表彰台」のスケールに線形再調整する。

**Architecture:**
- 能力を**練習種別スタッツ4つ**（難易度/新奇性/操作安定度/演技構成、0-100）と**ジャンル習熟4つ**（1D垂直軸/1D水平軸/2D/3D以上、0-100）に分離
- 多彩性点=ジャンルの幅から導出、基礎点=習熟25以上のジャンル数×5（JDA基礎点4要素と1:1）
- スロット判定は1枠ずつ（疲労は枠ごとに逐次加算＝後の枠ほど成功率低下）
- スペシャリスト部門スコア=採点項目点×(0.4+0.6×該当ジャンル習熟/100)
- スコア表示は線形リマップ `display = 30 + raw×0.7`（正の線形変換なので**順位・分布は完全不変**。ポイント・ランク閾値は変更不要）
- セーブv5

## Global Constraints

- 既存規約維持（IIFE/rng注入/innerHTML禁止/データ駆動/テストはsummary()が最終行）
- 練習種別スタッツ: difficulty(難易度)/novelty(新奇性)/control(操作安定度)/composition(演技構成)。旧variety/fundamentalsはstatsから削除（導出値に）
- ジャンル: v1d(1ディアボロ垂直軸)/h1d(1ディアボロ水平軸)/d2(2ディアボロ)/d3(3ディアボロ以上)。v1d/h1d/d2はDIVISIONSのidと一致させる
- スロット: 毎月4枠。各枠= {genre, method}（method∈difficulty/novelty/control）または 'routine'（ルーチン構成）。同一枠の重複可。休養/勉強/療養は月全体
- 枠ごとの効果: method スタッツ +round(3×tier倍率×growthMult)、genre習熟 +round(2×tier倍率×growthMult(genre))（非失敗時min 1）。routine: composition +round(3×tier×growthMult)。疲労/枠: difficulty5, novelty4, control3, routine2。怪我リスク/枠: difficulty2, novelty2, control1, routine1
- タイミング補正は枠単位: 大会月 routine×1.5 / difficultyメソッド×0.5＋枠疲労+1 / controlメソッド×2。練習会月 routine×1.5 / noveltyメソッド×1.5。特別指導: 成功枠ごとに+1（フラット、倍率後）
- 導出値: 基礎点=(習熟25以上のジャンル数)×5点。多彩性点=Σmin(genre,50)/200×満点(overall 10点)
- スコアリマップ: `DT.DATA.SCORING.scale = { base: 30, mult: 0.7 }`。プレイヤーraw合計・相手スコア・ライバルスコアすべて同一リマップ後にjudgeMod加算・減点。相手曲線/ライバル曲線の生値は現行のまま（リマップが吸収）
- 初期値: 経歴レンジをmethodスタッツ4つ＋ジャンル4つの計8値に適用。学力は共通のまま
- state追加: genres{...}, lastSlots:[]（前月のスロット構成、UIプリフィル用）。SAVE_KEY v6ではなく**v5**、OLD_KEYSにv4追加
- リポジトリルート: app-dev/diabolo-trainer/

---

### Task 1: data.js/state.js 再構成

**Files:**
- Modify: `js/data.js`
- Modify: `js/state.js`
- Modify: `tests/test-data.js` / `tests/test-state.js`

**Interfaces:**
- `DT.DATA.STATS` = 4項目 `[{id:'difficulty',label:'難易度'},{id:'novelty',label:'新奇性'},{id:'control',label:'操作安定度'},{id:'composition',label:'演技構成'}]`（desc維持可）
- `DT.DATA.GENRES` = `[{id:'v1d',label:'1ディアボロ垂直軸'},{id:'h1d',label:'1ディアボロ水平軸'},{id:'d2',label:'2ディアボロ'},{id:'d3',label:'3ディアボロ以上'}]`
- `DT.DATA.SLOTS` = `{ perMonth: 4, methodGain: 3, genreGain: 2, routineGain: 3, fatigue: {difficulty:5, novelty:4, control:3, routine:2}, risk: {difficulty:2, novelty:2, control:1, routine:1} }`
- `DT.DATA.SCORING`: overall.weights → `{difficulty:30, variety:10, control:10, novelty:10, composition:20}`（キー名は不変だがvarietyは導出値として扱う注記）、specialist.weights不変、`base`→`{elements:4, perElement:5, threshold:25}`（stat参照を廃止しジャンル閾値化）、`gate:{min:0.4, span:0.6}`、`scale:{base:30, mult:0.7}` 追加
- `DT.DATA.TRAININGS` は**削除**（スロット制に置換。TIMING/MEETUPのboostsキーはmethod id/routineに読み替え: TIMING.contestMonth = {routine:{gainMult:1.5,...}, difficulty:{gainMult:0.5, extraFatiguePerSlot:1,...}, control:{gainMult:2,...}, restExtra…}、MEETUP.boosts={routine:1.5, novelty:1.5}）
- state: `stats`=4キー、`genres`=4キー（経歴レンジで初期化）、`lastSlots: []`、SAVE_KEY `'diabolo-trainer-save-v5'`、OLD_KEYSにv4

- [ ] Step 1: test-data/test-stateを新仕様に書き換え（STATS4件・GENRES4件・SLOTS形状・SCORING新フィールド・TRAININGS不存在・経歴レンジがgenresにも適用・lastSlots初期値・v5キー・v4掃除）
- [ ] Step 2: 失敗確認
- [ ] Step 3: data.js/state.js実装（イベントEVENTSのeffects.stat参照はdifficulty/novelty/control/compositionのみになるよう、variety/fundamentals参照イベント(mikoto2の'variety'、coach1の'fundamentals')を差し替える: mikoto2→{stat:{id:'novelty',amount:3}}のまま意味が通る文言に、coach1→genre効果は複雑化するので{stat:{id:'control',amount:3}}に変更し、resultテキストも整合させる。EVENTSの整合性テストが守る）
- [ ] Step 4: test-data/test-state/test-eventsのゲート緑（engine/contest/simulation/UIは後続タスクまで破損可）
- [ ] Step 5: コミット `feat: v3データモデル（種別スタッツ×ジャンル習熟・スロット定義・スコアスケール定数）`

---

### Task 2: engine.js スロット制練習

**Files:**
- Modify: `js/engine.js`
- Modify: `tests/test-engine.js`（全面改訂）

**Interfaces:**
- `DT.engine.applyTraining(state, slots, rng)` → `{ results:[{slot, tier, methodGain, genreGain}], messages }`。slotsは長さ4の配列、要素は `{genre:'v1d', method:'difficulty'}` か `'routine'`。逐次処理: 各枠でrollTier→ゲイン計算（growthMult→丸め→非失敗min1→タイミング/練習会倍率→特別指導+1）→スタッツ/ジャンル/疲労/リスク加算。didTrain=true、state.lastSlots=slots
- `DT.engine.applyAction(state, actionId, rng)` は 'study'/'rest'/'injured' 専用に縮小（練習分岐を削除）
- outcomeProbs/rollTier/endTurn/turnLabel/isMeetupMonth等は不変（endTurnの怪我判定はdidTrainで従来どおり）
- 検算基準（テストに使う）: 全能力10・turn1・rng固定0.3（全枠成功）で `[{v1d,difficulty}]×4`: methodGain各round(3×1×1)=3×4=+12 → difficulty22、genreGain各2×4 → v1d 18、疲労5×4=20、リスク2×4=+8

- [ ] Step 1: 新テストを書く（成功枠の基本ゲイン、失敗枠ゼロ、routine枠、疲労逐次加算で後枠の成功率が下がること(outcomeProbsを直接比較)、大会月のroutine/difficulty/control補正、練習会月のroutine/novelty補正、特別指導+1/成功枠、lastSlots保存、study/rest/injuredの既存挙動維持）
- [ ] Step 2: 失敗確認 → Step 3: 実装 → Step 4: ゲート緑（test-engine/test-events/test-data/test-state） → Step 5: コミット `feat: 4スロット制練習エンジン`

---

### Task 3: contest.js 導出値・乗算ゲート・スコアリマップ

**Files:**
- Modify: `js/contest.js`
- Modify: `js/ending.js`（abilityAvg=4スタッツ+4ジャンルの平均に）
- Modify: `tests/test-contest.js`（全面改訂）/ `tests/test-ending.js`（追随）

**Interfaces:**
- `DT.contest.derivedVariety(state)` → 0〜満点(10)の多彩性点（Σmin(genre,50)/200×10、0.1精度）
- `DT.contest.derivedBase(state)` → {elements, points}（習熟25以上のジャンル数×5）
- `breakdown(state, divisionId)`: overall→{difficulty, variety(導出), control, novelty, composition, fundamentals(導出)}。specialist→4項目（従来どおり）
- `playerScore(state, divisionId, rng)`: raw=Σparts、specialistは `raw × (gate.min + gate.span×genres[divisionId]/100)`、**リマップ** `scaled = scale.base + raw部分×scale.mult`、その後 judgeMod加算・実施/特別減点。返り値に `parts/judgeMod/misses/execDeduction/specialDeduction/score` （partsは生値のまま、UIには生値内訳＋「スケール換算」行を出せるようrawTotalも返す）
- 相手生成・ライバルスコアも同一リマップ: `scale.base + 生値×scale.mult`（LEVELS/RIVALSの生値定義は不変）
- 検算基準: 全能力50・全ジャンル50: overall raw = 15+2.5(多彩:4×min(50,50)=200/200×10=10→wait Σmin=200→200/200×10=10点)…正しくは 難15+多彩10+操5+新5+構10+基礎20(4ジャンル全て≥25)=65 → display=30+65×0.7=75.5、rng0.5でjudgeMod0・減点0 → 75.5。specialist(v1d): raw=(22.5+7.5+15+5)=50 → gate 0.4+0.6×0.5=0.7 → 35 → display=30+24.5=54.5
- 相手: oidc y1 mean25 → display 47.5。ゲートにより無専攻スペシャ出場は不利になる設計意図をテストで確認（全ジャンル0なら gate 0.4）

- [ ] Step 1: テスト全面改訂（導出値、ゲート、リマップ、順位計算がdisplayスケールで一貫、既存の順位系テストを新数値で再構成。線形変換で順位不変の性質もテスト: 同一rngでraw順とdisplay順が一致）
- [ ] Step 2〜5: 失敗確認→実装→ゲート緑（simulation以外）→コミット `feat: ジャンル導出値・乗算ゲート・スコアスケール再調整`

---

### Task 4: シミュレーション改訂＋バランス確定

**Files:**
- Modify: `tests/test-simulation.js`

**Interfaces:**
- ポリシー: 毎月 `slots = [combo, combo, combo, 'routine']`、combo = {genre: 習熟最小のジャンル, method: スタッツ最小のメソッド}（毎枠再計算せず月頭に1回決定でよい）。study<30→勉強、fatigue>55→休養、injured対応は従来
- アサーション更新: 卒業20/20、非worlds結果26件、勝機bestRank≤3、特別指導到達≥5/20、志音8戦/魁人4+worlds戦、無資格worldsゼロ、分布表示
- **バランス確認**: 分布・スコア帯（4年目AJDC総合のdisplayスコアの代表値をログ出力: 平均60前後・表彰台90前後になっているか）をレポートに記録。S≥6/20 or 勝機喪失はDONE_WITH_CONCERNS/BLOCKEDで報告（閾値・ゲイン調整はコントローラー判断）

- [ ] Step 1〜4: 改訂→全テスト実行→分布/スコア帯記録→コミット `test: v3スロット制をシミュレーションに統合`

---

### Task 5: UI 4スロット選択

**Files:**
- Modify: `index.html` / `css/style.css` / `js/app.js`

**Interfaces:**
- メイン画面の行動欄を再構成:
  - ジャンル4ボタン（選択状態表示）＋メソッド3ボタン＋「ルーチン構成」ボタン。ジャンル選択→メソッド押下で空きスロットに追加、ルーチン構成は直接追加
  - スロット表示: 4チップ（例「1D垂直×高難度」「ルーチン構成」）、タップで削除
  - 前月のスロット構成（state.lastSlots）をプリフィル
  - 「この内容で練習する」（4枠埋まで有効化）→ applyTraining → 以降は従来フロー（大会/世界大会/イベント/finishTurn）
  - 「勉強」「休養」ボタンは従来どおり即実行
- ステータス表示: 種別スタッツ4本＋ジャンル習熟4本のバー（セクション見出し「技術」「ジャンル習熟」）。予想スコアはoverall displayスケール表示
- キャラ作成画面（renderCreate）もスタッツ4本＋ジャンル4本＋学力を表示（経歴レンジの差がジャンルにも見えるように）
- 大会結果: 内訳はraw値のまま＋「スケール換算後スコア」行（rawTotal→score の変換が見えるように）
- ブラウザ検証はコントローラー実施

- [ ] Step 1〜5: 実装→node --check＋全スイート→コミット `feat: 4スロット練習UI・ジャンル習熟表示`

---

## 完了条件

- 全テスト緑。手なり分布が健全（Sは例外的）、4年目AJDCのdisplayスコア帯が「平均60前後・表彰台90前後」
- ブラウザ: 4スロットを組んで練習→枠ごとの結果ログ、ジャンル習熟バー成長、専攻部門とそれ以外でスペシャリストスコアに明確な差、練習会/大会月補正がスロット単位で動作
- 旧セーブv4は掃除され新規開始

## 対象外

- 3ディアボロ部門の新設（d3ジャンルは基礎・多彩性にのみ寄与）— 将来
- 項目別の詳細点数配分の見直し（ユーザーが後日指定）
