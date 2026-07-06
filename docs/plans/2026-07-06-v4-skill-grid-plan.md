# V4: スキルグリッド（ジャンル×技術の12マス化）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to実装 this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 難易度/新奇性/操作安定度を**ジャンル別の12マス**（4ジャンル×3技術）に分割し、演技構成は単一パラメータのまま維持。スペシャリスト部門はそのジャンルのマスを直接採点に使い（習熟ゲート廃止）、総合部門は4ジャンル平均を使う。ジャンル表示順を「1D水平→1D垂直→2D→3D以上」に変更。

**Architecture:** `state.skills[genreId][methodId]`（12値）＋`state.composition`。旧`state.stats`（4値）と`state.genres`（4値）は廃止。ジャンル習熟＝そのジャンルの3マス平均（導出）。ミス率は部門ごとに参照する操作安定度が変わる。セーブv7。

## Global Constraints

- 既存規約維持（IIFE/rng注入/innerHTML禁止/データ駆動/summary()最終行/シミュレーション断言の緩和禁止）
- **GENRES順序変更**: `[h1d(1ディアボロ水平軸), v1d(1ディアボロ垂直軸), d2, d3]`。DIVISIONSも `[overall, h1d部門, v1d部門, d2部門, d3部門]` に並び替え（idは全て不変）
- `DT.DATA.METHODS = [{id:'difficulty',label:'難易度'},{id:'novelty',label:'新奇性'},{id:'control',label:'操作安定度'}]`（旧STATSは廃止。compositionはMETHODSに含めず`DT.DATA.COMPOSITION={id:'composition',label:'演技構成'}`）
- 初期値: 経歴レンジで12マス＋composition＋学力をロール。**rng消費順: GENRES配列順×METHODS配列順（h1d難→h1d新→h1d操→v1d難→…）12回→composition 1回→study 1回＝計14回**（テストでピン）
- genreAvg(state, g) = round((3マス平均)×10)/10。基礎点=genreAvg≥25のジャンル数×5。多彩性=Σmin(genreAvg,50)/200×10
- 総合部門: 難易度点=(4ジャンルのdifficulty平均)×30/100、操作安定度点・新奇性点も同様、演技構成=composition×20/100、多彩性・基礎は導出。ミス率=controlの4ジャンル平均で計算
- スペシャリスト部門d: skills[d].difficulty×45/100＋skills[d].control×15/100＋skills[d].novelty×30/100＋composition×10/100。**ゲートなし（gateMult削除）**。ミス率=skills[d].controlで計算
- **新ミスモデル（ユーザー指定: 平均3〜4ミス/演技、ノーミスは高操作安定のみの偉業）**: `DT.DATA.SCORING.miss = { rolls: 6, hardBonusRolls: 2, hardLine: 60, base: 70, controlCoef: 0.5, fatigueCoef: 0.3, min: 5, max: 90 }`。missRate(state, divisionId) = clamp(base − control×controlCoef ＋ fatigue×fatigueCoef, min, max)（controlは部門参照値）。判定回数 = rolls ＋（当該部門のdifficulty参照値≥hardLineならhardBonusRolls）。ミス毎減点1〜2点は現行どおり
- **スケール底上げ**: scale.base 30→36（mult 0.7不変）。ミス減点増の補償＋ユーザー要望の「予想スコア高め」。プレイヤー・相手・ライバル全員同一（順位不変）
- judgeMod・ポイント表・ライバル・世界大会・定期テスト・タイミング補正/練習会（method-idキー）はすべて現行どおり
- スロット: {genre, method}→skills[genre][method]に `SLOTS.gridGain: 2` ×tier×growthMult(そのマス)（非失敗min1、タイミング/練習会/特別指導の適用順は現行パイプラインどおり）。routine→composition（routineGain現行値）。疲労/リスク表・genreRisk不変
- イベントのstat効果: difficulty/novelty/control → **全4ジャンルの該当マスに同量**適用。composition→compositionへ。（EVENTSデータのidはそのまま）
- ending: abilityAvg = 13値（12マス+composition）の平均。ajdcOverallWin/worldsWin/閾値は不変
- セーブ `diabolo-trainer-save-v7`、OLD_KEYSにv6追加
- リポジトリルート: app-dev/diabolo-trainer/

---

### Task 1: data.js/state.js — グリッドデータモデル＋ジャンル並び替え

**Files:** js/data.js, js/state.js, tests/test-data.js, tests/test-state.js, tests/test-events.js（イベント整合テストのSTATS参照をMETHODS+compositionに更新）

- GENRES並び替え、DIVISIONS並び替え、METHODS/COMPOSITION定義、STATS削除、SLOTS.gridGain:2追加（methodGain/genreGainは削除）
- state: skills（GENRES×METHODSのネスト、経歴ロール）、composition（経歴ロール）、stats/genres削除、lastSlots維持、SAVE_KEY v7
- テスト: rng消費14回ピン（h1d難が1番目のロール等、順序を値で検証）、グリッド形状、v7/v6掃除、GENRES/DIVISIONS順序ピン、EVENTSのstat.idがMETHODS∪{composition}に含まれる整合テスト
- ゲート: test-data/test-state/test-events緑（engine/contest/ending/simulation/UIは後続タスクまで破損可）
- コミット: `feat: v4スキルグリッドのデータモデルとジャンル並び替え`

### Task 2: engine.js — グリッド練習

**Files:** js/engine.js, tests/test-engine.js（全面改訂）

- applyTraining: comboスロット→skills[genre][method]にgridGain×tier×growthMult(マス値)、genreGain概念は削除（マス1つに集約）。routine→composition。didStudyリセット・lastSlotsコピー・逐次疲労・タイミング/練習会/特別指導・疲労/リスク（genreRisk込み）は現行どおり
- applyActionのstudy/rest/injured不変（restのTIMINGボーナス含む）
- 検算基準例（テストでピン）: 全マス10・turn1・rng0.3: [{h1d,control}]×4 → skills.h1d.control 10+round(2×1×1)×4=18、疲労3×4=12、リスク(1-1)×4=0
- コミット: `feat: グリッド対応の練習エンジン`

### Task 3: contest.js/ending.js — 部門別採点＋順位表（standings）

**追加要件（ユーザー指定）**: 各部門結果に順位表データを持たせる。
- `DT.DATA.OPPONENT_NAMES`: 日本人選手風の名前プール24件以上（例: 蒼真、隼人、玲於、悠斗、湊、葵、颯太、大和、律、樹、陸斗、海翔、俊介、慎之介、光希、達也、直樹、亮平、拓海、翔平、健心、一颯、玄、遼）
- モブ相手の命名は**rngを消費しない**決定的割り当て: `OPPONENT_NAMES[(contest.turn * 7 + i * 5) % OPPONENT_NAMES.length]`（i=相手インデックス。同一大会内の重複は許容だが式を工夫して名簿長と互いに素なストライドを選ぶこと）
- runDivision: 全参加者 `{name, score, isPlayer?, rivalId?}` をスコア降順ソートし、`result.standings` に**上位3名＋自分＋ライバル**（重複除去、各行に rank を付与）を格納。rng消費順は現行（ライバル→モブ→プレイヤー）から**一切変更しない**
- テスト: standingsの構成（top3+self+rival、rank整合、自分のrankがresult.rankと一致）、命名がrngを消費しないこと（rng呼び出し回数ピンが不変であること）

### Task 3（続き）: 部門別採点本体

**Files:** js/contest.js, js/ending.js, tests/test-contest.js（全面改訂）, tests/test-ending.js（追随）

- genreAvg/derivedVariety/derivedBase（genreAvgベース）、breakdown（総合=平均方式/スペシャ=直接マス）、missRate(state, divisionId)、gateMult・genres参照の全削除、playerScore/runDivision/runAllの追随（rivalScore/LEVELS/リマップ/worlds系不変）
- 検算（ピン）: 全マス50・composition50 → 総合raw=15+10+5+5+10+20=65→75.5（従来と同値になる設計）。スペシャd2 raw=22.5+7.5+15+5=50→65.0（**ゲート廃止でスコア上昇**: 旧54.5→65.0）
- ending: abilityAvg 13値平均
- コミット: `feat: 部門別採点のグリッド化（ゲート廃止・総合は4ジャンル平均）`

### Task 4: シミュレーション＋バランス確定

**Files:** tests/test-simulation.js（＋許可されたノブ）

- ポリシー: argminマスのcombo×3＋routine（月頭決定）。エントリーは全部門（枠上限まで、総合含む）。既存断言維持（28件・卒業・勝機・特別指導・志音/魁人・無資格ゼロ・赤点表示）
- **バランス権限（V3-4と同形式、≤5イテレーション、レポートに表を必須）**: ゲート廃止でスペシャスコア底上げ→S率上振れ濃厚。調整可能ノブ: LEVELS base/growth/sd、endingランク閾値、SLOTS.gridGain/routineGain。禁止: リマップ・配点・エンジンパイプライン・断言緩和。目標: 卒業20/20、bestRank≤3、特別指導≥5/20、**S≤3/20**、E≤4/20、どのバケツも≤9/20（A/B帯にも1つ以上入ることを目指すが必達ではない→結果を報告）
- コミット: `test: グリッド統合とバランス確定`

### Task 5: UI — グリッド表示

**Files:** index.html（必要なら）, css/style.css, js/app.js

- ステータス: ジャンル別セクション（GENRES順）に3技術の数値を並べたコンパクト表（バー12本は縦に長すぎるため、`技術`テーブル: 行=ジャンル、列=難/新/操の数値＋ジャンル平均）＋演技構成バー＋学力バー。キャラ作成画面も同構成
- 大会結果: 習熟ゲート行を削除（廃止）。スペシャ部門の内訳はそのジャンルのマス由来の項目点/満点（breakdownが返すので表示は現行ロジックのまま）。ミス率表示（メイン画面）は総合基準
- **順位表の表示**: 各部門結果に standings のミニ表（順位/名前/スコア）。自分の行を強調（例: 名前に「（あなた）」付与＋強調色）。ライバル行はrivalMessagesと重複してよい（表で順位、メッセージで因縁）
- 練習結果画面（renderTrainingResult）: エンジンのresults新形状 {slot, tier, gain} に適応（methodGain/genreGain廃止。ゲイン表示は1本化、集計はマス/compositionごと）
- スロットピッカー/エントリー画面: 表示順がGENRES/DIVISIONS新順序に自動追随することを確認
- ブラウザ検証はコントローラー
- コミット: `feat: スキルグリッドUI（ジャンル×技術テーブル）`

## 完了条件

- 全テスト緑、分布・スコア帯・S率がTask 4目標内（未達項目は数値つき報告）
- ブラウザ: グリッド表が新ジャンル順で表示、専攻ジャンルの部門スコアが専攻外と明確に差がつく、ゲート行が消えている

## 対象外

- 旧セーブ(v6)の移行（掃除のみ）
- 閾値・配点の最終決定（ユーザー実プレイの感触で後日微調整）
