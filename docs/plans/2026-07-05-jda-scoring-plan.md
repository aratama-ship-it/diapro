# JDA採点規則反映（v1.1）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仮の能力7項目を、JDA「ディアボロ競技採点規則 第八版」（docs/reference/JDA_rule_2026_8.pdf）のオーバーオールクラス男子個人総合部門の採点構造（6項目・100点満点・実施減点/特別減点）に差し替える。

**Architecture:** 能力6項目を採点項目と1:1対応させ、大会スコアはJDAの満点配分をそのまま換算。基礎点のみ規定書どおり段階式（25ごとに1要素、要素×5点）。実施減点はミス率×判定回数（難易度が高いと判定回数増）。既存のモジュール境界・IIFEパターン・rng注入は維持。

**Tech Stack:** 変更なし（vanilla JS、Nodeテスト）

## Global Constraints

- ビルド工程・npm依存は一切禁止。既存のIIFEパターン・rng注入規約・innerHTML禁止を維持
- 能力定義は `DT.DATA.STATS` 経由（contest.jsの採点計算のみstat ID直接参照可）
- JDA配点は `DT.DATA.SCORING` に一元化: weights = 難易度30/多彩性10/操作安定10/新奇性10/演技構成20、基礎 = 4要素×5点（能力値25ごとに1要素達成）
- セーブキーは `diabolo-trainer-save-v2` に変更（旧セーブは無効化、意図的）
- `js/engine.js` の本体コードは変更しない（stat ID非依存のため。テストのID参照のみ更新）
- テスト実行は `node tests/test-<module>.js`、リポジトリルート = app-dev/diabolo-trainer/

---

### Task 1: data.js 能力6項目＋SCORING定数、セーブキーv2、既存テスト更新

**Files:**
- Modify: `js/data.js`（STATS/TRAININGS差し替え、SCORING追加。STUDY/REST/CONTESTS/TOTAL_TURNS/STUDY_*は不変）
- Modify: `js/state.js`（SAVE_KEYのみ変更）
- Modify: `tests/test-data.js`（6項目対応）
- Modify: `tests/test-engine.js`（stat ID・数値参照の更新のみ）

**Interfaces:**
- Produces: `DT.DATA.STATS` = 6項目 `{ id, label, desc }`（id: difficulty / variety / control / novelty / composition / fundamentals）
- Produces: `DT.DATA.TRAININGS` = 6練習（stat 1:1、gain全て9）
- Produces: `DT.DATA.SCORING` = `{ weights: {difficulty:30, variety:10, control:10, novelty:10, composition:20}, base: {stat:'fundamentals', elements:4, perElement:5}, execDeductionMax:2, specialDeduction:3 }`
- Produces: `DT.state.SAVE_KEY` = `'diabolo-trainer-save-v2'`

- [ ] **Step 1: test-data.jsを新構造に書き換え**

`tests/test-data.js` のテスト3件を以下に差し替え（require・summary構造は不変）:
```js
test('DATA: 競技能力はJDA採点6項目', () => {
  assert.strictEqual(DT.DATA.STATS.length, 6);
  const ids = DT.DATA.STATS.map(s => s.id);
  assert.deepStrictEqual(ids, ['difficulty', 'variety', 'control', 'novelty', 'composition', 'fundamentals']);
});

test('DATA: SCORINGはJDA男子個人総合部門の配点（満点100点）', () => {
  const w = DT.DATA.SCORING.weights;
  assert.deepStrictEqual(w, { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 });
  const b = DT.DATA.SCORING.base;
  assert.strictEqual(b.stat, 'fundamentals');
  assert.strictEqual(b.elements * b.perElement, 20);
  const total = Object.values(w).reduce((a, v) => a + v, 0) + b.elements * b.perElement;
  assert.strictEqual(total, 100);
  // weightsのキーは基礎以外の全能力と一致
  DT.DATA.STATS.filter(s => s.id !== b.stat).forEach(s => assert.ok(w[s.id] > 0, s.id));
});

test('DATA: 練習メニューは競技能力と1対1対応', () => {
  assert.strictEqual(DT.DATA.TRAININGS.length, 6);
  DT.DATA.TRAININGS.forEach(t => {
    assert.ok(DT.DATA.STATS.some(s => s.id === t.stat), t.id + ' のstatが未定義');
    assert.ok(t.gain > 0 && t.fatigue >= 0 && t.risk >= 0);
  });
});

test('DATA: 大会は48ターン中に8回', () => {
  assert.strictEqual(DT.DATA.CONTESTS.length, 8);
  assert.strictEqual(DT.DATA.TOTAL_TURNS, 48);
  assert.strictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'national').length, 4);
});
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/test-data.js`
Expected: 新テストがFAIL（STATSが旧7項目のため）

- [ ] **Step 3: data.jsを差し替え**

`js/data.js` のSTATS/TRAININGSを以下に差し替え、SCORINGを追加（STUDY以下は不変）:
```js
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
```

- [ ] **Step 4: state.jsのセーブキーを変更**

```js
  const SAVE_KEY = 'diabolo-trainer-save-v2';
```
（test-state.jsはSAVE_KEYを参照しているため変更不要）

- [ ] **Step 5: test-engine.jsのID・数値参照を更新**

engine.js本体は変更しない。テスト内の `'multiplex'` を `'difficulty'` に置換し、数値を新TRAININGSに合わせる:

「applyAction: 練習大成功で能力2倍伸び・やる気+1」:
```js
  const r = DT.engine.applyAction(s, 'difficulty', () => 0.0);
  assert.strictEqual(r.tier, '大成功');
  assert.strictEqual(s.stats.difficulty, 28); // 10 + round(9*2.0*1.0)
  assert.strictEqual(s.fatigue, 16);
  assert.strictEqual(s.injuryRisk, 18); // 10 + 8
  assert.strictEqual(s.motivation, 4);
  assert.strictEqual(s.didTrain, true);
```
「applyAction: 練習失敗は伸びゼロ・疲労追加・やる気-1」:
```js
  const r = DT.engine.applyAction(s, 'difficulty', () => 0.15);
  assert.strictEqual(r.tier, '失敗');
  assert.strictEqual(s.stats.difficulty, 10);
  assert.strictEqual(s.fatigue, 21); // 16 + 5
  assert.strictEqual(s.motivation, 2);
```
他のテストはstat ID非依存のため不変。

- [ ] **Step 6: テスト確認（contest/simulation以外）**

Run: `node tests/test-data.js && node tests/test-state.js && node tests/test-engine.js`
Expected: すべて `0 failed`（test-contest/test-simulationはTask 2-3まで一時的に壊れていてよい）

- [ ] **Step 7: コミット**

```bash
git add js/data.js js/state.js tests/test-data.js tests/test-engine.js
git commit -m "feat: JDA採点規則の能力6項目・配点定数に差し替え、セーブキーをv2に"
```

---

### Task 2: contest.js JDA採点方式に全面改訂

**Files:**
- Modify: `js/contest.js`（derived廃止 → breakdown/missRate/playerScore/run/LEVELS改訂）
- Modify: `tests/test-contest.js`（全面書き換え）

**Interfaces:**
- Produces: `DT.contest.breakdown(state)` → `{ difficulty, variety, control, novelty, composition, fundamentals }`（各項目の得点。基礎は段階式）
- Produces: `DT.contest.missRate(state)` → 2〜60の整数%
- Produces: `DT.contest.playerScore(state, rng)` → `{ score, parts, misses, execDeduction, specialDeduction }`
- Produces: `DT.contest.run(state, contest, rng)` → 従来フィールド＋ `parts` / `execDeduction` / `specialDeduction`
- Produces: `DT.contest.contestForTurn` / `LEVELS`（構造は従来どおり）
- 廃止: `DT.contest.derived`（app.jsの参照はTask 4で置き換え）

- [ ] **Step 1: test-contest.jsを全面書き換え**

```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/contest.js');
const DT = globalThis.DT;

function allFifty() {
  const s = DT.state.newCharacter(() => 0);
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 50; });
  return s; // fatigue0, motivation3
}

test('breakdown: 配点換算と基礎点の段階式', () => {
  const b = DT.contest.breakdown(allFifty());
  assert.strictEqual(b.difficulty, 15);   // 50% of 30
  assert.strictEqual(b.variety, 5);
  assert.strictEqual(b.control, 5);
  assert.strictEqual(b.novelty, 5);
  assert.strictEqual(b.composition, 10);
  assert.strictEqual(b.fundamentals, 10); // floor(50/25)=2要素 × 5点
});

test('breakdown: 基礎点は0/5/10/15/20の段階式', () => {
  const s = allFifty();
  [[0, 0], [24, 0], [25, 5], [74, 10], [75, 15], [100, 20]].forEach(([v, exp]) => {
    s.stats.fundamentals = v;
    assert.strictEqual(DT.contest.breakdown(s).fundamentals, exp, 'stat=' + v);
  });
});

test('breakdown: 全能力100で満点100点', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  const total = Object.values(DT.contest.breakdown(s)).reduce((a, v) => a + v, 0);
  assert.strictEqual(total, 100);
});

test('missRate: 操作安定度と疲労で決まりクランプされる', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.missRate(s), 10); // 25 + 0 - 15
  s.fatigue = 100; s.stats.control = 0;
  assert.strictEqual(DT.contest.missRate(s), 55); // 25 + 30 - 0
  s.fatigue = 0; s.stats.control = 100;
  assert.strictEqual(DT.contest.missRate(s), 2);  // 下限クランプ
});

test('playerScore: 乱数0.5固定でノイズ0・ミス0・スコア50', () => {
  const r = DT.contest.playerScore(allFifty(), () => 0.5);
  assert.strictEqual(r.score, 50);
  assert.strictEqual(r.misses, 0);
  assert.strictEqual(r.execDeduction, 0);
  assert.strictEqual(r.specialDeduction, 0);
});

test('playerScore: ミス発生で実施減点1〜2点', () => {
  const s = allFifty();
  s.fatigue = 100; s.stats.control = 0; // missRate 55
  // rng: noise=0.5, miss判定0.0(<55 ミス), 減点幅0.0(→1点), miss判定0.99(ノーミス), special 0.99
  const seq = [0.5, 0.0, 0.0, 0.99, 0.99];
  let i = 0;
  const r = DT.contest.playerScore(s, () => seq[i++]);
  assert.strictEqual(r.misses, 1);
  assert.strictEqual(r.execDeduction, 1);
});

test('contestForTurn: 大会月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'summer');
  assert.strictEqual(DT.contest.contestForTurn(47).type, 'national');
  assert.strictEqual(DT.contest.contestForTurn(6), null);
});

test('run: 全員平均点の相手に勝てば1位・夏大会40pt', () => {
  const s = allFifty();
  const r = DT.contest.run(s, DT.DATA.CONTESTS[0], () => 0.5); // 1年夏 相手平均25
  assert.strictEqual(r.rank, 1);
  assert.strictEqual(r.points, 40);
  assert.ok(r.parts);
  assert.strictEqual(s.results.length, 1);
});

test('run: 弱いと下位グループで最低ポイント', () => {
  const s = DT.state.newCharacter(() => 0); // 全能力10
  const r = DT.contest.run(s, DT.DATA.CONTESTS[7], () => 0.5); // 4年全国 相手平均56
  assert.ok(r.rank > 8);
  assert.strictEqual(r.points, 5);
});

summary();
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/test-contest.js`
Expected: FAIL（breakdownが未定義）

- [ ] **Step 3: contest.jsを改訂**

```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // JDA採点規則: 各項目点＝能力値×配点/100。基礎点のみ段階式（25ごとに1要素×5点）
  function breakdown(state) {
    const sc = DT.DATA.SCORING;
    const parts = {};
    Object.keys(sc.weights).forEach(id => {
      parts[id] = Math.round(state.stats[id] * sc.weights[id]) / 100;
    });
    const elements = Math.min(sc.base.elements, Math.floor(state.stats[sc.base.stat] / 25));
    parts[sc.base.stat] = elements * sc.base.perElement;
    return parts;
  }

  function missRate(state) {
    return clamp(Math.round(25 + state.fatigue * 0.3 - state.stats.control * 0.3), 2, 60);
  }

  function playerScore(state, rng) {
    rng = rng || Math.random;
    const parts = breakdown(state);
    let total = Object.values(parts).reduce((a, v) => a + v, 0);
    total += (state.motivation - 3) * 2 + (rng() * 6 - 3); // 調子＋審査員ぶれ

    // 実施減点: ミスごとに1〜2点。高難易度構成は判定回数が増える（攻めるほどリスク増）
    const rolls = state.stats.difficulty >= 60 ? 3 : 2;
    const rate = missRate(state);
    let misses = 0;
    let execDeduction = 0;
    for (let i = 0; i < rolls; i++) {
      if (rng() * 100 < rate) {
        misses += 1;
        execDeduction += 1 + Math.round(rng()); // 1点 or 2点（最大 execDeductionMax）
      }
    }
    // 特別減点: 低確率で演技スペース外（両足）
    const specialDeduction = rng() * 100 < 5 ? DT.DATA.SCORING.specialDeduction : 0;

    total -= execDeduction + specialDeduction;
    return { score: Math.round(total * 10) / 10, parts, misses, execDeduction, specialDeduction };
  }

  // 新100点スケールに合わせて調整（プレイヤーの現実的な最終スコアは40〜55点程度）
  const LEVELS = {
    summer:   { base: 25, growth: 5, sd: 10, entrants: 16, points: [40, 25, 15, 8, 2] },
    national: { base: 35, growth: 7, sd: 12, entrants: 16, points: [100, 70, 50, 20, 5] }
  };

  function run(state, contest, rng) {
    rng = rng || Math.random;
    const lv = LEVELS[contest.type];
    const year = Math.ceil(contest.turn / 12);
    const mean = lv.base + lv.growth * (year - 1);
    const opponents = [];
    for (let i = 0; i < lv.entrants - 1; i++) {
      const g = (rng() + rng() + rng()) / 3; // 0..1の山型分布
      opponents.push(mean + (g - 0.5) * 2 * lv.sd * 1.8);
    }
    const p = playerScore(state, rng);
    const rank = 1 + opponents.filter(o => o > p.score).length;
    const half = Math.ceil(lv.entrants / 2);
    const points = rank === 1 ? lv.points[0]
      : rank === 2 ? lv.points[1]
      : rank === 3 ? lv.points[2]
      : rank <= half ? lv.points[3]
      : lv.points[4];
    const result = {
      name: contest.name, type: contest.type, rank,
      entrants: lv.entrants, score: p.score, misses: p.misses,
      parts: p.parts, execDeduction: p.execDeduction, specialDeduction: p.specialDeduction,
      points
    };
    state.results.push(result);
    return result;
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { breakdown, missRate, playerScore, run, contestForTurn, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
```

検算（テスト期待値の根拠）:
- all-50: parts = 15+5+5+5+10+10 = 50。rng0.5 → ノイズ 0.5*6-3=0、missRate10でロール50<10不成立、特別減点50<5不成立 → score 50
- 全能力100: 30+10+10+10+20+20 = 100
- 全能力10（4年全国）: parts = 3+1+1+1+2+0 = 8 → 相手平均56に全敗 → rank16

- [ ] **Step 4: テスト確認**

Run: `node tests/test-contest.js`
Expected: `9 passed, 0 failed`

- [ ] **Step 5: コミット**

```bash
git add js/contest.js tests/test-contest.js
git commit -m "feat: 大会採点をJDA方式（項目別得点＋実施減点＋特別減点）に改訂"
```

---

### Task 3: シミュレーション更新（勝機アサーション追加）

**Files:**
- Modify: `tests/test-simulation.js`

**Interfaces:**
- Consumes: 全ロジックモジュール。テスト3件目のstat ID参照を更新し、「勝てるゲームか」の検証を1件追加

- [ ] **Step 1: test-simulation.jsを更新**

変更点は2つ。

(a) 「勉強を一切しないと退学になる」テスト内の `'multiplex'` を `'difficulty'` に変更。

(b) `summary();` の直前に追加:
```js
test('まともな方針なら4年間でどこかの大会で3位以内に入れる', () => {
  let bestRank = 99;
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    s.results.forEach(r => { if (r.rank < bestRank) bestRank = r.rank; });
  }
  assert.ok(bestRank <= 3, '20シードの最高順位が' + bestRank + '位（勝機がなさすぎる）');
});
```

- [ ] **Step 2: 全テスト実行**

Run: `for f in tests/test-*.js; do echo "== $f"; node "$f" || break; done`
Expected: 6ファイルすべて緑（simulationは4テスト）

失敗した場合（勝機なし等）はLEVELSの `base`/`growth` をロジック側で調整して再実行（アサーションは緩めない）。調整したら根拠をレポートに記す。

- [ ] **Step 3: コミット**

```bash
git add tests/test-simulation.js
git commit -m "test: シミュレーションをJDA項目に追随、勝機アサーション追加"
```

---

### Task 4: UI更新（予想スコア表示・大会得点内訳）

**Files:**
- Modify: `js/app.js`（derived参照の置き換え、大会画面に項目別内訳を追加）

**Interfaces:**
- Consumes: `DT.contest.breakdown` / `DT.contest.missRate`、`run` 結果の `parts` / `execDeduction` / `specialDeduction`

- [ ] **Step 1: renderMainの派生値表示を置き換え**

`renderMain` 内の
```js
    const d = DT.contest.derived(state);
```
を
```js
    const bd = DT.contest.breakdown(state);
    const expected = Math.round(Object.values(bd).reduce((a, v) => a + v, 0) * 10) / 10;
```
に置き換え、condNodes内の
```js
      textRow('難易度/表現/ミス率', d.difficulty + ' / ' + d.expression + ' / ' + d.missRate + '%')
```
を
```js
      textRow('予想スコア', expected + '点 / 100点'),
      textRow('ミス率', DT.contest.missRate(state) + '%')
```
に置き換える。

- [ ] **Step 2: renderContestに項目別内訳を追加**

`renderContest(r)` の `replaceChildren(...)` を以下に置き換え:
```js
    $('#contest-result').replaceChildren(
      el('div', 'result-big', r.rank + '位 / ' + r.entrants + '人'),
      textRow('スコア', r.score + '点'),
      ...DT.DATA.STATS.map(s => textRow(s.label + '点', String(r.parts[s.id]))),
      textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'),
      textRow('特別減点', '-' + r.specialDeduction + '点'),
      textRow('獲得ポイント', r.points + 'pt')
    );
```

- [ ] **Step 3: 検証**

`node --check js/app.js` ＋ 全テストスイート再実行（リグレッション）。
ブラウザ確認（コントローラーが実施）: メイン画面に予想スコア/ミス率、大会画面に6項目の内訳＋減点表示。

- [ ] **Step 4: コミット**

```bash
git add js/app.js
git commit -m "feat: UIをJDA採点表示に更新（予想スコア・大会得点内訳）"
```

---

## 完了条件

- 全テスト緑（simulationの勝機アサーション含む）
- ブラウザで: キャラ作成に6項目、メイン画面に予想スコア、大会画面にJDA項目別内訳が表示される
- 旧セーブ（-v1）は読み込まれず、新規開始できる

## 対象外（変更しない）

- engine.js本体、勉強/退学/怪我/卒業評価ロジック、エンディングランク閾値、UIレイアウト構造
