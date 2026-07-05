# ディアボロ選手育成アプリ v1（MVP）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大学4年間（48ターン）でディアボロ選手を育成し、大会成績と卒業評価を競うパワプロ風ゲームの核ループ（能力値・練習・コンディション・勉強/退学・大会・卒業判定）を、index.htmlを開くだけで動くWebアプリとして完成させる。

**Architecture:** vanilla JSをグローバル名前空間 `DT` に載せるモジュール分割（data / state / engine / contest / ending / app）。ロジック層はDOM非依存・乱数注入可能にし、Node組み込みassertでユニットテストする。UI層（app.js）は画面切り替え式SPA。

**Tech Stack:** HTML / CSS / vanilla JavaScript（ビルドなし）、localStorage、テストはNode.js（`node:assert`、外部依存ゼロ）

## Global Constraints

- ビルド工程・npm依存は一切禁止。`index.html` をダブルクリックで起動できること
- 全JSファイルは次のIIFEパターンで書く（ブラウザ/Node両対応）: `(function (global) { 'use strict'; const DT = global.DT = global.DT || {}; ... })(typeof window !== 'undefined' ? window : globalThis);`
- ロジック関数は乱数を引数 `rng`（省略時 `Math.random`）で受け取る（テストの決定性のため）
- DOM生成は `createElement` / `textContent` / `replaceChildren` で行う。**`innerHTML`は使用禁止**（XSS防止の習慣として）
- UIテキストはすべて日本語。スマホ縦画面（幅375px基準）レスポンシブ
- セーブキーは `diabolo-trainer-save-v1` 固定
- テスト実行は `node tests/test-<module>.js`（Node 18以上、作業ディレクトリはリポジトリルート）
- 能力項目は仮項目（設計書参照）。将来実データに差し替えるため、能力定義は必ず `data.js` の `DT.DATA.STATS` 経由で参照し、ロジック内にstat IDをハードコードしない（contest.jsの派生値計算のみ例外として明示的にIDを使う）
- リポジトリルート: `app-dev/diabolo-trainer/`（このディレクトリで `git init` する。パスはすべてこのルートからの相対）

---

### Task 1: リポジトリ初期化・データ定義・テストハーネス

**Files:**
- Create: `.gitignore`
- Create: `js/data.js`
- Create: `tests/harness.js`
- Create: `tests/test-data.js`

**Interfaces:**
- Produces: `DT.DATA`（STATS / TRAININGS / STUDY / REST / CONTESTS / TOTAL_TURNS / STUDY_MIN / STUDY_LIMIT_MONTHS / STUDY_BONUS）— 以降の全タスクが参照する定数
- Produces: `tests/harness.js` の `{ test(name, fn), summary() }` — 全テストファイルが使用

- [ ] **Step 1: git初期化と.gitignore**

```bash
cd "app-dev/diabolo-trainer" && git init
```

`.gitignore`:
```
.DS_Store
```

- [ ] **Step 2: テストハーネスを書く**

`tests/harness.js`:
```js
'use strict';
let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('ok - ' + name);
  } catch (e) {
    fail += 1;
    console.error('FAIL - ' + name + ': ' + e.message);
  }
}

function summary() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
}

module.exports = { test, summary };
```

- [ ] **Step 3: dataの失敗するテストを書く**

`tests/test-data.js`:
```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
const DT = globalThis.DT;

test('DATA: 競技能力は7項目（技術4＋表現3）', () => {
  assert.strictEqual(DT.DATA.STATS.length, 7);
  assert.strictEqual(DT.DATA.STATS.filter(s => s.group === 'tech').length, 4);
  assert.strictEqual(DT.DATA.STATS.filter(s => s.group === 'expr').length, 3);
});

test('DATA: 練習メニューは競技能力と1対1対応', () => {
  assert.strictEqual(DT.DATA.TRAININGS.length, 7);
  DT.DATA.TRAININGS.forEach(t => {
    assert.ok(DT.DATA.STATS.some(s => s.id === t.stat), t.id + ' のstatが未定義');
    assert.ok(t.gain > 0 && t.fatigue >= 0 && t.risk >= 0);
  });
});

test('DATA: 大会は48ターン中に8回', () => {
  assert.strictEqual(DT.DATA.CONTESTS.length, 8);
  assert.strictEqual(DT.DATA.TOTAL_TURNS, 48);
  DT.DATA.CONTESTS.forEach(c => {
    assert.ok(c.turn >= 1 && c.turn <= 48);
    assert.ok(c.type === 'summer' || c.type === 'national');
  });
  assert.strictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'national').length, 4);
});

summary();
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `node tests/test-data.js`
Expected: `Cannot find module '../js/data.js'` で異常終了

- [ ] **Step 5: data.jsを実装**

`js/data.js`:
```js
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
```

- [ ] **Step 6: テストが通ることを確認**

Run: `node tests/test-data.js`
Expected: `3 passed, 0 failed`

- [ ] **Step 7: コミット**

```bash
git add .gitignore js/data.js tests/harness.js tests/test-data.js
git commit -m "feat: プロジェクト初期化・ゲームデータ定義・テストハーネス"
```

---

### Task 2: state.js — キャラ生成（ガチャポン型）とセーブ/ロード

**Files:**
- Create: `js/state.js`
- Test: `tests/test-state.js`

**Interfaces:**
- Consumes: `DT.DATA.STATS`
- Produces: `DT.state.newCharacter(rng)` → state オブジェクト `{ turn, stats: {statId: number}, study, fatigue, injuryRisk, motivation, injuredTurns, lowStudyMonths, didStudy, didTrain, results: [], status: 'playing'|'expelled'|'graduated' }`
- Produces: `DT.state.save(state, storage?)` / `DT.state.load(storage?)` / `DT.state.clear(storage?)` / `DT.state.SAVE_KEY`（storage省略時はlocalStorage）

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-state.js`:
```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
const DT = globalThis.DT;

test('newCharacter: 競技能力は10〜35でランダム生成', () => {
  const cMax = DT.state.newCharacter(() => 0.999);
  DT.DATA.STATS.forEach(s => assert.strictEqual(cMax.stats[s.id], 35, s.id));
  const cMin = DT.state.newCharacter(() => 0);
  DT.DATA.STATS.forEach(s => assert.strictEqual(cMin.stats[s.id], 10, s.id));
});

test('newCharacter: 初期状態が正しい', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.study, 40); // rng=0.999なら60
  assert.strictEqual(c.turn, 1);
  assert.strictEqual(c.fatigue, 0);
  assert.strictEqual(c.injuryRisk, 10);
  assert.strictEqual(c.motivation, 3);
  assert.strictEqual(c.injuredTurns, 0);
  assert.strictEqual(c.lowStudyMonths, 0);
  assert.deepStrictEqual(c.results, []);
  assert.strictEqual(c.status, 'playing');
});

test('save/load/clear: ラウンドトリップできる', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  const c = DT.state.newCharacter(() => 0.5);
  DT.state.save(c, store);
  assert.deepStrictEqual(DT.state.load(store), c);
  DT.state.clear(store);
  assert.strictEqual(DT.state.load(store), null);
});

summary();
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/test-state.js`
Expected: `Cannot find module '../js/state.js'` で異常終了

- [ ] **Step 3: state.jsを実装**

`js/state.js`:
```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const SAVE_KEY = 'diabolo-trainer-save-v1';

  function newCharacter(rng) {
    rng = rng || Math.random;
    const stats = {};
    DT.DATA.STATS.forEach(s => { stats[s.id] = 10 + Math.floor(rng() * 26); });
    return {
      turn: 1,
      stats: stats,
      study: 40 + Math.floor(rng() * 21),
      fatigue: 0,
      injuryRisk: 10,
      motivation: 3,
      injuredTurns: 0,
      lowStudyMonths: 0,
      didStudy: false,
      didTrain: false,
      results: [],
      status: 'playing'
    };
  }

  function save(state, storage) {
    (storage || global.localStorage).setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load(storage) {
    const raw = (storage || global.localStorage).getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clear(storage) {
    (storage || global.localStorage).removeItem(SAVE_KEY);
  }

  DT.state = { newCharacter, save, load, clear, SAVE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/test-state.js`
Expected: `3 passed, 0 failed`

- [ ] **Step 5: コミット**

```bash
git add js/state.js tests/test-state.js
git commit -m "feat: キャラ生成（ランダム初期値）とセーブ/ロード"
```

---

### Task 3: engine.js（前半）— 練習判定と能力成長

**Files:**
- Create: `js/engine.js`
- Test: `tests/test-engine.js`

**Interfaces:**
- Consumes: `DT.DATA`、`DT.state.newCharacter`（テストで使用）
- Produces: `DT.engine.outcomeProbs(state)` → `{ great, fail }`
- Produces: `DT.engine.rollTier(state, rng)` → `'大成功'|'成功'|'普通'|'失敗'`
- Produces: `DT.engine.growthMult(value)` → 成長減衰係数
- Produces: `DT.engine.applyAction(state, actionId, rng)` → `{ tier, messages: string[] }`（stateを直接変更。actionIdは練習ID・`'study'`・`'rest'`・`'injured'`）
- Produces: `DT.engine.TIER_MULT`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-engine.js`:
```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
const DT = globalThis.DT;

function base() {
  return DT.state.newCharacter(() => 0); // stats全10, study40, fatigue0, motivation3
}

test('growthMult: 能力値が高いほど伸びにくい', () => {
  assert.strictEqual(DT.engine.growthMult(10), 1.0);
  assert.strictEqual(DT.engine.growthMult(39), 1.0);
  assert.strictEqual(DT.engine.growthMult(40), 0.75);
  assert.strictEqual(DT.engine.growthMult(70), 0.5);
  assert.strictEqual(DT.engine.growthMult(90), 0.25);
});

test('outcomeProbs: 基準状態は大成功10%・失敗10%', () => {
  const p = DT.engine.outcomeProbs(base());
  assert.ok(Math.abs(p.great - 0.10) < 1e-9);
  assert.ok(Math.abs(p.fail - 0.10) < 1e-9);
});

test('outcomeProbs: 疲労100だと大成功2%・失敗40%（クランプ）', () => {
  const s = base();
  s.fatigue = 100;
  const p = DT.engine.outcomeProbs(s);
  assert.ok(Math.abs(p.great - 0.02) < 1e-9);
  assert.ok(Math.abs(p.fail - 0.40) < 1e-9);
});

test('outcomeProbs: 学力70以上でボーナス+5%', () => {
  const s = base();
  s.study = 70;
  assert.ok(Math.abs(DT.engine.outcomeProbs(s).great - 0.15) < 1e-9);
});

test('rollTier: 乱数値で4段階に分かれる', () => {
  const s = base(); // great=0.10, fail=0.10 → 成功帯0.20〜0.68, 普通帯0.68〜1.0
  assert.strictEqual(DT.engine.rollTier(s, () => 0.05), '大成功');
  assert.strictEqual(DT.engine.rollTier(s, () => 0.15), '失敗');
  assert.strictEqual(DT.engine.rollTier(s, () => 0.30), '成功');
  assert.strictEqual(DT.engine.rollTier(s, () => 0.90), '普通');
});

test('applyAction: 練習大成功で能力2倍伸び・やる気+1', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'multiplex', () => 0.0);
  assert.strictEqual(r.tier, '大成功');
  assert.strictEqual(s.stats.multiplex, 22); // 10 + round(6*2.0*1.0)
  assert.strictEqual(s.fatigue, 14);
  assert.strictEqual(s.injuryRisk, 16); // 10 + 6
  assert.strictEqual(s.motivation, 4);
  assert.strictEqual(s.didTrain, true);
});

test('applyAction: 練習失敗は伸びゼロ・疲労追加・やる気-1', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'multiplex', () => 0.15);
  assert.strictEqual(r.tier, '失敗');
  assert.strictEqual(s.stats.multiplex, 10);
  assert.strictEqual(s.fatigue, 19); // 14 + 5
  assert.strictEqual(s.motivation, 2);
});

test('applyAction: 休養で疲労-35・怪我リスク-12・やる気+1', () => {
  const s = base();
  s.fatigue = 50;
  s.injuryRisk = 30;
  DT.engine.applyAction(s, 'rest');
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.injuryRisk, 18);
  assert.strictEqual(s.motivation, 4);
  assert.strictEqual(s.didTrain, false);
});

test('applyAction: 勉強成功で学力+10', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'study', () => 0.30);
  assert.strictEqual(r.tier, '成功');
  assert.strictEqual(s.study, 50);
  assert.strictEqual(s.fatigue, 4);
  assert.strictEqual(s.didStudy, true);
});

summary();
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/test-engine.js`
Expected: `Cannot find module '../js/engine.js'` で異常終了

- [ ] **Step 3: engine.js（前半）を実装**

`js/engine.js`:
```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const TIER_MULT = { '大成功': 2.0, '成功': 1.0, '普通': 0.5, '失敗': 0 };

  function outcomeProbs(state) {
    const boost = (state.motivation - 3) * 0.05
      + (state.study >= DT.DATA.STUDY_BONUS ? 0.05 : 0)
      - Math.max(0, state.fatigue - 50) * 0.004;
    const great = clamp(0.10 + boost, 0.02, 0.30);
    const fail = clamp(
      0.10 + Math.max(0, state.fatigue - 50) * 0.006 - (state.motivation - 3) * 0.03,
      0.03, 0.40
    );
    return { great, fail };
  }

  function rollTier(state, rng) {
    const p = outcomeProbs(state);
    const r = (rng || Math.random)();
    if (r < p.great) return '大成功';
    if (r < p.great + p.fail) return '失敗';
    const rest = 1 - p.great - p.fail;
    return r < p.great + p.fail + rest * 0.6 ? '成功' : '普通';
  }

  function growthMult(value) {
    if (value >= 90) return 0.25;
    if (value >= 70) return 0.5;
    if (value >= 40) return 0.75;
    return 1.0;
  }

  function statLabel(id) {
    return DT.DATA.STATS.find(s => s.id === id).label;
  }

  function applyAction(state, actionId, rng) {
    rng = rng || Math.random;
    const messages = [];
    state.didStudy = false;
    state.didTrain = false;

    if (actionId === 'injured') {
      messages.push('怪我の療養に専念した。');
      return { tier: null, messages };
    }
    if (actionId === 'rest') {
      state.fatigue = clamp(state.fatigue - 35, 0, 100);
      state.injuryRisk = clamp(state.injuryRisk - 12, 0, 100);
      state.motivation = clamp(state.motivation + 1, 1, 5);
      messages.push('ゆっくり休んだ。疲労が回復した。');
      return { tier: null, messages };
    }
    if (actionId === 'study') {
      const tier = rollTier(state, rng);
      const gain = Math.round(DT.DATA.STUDY.gain * TIER_MULT[tier]);
      state.study = clamp(state.study + gain, 0, 100);
      state.fatigue = clamp(state.fatigue + DT.DATA.STUDY.fatigue, 0, 100);
      state.didStudy = true;
      messages.push('勉強（' + tier + '）: 学力 +' + gain);
      return { tier, messages };
    }

    const t = DT.DATA.TRAININGS.find(x => x.id === actionId);
    const tier = rollTier(state, rng);
    let gain = Math.round(t.gain * TIER_MULT[tier] * growthMult(state.stats[t.stat]));
    if (tier === '失敗') {
      gain = 0;
    } else if (gain < 1) {
      gain = 1;
    }
    state.stats[t.stat] = clamp(state.stats[t.stat] + gain, 0, 100);
    state.fatigue = clamp(state.fatigue + t.fatigue, 0, 100);
    state.injuryRisk = clamp(state.injuryRisk + t.risk, 0, 100);
    state.didTrain = true;

    if (tier === '失敗') {
      state.fatigue = clamp(state.fatigue + 5, 0, 100);
      state.motivation = clamp(state.motivation - 1, 1, 5);
      messages.push(t.label + '（失敗）: うまくいかず疲れだけが残った……');
    } else {
      if (tier === '大成功') state.motivation = clamp(state.motivation + 1, 1, 5);
      messages.push(t.label + '（' + tier + '）: ' + statLabel(t.stat) + ' +' + gain);
    }
    return { tier, messages };
  }

  DT.engine = { outcomeProbs, rollTier, growthMult, applyAction, TIER_MULT };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/test-engine.js`
Expected: `9 passed, 0 failed`

- [ ] **Step 5: コミット**

```bash
git add js/engine.js tests/test-engine.js
git commit -m "feat: 練習判定（4段階ランダム）と能力成長ロジック"
```

---

### Task 4: engine.js（後半）— ターン進行・怪我・退学判定

**Files:**
- Modify: `js/engine.js`（`DT.engine` に `endTurn` と `turnLabel` を追加）
- Modify: `tests/test-engine.js`（テスト追記）

**Interfaces:**
- Consumes: Task 3 の `DT.engine`、`state.didStudy` / `state.didTrain` フラグ
- Produces: `DT.engine.endTurn(state, rng)` → `{ events: string[] }`。学力自然減衰・疲労自然回復・怪我判定・退学判定を行い、続行なら `state.turn` を進め、48ターン終了で `state.status='graduated'`、退学で `'expelled'` にする
- Produces: `DT.engine.turnLabel(turn)` → `'1年生 4月'` 形式の文字列

- [ ] **Step 1: 失敗するテストを追記**

`tests/test-engine.js` の `summary();` の**直前**に追記:
```js
test('turnLabel: 4月始まりの年月表示', () => {
  assert.strictEqual(DT.engine.turnLabel(1), '1年生 4月');
  assert.strictEqual(DT.engine.turnLabel(10), '1年生 1月');
  assert.strictEqual(DT.engine.turnLabel(12), '1年生 3月');
  assert.strictEqual(DT.engine.turnLabel(13), '2年生 4月');
  assert.strictEqual(DT.engine.turnLabel(48), '4年生 3月');
});

test('endTurn: 勉強しなかった月は学力-2、疲労は自然回復-5', () => {
  const s = base();
  s.fatigue = 30;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.study, 38);
  assert.strictEqual(s.fatigue, 25);
  assert.strictEqual(s.turn, 2);
});

test('endTurn: 勉強した月は学力が減衰しない', () => {
  const s = base();
  s.didStudy = true;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.study, 40);
});

test('endTurn: 高疲労で練習すると怪我リスク加算', () => {
  const s = base();
  s.didTrain = true;
  s.fatigue = 70;
  DT.engine.endTurn(s, () => 0.99); // 乱数0.99は怪我しない
  assert.strictEqual(s.injuryRisk, 15); // 10 + 5
});

test('endTurn: 怪我発生で来月療養・リスクリセット', () => {
  const s = base();
  s.didTrain = true;
  s.injuryRisk = 100; // 怪我確率 100/500 = 20%
  const r = DT.engine.endTurn(s, () => 0.0);
  assert.strictEqual(s.injuredTurns, 1);
  assert.strictEqual(s.injuryRisk, 25);
  assert.strictEqual(s.motivation, 2);
  assert.ok(r.events.some(e => e.includes('怪我')));
});

test('endTurn: 療養明けで回復', () => {
  const s = base();
  s.injuredTurns = 1;
  s.fatigue = 60;
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.injuredTurns, 0);
  assert.strictEqual(s.fatigue, 30); // 60 - 25(療養) - 5(自然回復)
  assert.ok(r.events.some(e => e.includes('治った')));
});

test('endTurn: 学力低迷3ヶ月連続で退学', () => {
  const s = base();
  s.study = 10;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 1);
  assert.strictEqual(s.status, 'playing');
  DT.engine.endTurn(s, () => 0.99);
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.status, 'expelled');
  assert.ok(r.events.some(e => e.includes('退学')));
});

test('endTurn: 学力回復で警告カウンタがリセットされる', () => {
  const s = base();
  s.study = 10;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 1);
  s.study = 50;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 0);
});

test('endTurn: 48ターン目終了で卒業', () => {
  const s = base();
  s.turn = 48;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.status, 'graduated');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/test-engine.js`
Expected: 追加した9件が `FAIL`（`DT.engine.turnLabel is not a function` 等）、終了コード1

- [ ] **Step 3: engine.jsにendTurnとturnLabelを追加**

`js/engine.js` の `DT.engine = {...}` の**直前**に追加:
```js
  function endTurn(state, rng) {
    rng = rng || Math.random;
    const events = [];

    if (!state.didStudy) state.study = clamp(state.study - 2, 0, 100);
    state.fatigue = clamp(state.fatigue - 5, 0, 100);
    if (state.didTrain && state.fatigue >= 60) {
      state.injuryRisk = clamp(state.injuryRisk + 5, 0, 100);
    }

    if (state.didTrain && rng() < state.injuryRisk / 500) {
      state.injuredTurns = 1;
      state.injuryRisk = 25;
      state.motivation = clamp(state.motivation - 1, 1, 5);
      events.push('怪我をしてしまった！ 来月は療養が必要だ。');
    } else if (state.injuredTurns > 0) {
      state.injuredTurns -= 1;
      state.fatigue = clamp(state.fatigue - 25, 0, 100);
      if (state.injuredTurns === 0) events.push('怪我が治った！');
    }

    if (state.study < DT.DATA.STUDY_MIN) {
      state.lowStudyMonths += 1;
      if (state.lowStudyMonths >= DT.DATA.STUDY_LIMIT_MONTHS) {
        state.status = 'expelled';
        events.push('学業不振により退学処分となった……');
        return { events };
      }
      events.push('学業警告！（' + state.lowStudyMonths + '/' + DT.DATA.STUDY_LIMIT_MONTHS + 'ヶ月）');
    } else {
      state.lowStudyMonths = 0;
    }

    state.turn += 1;
    if (state.turn > DT.DATA.TOTAL_TURNS) state.status = 'graduated';
    return { events };
  }

  function turnLabel(turn) {
    const year = Math.ceil(turn / 12);
    const month = ((turn - 1) % 12 + 3) % 12 + 1;
    return year + '年生 ' + month + '月';
  }
```

exports行を次に変更:
```js
  DT.engine = { outcomeProbs, rollTier, growthMult, applyAction, endTurn, turnLabel, TIER_MULT };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/test-engine.js`
Expected: `18 passed, 0 failed`

- [ ] **Step 5: コミット**

```bash
git add js/engine.js tests/test-engine.js
git commit -m "feat: ターン進行・怪我・退学・卒業判定"
```

---

### Task 5: contest.js — 派生スコアと大会シミュレーション

**Files:**
- Create: `js/contest.js`
- Test: `tests/test-contest.js`

**Interfaces:**
- Consumes: `DT.DATA.CONTESTS`、stateの `stats` / `fatigue` / `motivation` / `results`
- Produces: `DT.contest.derived(state)` → `{ difficulty, expression, missRate }`（設計書の「総合系」仮項目に対応する派生表示値）
- Produces: `DT.contest.playerScore(state, rng)` → `{ score, misses }`
- Produces: `DT.contest.run(state, contest, rng)` → `{ name, type, rank, entrants, score, misses, points }`（`state.results` に追加もする）
- Produces: `DT.contest.contestForTurn(turn)` → 大会オブジェクト or `null`
- Produces: `DT.contest.LEVELS`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-contest.js`:
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

test('derived: 難易度=技3種平均, 表現=表現3種平均, ミス率クランプ', () => {
  const s = allFifty();
  const d = DT.contest.derived(s);
  assert.strictEqual(d.difficulty, 50);
  assert.strictEqual(d.expression, 50);
  assert.strictEqual(d.missRate, 10); // 25 + 0*0.3 - 50*0.3 = 10
  s.fatigue = 100;
  s.stats.basic = 0;
  assert.strictEqual(DT.contest.derived(s).missRate, 55); // 25 + 30 - 0
});

test('playerScore: 乱数0.5固定でノイズ0・ミス0', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, () => 0.5);
  // 50*0.45 + 50*0.15 + 50*0.35 + 0 + 0 = 47.5
  assert.strictEqual(r.score, 47.5);
  assert.strictEqual(r.misses, 0);
});

test('contestForTurn: 大会月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'summer');
  assert.strictEqual(DT.contest.contestForTurn(47).type, 'national');
  assert.strictEqual(DT.contest.contestForTurn(6), null);
});

test('run: 全員平均点の相手に勝てば1位・夏大会40pt', () => {
  const s = allFifty();
  const contest = DT.DATA.CONTESTS[0]; // 1年夏, 相手平均30
  const r = DT.contest.run(s, contest, () => 0.5);
  assert.strictEqual(r.rank, 1);
  assert.strictEqual(r.points, 40);
  assert.strictEqual(r.entrants, 16);
  assert.strictEqual(s.results.length, 1);
});

test('run: 弱いと下位グループで最低ポイント', () => {
  const s = DT.state.newCharacter(() => 0); // 全能力10
  const contest = DT.DATA.CONTESTS[7]; // 4年全国, 相手平均69
  const r = DT.contest.run(s, contest, () => 0.5);
  assert.ok(r.rank > 8);
  assert.strictEqual(r.points, 5);
});

summary();
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/test-contest.js`
Expected: `Cannot find module '../js/contest.js'` で異常終了

- [ ] **Step 3: contest.jsを実装**

`js/contest.js`:
```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 「総合系」仮項目（難易度スコア・ミス率・総合表現力）は基礎能力からの派生値として実装
  function derived(state) {
    const s = state.stats;
    const difficulty = Math.round((s.multiplex + s.isolation + s.saisai) / 3);
    const expression = Math.round((s.composition + s.music + s.staging) / 3);
    const missRate = clamp(Math.round(25 + state.fatigue * 0.3 - s.basic * 0.3), 2, 60);
    return { difficulty, expression, missRate };
  }

  function playerScore(state, rng) {
    rng = rng || Math.random;
    const d = derived(state);
    let score = d.difficulty * 0.45 + state.stats.basic * 0.15 + d.expression * 0.35
      + (state.motivation - 3) * 2 + (rng() * 10 - 5);
    let misses = 0;
    for (let i = 0; i < 2; i++) {
      if (rng() * 100 < d.missRate) misses += 1;
    }
    score -= misses * 8;
    return { score: Math.round(score * 10) / 10, misses };
  }

  const LEVELS = {
    summer:   { base: 30, growth: 8, sd: 10, entrants: 16, points: [40, 25, 15, 8, 2] },
    national: { base: 45, growth: 8, sd: 12, entrants: 16, points: [100, 70, 50, 20, 5] }
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
      entrants: lv.entrants, score: p.score, misses: p.misses, points
    };
    state.results.push(result);
    return result;
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { derived, playerScore, run, contestForTurn, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/test-contest.js`
Expected: `5 passed, 0 failed`

- [ ] **Step 5: コミット**

```bash
git add js/contest.js tests/test-contest.js
git commit -m "feat: 大会スコア計算・順位判定・ポイント付与"
```

---

### Task 6: ending.js — 卒業評価

**Files:**
- Create: `js/ending.js`
- Test: `tests/test-ending.js`

**Interfaces:**
- Consumes: `state.status` / `state.results` / `state.stats`
- Produces: `DT.ending.evaluate(state)` → `{ rank, title, totalPoints, abilityAvg?, nationalWin?, comment? }`。rankは `'S'|'A'|'B'|'C'|'D'|'E'|'退学'`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-ending.js`:
```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/ending.js');
const DT = globalThis.DT;

function withResults(pointsList, nationalWin) {
  const s = DT.state.newCharacter(() => 0.5);
  s.status = 'graduated';
  s.results = pointsList.map((p, i) => ({
    name: 'test' + i,
    type: (nationalWin && i === 0) ? 'national' : 'summer',
    rank: (nationalWin && i === 0) ? 1 : 5,
    entrants: 16, score: 50, misses: 0, points: p
  }));
  return s;
}

test('evaluate: 退学は専用評価', () => {
  const s = DT.state.newCharacter(() => 0.5);
  s.status = 'expelled';
  const e = DT.ending.evaluate(s);
  assert.strictEqual(e.rank, '退学');
  assert.ok(e.comment.length > 0);
});

test('evaluate: ポイント閾値でランクが決まる', () => {
  assert.strictEqual(DT.ending.evaluate(withResults([250])).rank, 'S');
  assert.strictEqual(DT.ending.evaluate(withResults([150])).rank, 'A');
  assert.strictEqual(DT.ending.evaluate(withResults([90])).rank, 'B');
  assert.strictEqual(DT.ending.evaluate(withResults([50])).rank, 'C');
  assert.strictEqual(DT.ending.evaluate(withResults([20])).rank, 'D');
  assert.strictEqual(DT.ending.evaluate(withResults([5])).rank, 'E');
});

test('evaluate: 全国優勝があればポイント不足でもS', () => {
  const e = DT.ending.evaluate(withResults([100], true));
  assert.strictEqual(e.rank, 'S');
  assert.strictEqual(e.nationalWin, true);
});

test('evaluate: 合計ポイントと能力平均を返す', () => {
  const e = DT.ending.evaluate(withResults([40, 25]));
  assert.strictEqual(e.totalPoints, 65);
  assert.ok(e.abilityAvg >= 10 && e.abilityAvg <= 35);
  assert.ok(e.title.length > 0);
});

summary();
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node tests/test-ending.js`
Expected: `Cannot find module '../js/ending.js'` で異常終了

- [ ] **Step 3: ending.jsを実装**

`js/ending.js`:
```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  function totalPoints(state) {
    return state.results.reduce((a, r) => a + r.points, 0);
  }

  function evaluate(state) {
    const points = totalPoints(state);
    if (state.status === 'expelled') {
      return {
        rank: '退学',
        title: '道半ばの退学……',
        totalPoints: points,
        comment: 'ディアボロに打ち込みすぎた。学業との両立も実力のうち。'
      };
    }
    const abilityAvg = Math.round(
      DT.DATA.STATS.reduce((a, s) => a + state.stats[s.id], 0) / DT.DATA.STATS.length
    );
    const nationalWin = state.results.some(r => r.type === 'national' && r.rank === 1);
    let rank;
    if (nationalWin || points >= 250) rank = 'S';
    else if (points >= 150) rank = 'A';
    else if (points >= 90) rank = 'B';
    else if (points >= 50) rank = 'C';
    else if (points >= 20) rank = 'D';
    else rank = 'E';
    const titles = {
      S: '伝説のディアボリスト',
      A: '全国区のトッププレイヤー',
      B: '大会常連の実力者',
      C: '努力の中堅プレイヤー',
      D: 'これからのプレイヤー',
      E: 'サークルの思い出'
    };
    return { rank, title: titles[rank], totalPoints: points, abilityAvg, nationalWin };
  }

  DT.ending = { evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node tests/test-ending.js`
Expected: `4 passed, 0 failed`

- [ ] **Step 5: コミット**

```bash
git add js/ending.js tests/test-ending.js
git commit -m "feat: 卒業評価（S〜Eランク・退学エンド）"
```

---

### Task 7: UI骨格 — index.html / CSS / タイトル・キャラ作成画面

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js`（この時点ではタイトル〜キャラ作成〜メイン画面表示まで。`onAction`はダミー）

**Interfaces:**
- Consumes: `DT.state.newCharacter` / `DT.state.load` / `DT.DATA` / `DT.engine.turnLabel` / `DT.contest.derived`
- Produces: DOMヘルパー `el(tag, cls, text)` / `statBar(label, value)` / `textRow(label, value)`、画面関数 `show(id)` / `renderCreate(c)` / `renderMain(logs)` / `renderActions()`（Task 8が `onAction` 本実装で完成させる）

- [ ] **Step 1: index.htmlを作成**

`index.html`:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ディアボロ選手育成</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<div id="app">
  <section id="screen-title" class="screen">
    <h1>ディアボロ選手育成</h1>
    <p class="subtitle">〜大学4年間、ディアボロに懸けろ〜</p>
    <button id="btn-new" class="primary">はじめから</button>
    <button id="btn-continue">つづきから</button>
  </section>

  <section id="screen-create" class="screen hidden">
    <h2>新入生スカウト</h2>
    <p class="subtitle">今年の新入生はこんな選手！</p>
    <div id="create-stats" class="card"></div>
    <button id="btn-reroll">引き直す</button>
    <button id="btn-start" class="primary">この選手で始める</button>
  </section>

  <section id="screen-main" class="screen hidden">
    <header id="main-header"></header>
    <div id="main-cond" class="card"></div>
    <div id="main-stats" class="card"></div>
    <div id="main-actions" class="card"></div>
    <div id="main-log" class="card"></div>
  </section>

  <section id="screen-contest" class="screen hidden">
    <h2 id="contest-name"></h2>
    <div id="contest-result" class="card"></div>
    <button id="btn-contest-ok" class="primary">結果を受け止める</button>
  </section>

  <section id="screen-ending" class="screen hidden">
    <h2 id="ending-title"></h2>
    <div id="ending-detail" class="card"></div>
    <button id="btn-restart" class="primary">タイトルへ</button>
  </section>
</div>
<script src="js/data.js"></script>
<script src="js/state.js"></script>
<script src="js/engine.js"></script>
<script src="js/contest.js"></script>
<script src="js/ending.js"></script>
<script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.cssを作成**

`css/style.css`:
```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  background: #1a1a2e;
  color: #eaeaea;
  min-height: 100vh;
}
#app { max-width: 480px; margin: 0 auto; padding: 16px; }
.screen { display: flex; flex-direction: column; gap: 12px; padding-top: 24px; }
.hidden { display: none; }
h1 { font-size: 1.6rem; text-align: center; color: #ffd166; }
h2 { font-size: 1.3rem; text-align: center; color: #ffd166; }
.subtitle { text-align: center; color: #aaa; font-size: 0.9rem; }
.center { text-align: center; }
button {
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #2e2e4e;
  color: #eaeaea;
  font-size: 1rem;
  cursor: pointer;
}
button.primary { background: #e07a5f; font-weight: bold; }
button:disabled { opacity: 0.4; cursor: default; }
.card { background: #23233d; border-radius: 12px; padding: 12px; }
.stat-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 0.85rem; }
.stat-row .label { width: 9em; flex-shrink: 0; }
.stat-row .bar-bg { flex: 1; height: 10px; background: #11111f; border-radius: 5px; overflow: hidden; display: block; }
.stat-row .bar { height: 100%; background: linear-gradient(90deg, #4ecdc4, #ffd166); display: block; }
.stat-row .val { width: 2.5em; text-align: right; }
#main-header { text-align: center; font-size: 1.05rem; color: #ffd166; }
#main-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#main-actions button { font-size: 0.85rem; padding: 10px 4px; }
#main-log { font-size: 0.85rem; line-height: 1.6; min-height: 3em; }
.cond-warn { color: #ff6b6b; font-weight: bold; }
.result-big { text-align: center; font-size: 2rem; margin: 12px 0; color: #ffd166; }
table.results { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 8px; }
table.results td, table.results th { padding: 4px; border-bottom: 1px solid #333; text-align: left; }
```

- [ ] **Step 3: app.js（タイトル〜キャラ作成〜メイン画面骨格）を作成**

`js/app.js`:
```js
(function () {
  'use strict';
  const DT = window.DT;
  const $ = (sel) => document.querySelector(sel);

  let state = null;
  let candidate = null;
  let pendingLogs = [];

  // --- DOMヘルパー（innerHTML不使用） ---
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function statBar(label, value) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', 'label', label));
    const bg = el('span', 'bar-bg');
    const bar = el('span', 'bar');
    bar.style.width = value + '%';
    bg.appendChild(bar);
    row.appendChild(bg);
    row.appendChild(el('span', 'val', String(value)));
    return row;
  }

  function textRow(label, value) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', 'label', label));
    row.appendChild(el('span', '', value));
    return row;
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  // --- タイトル ---
  function initTitle() {
    $('#btn-continue').disabled = !DT.state.load();
    show('#screen-title');
  }

  $('#btn-new').onclick = () => renderCreate(DT.state.newCharacter());
  $('#btn-continue').onclick = () => { state = DT.state.load(); renderMain([]); };

  // --- キャラ作成（ガチャポン型） ---
  function renderCreate(c) {
    candidate = c;
    $('#create-stats').replaceChildren(
      ...DT.DATA.STATS.map(s => statBar(s.label, c.stats[s.id])),
      statBar('学力', c.study)
    );
    show('#screen-create');
  }

  $('#btn-reroll').onclick = () => renderCreate(DT.state.newCharacter());
  $('#btn-start').onclick = () => { state = candidate; DT.state.save(state); renderMain([]); };

  // --- メイン画面 ---
  function renderMain(logs) {
    const nextContest = DT.DATA.CONTESTS.find(c => c.turn >= state.turn);
    $('#main-header').textContent = DT.engine.turnLabel(state.turn) +
      (nextContest ? '｜次: ' + nextContest.name + '（' + DT.engine.turnLabel(nextContest.turn) + '）' : '');

    const d = DT.contest.derived(state);
    const motiLabels = ['絶不調', '不調', '普通', '好調', '絶好調'];
    const condNodes = [
      statBar('疲労', state.fatigue),
      statBar('怪我リスク', state.injuryRisk),
      statBar('学力', state.study),
      textRow('やる気', motiLabels[state.motivation - 1]),
      textRow('難易度/表現/ミス率', d.difficulty + ' / ' + d.expression + ' / ' + d.missRate + '%')
    ];
    if (state.study < DT.DATA.STUDY_MIN) {
      condNodes.push(el('div', 'cond-warn', '⚠ 学業警告中！'));
    }
    $('#main-cond').replaceChildren(...condNodes);

    $('#main-stats').replaceChildren(
      ...DT.DATA.STATS.map(s => statBar(s.label, state.stats[s.id]))
    );

    renderActions();

    if (logs.length > 0) {
      $('#main-log').replaceChildren(...logs.map(l => el('div', '', l)));
    } else {
      $('#main-log').replaceChildren(el('div', '', 'どうする？'));
    }
    show('#screen-main');
  }

  function actionButton(id, label, span2) {
    const b = el('button', '', label);
    if (span2) b.style.gridColumn = 'span 2';
    b.onclick = () => onAction(id);
    return b;
  }

  function renderActions() {
    const buttons = state.injuredTurns > 0
      ? [actionButton('injured', '療養する（怪我）', true)]
      : DT.DATA.TRAININGS.map(t => actionButton(t.id, t.label))
          .concat([actionButton('study', '勉強'), actionButton('rest', '休養')]);
    $('#main-actions').replaceChildren(...buttons);
  }

  // onAction・大会・エンディングは Task 8 で実装
  function onAction(actionId) {
    console.log('action:', actionId);
  }

  initTitle();
})();
```

- [ ] **Step 4: ブラウザで動作確認**

`index.html` をブラウザで開き（またはプレビューサーバーで表示し）、以下を確認:
- タイトル画面が表示され、「つづきから」がグレーアウトしている（初回）
- 「はじめから」→ 新入生の能力バー8本（競技7＋学力）が表示される
- 「引き直す」を押すたびに数値が変わる
- 「この選手で始める」→ メイン画面に「1年生 4月｜次: 1年 夏大会（1年生 8月）」、コンディション・能力値・アクションボタン9個（練習7＋勉強＋休養）・ログ欄が表示される
- ボタンを押すとコンソールに `action: multiplex` 等が出る（まだターンは進まない）
- リロード→「つづきから」が有効になり、押すとメイン画面に復帰する

- [ ] **Step 5: コミット**

```bash
git add index.html css/style.css js/app.js
git commit -m "feat: UI骨格（タイトル・キャラ作成・メイン画面）"
```

---

### Task 8: UI結線 — ターン実行・大会・エンディング・オートセーブ

**Files:**
- Modify: `js/app.js`（`onAction` の実装、大会・エンディング画面の描画を追加）

**Interfaces:**
- Consumes: `DT.engine.applyAction` / `DT.engine.endTurn` / `DT.contest.contestForTurn` / `DT.contest.run` / `DT.ending.evaluate` / `DT.state.save` / `DT.state.clear`
- Produces: 完動するv1ゲームループ

- [ ] **Step 1: onActionを実装（Task 7のダミーを置き換え）**

`js/app.js` の `function onAction(actionId) { console.log('action:', actionId); }` と直前のコメント行を以下に置き換え、`initTitle();` の**前**に大会・エンディング描画も追加:
```js
  // --- ターン実行 ---
  function onAction(actionId) {
    const result = DT.engine.applyAction(state, actionId);
    const contest = DT.contest.contestForTurn(state.turn);
    let contestResult = null;
    if (contest) contestResult = DT.contest.run(state, contest);
    const end = DT.engine.endTurn(state);
    const logs = result.messages.concat(end.events);
    DT.state.save(state);
    if (contestResult) {
      pendingLogs = logs;
      renderContest(contestResult);
      return;
    }
    afterTurn(logs);
  }

  function afterTurn(logs) {
    if (state.status !== 'playing') {
      renderEnding();
      return;
    }
    renderMain(logs);
  }

  // --- 大会画面 ---
  function renderContest(r) {
    $('#contest-name').textContent = r.name;
    $('#contest-result').replaceChildren(
      el('div', 'result-big', r.rank + '位 / ' + r.entrants + '人'),
      textRow('スコア', String(r.score)),
      textRow('ミス', r.misses + '回'),
      textRow('獲得ポイント', r.points + 'pt')
    );
    show('#screen-contest');
  }

  $('#btn-contest-ok').onclick = () => afterTurn(pendingLogs);

  // --- エンディング ---
  function resultsTable(results) {
    const table = el('table', 'results');
    const head = el('tr');
    ['大会', '順位', 'pt'].forEach(h => head.appendChild(el('th', '', h)));
    table.appendChild(head);
    results.forEach(r => {
      const tr = el('tr');
      tr.appendChild(el('td', '', r.name));
      tr.appendChild(el('td', '', r.rank + '位'));
      tr.appendChild(el('td', '', r.points + 'pt'));
      table.appendChild(tr);
    });
    return table;
  }

  function renderEnding() {
    const e = DT.ending.evaluate(state);
    $('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : '卒業！';
    const nodes = [
      el('div', 'result-big', e.rank),
      el('p', 'center', e.title)
    ];
    if (e.comment) nodes.push(el('p', 'center', e.comment));
    nodes.push(textRow('通算ポイント', e.totalPoints + 'pt'));
    if (e.abilityAvg !== undefined) nodes.push(textRow('最終能力平均', String(e.abilityAvg)));
    if (state.results.length > 0) nodes.push(resultsTable(state.results));
    $('#ending-detail').replaceChildren(...nodes);
    show('#screen-ending');
  }

  $('#btn-restart').onclick = () => { DT.state.clear(); state = null; initTitle(); };
```

- [ ] **Step 2: ロジックテストが全部通ることを再確認（リグレッション）**

Run: `node tests/test-data.js && node tests/test-state.js && node tests/test-engine.js && node tests/test-contest.js && node tests/test-ending.js`
Expected: すべて `0 failed`

- [ ] **Step 3: ブラウザで通しプレイ確認**

`index.html` を開いて確認:
- 練習を選ぶとログに結果（大成功/成功/普通/失敗）が出て月が進む
- 疲労バーが練習で増え、休養で減る
- 1年生8月（ターン5）で大会画面が出て、順位とポイントが表示される
- 勉強せず学力を20未満に落とすと「学業警告！」が出て、3ヶ月続くとGAME OVER画面になる
- リロード→「つづきから」で途中から再開できる（オートセーブ）
- 「タイトルへ」を押すとセーブが消え「つづきから」がグレーアウトする

- [ ] **Step 4: コミット**

```bash
git add js/app.js
git commit -m "feat: ゲームループ結線（ターン実行・大会・エンディング・オートセーブ）"
```

---

### Task 9: 48ターン自動プレイシミュレーションテスト

**Files:**
- Test: `tests/test-simulation.js`

**Interfaces:**
- Consumes: 全ロジックモジュール（UIは除く）。UIの `onAction` と同じ手順（applyAction → contest → endTurn）を再現する

- [ ] **Step 1: シミュレーションテストを書く**

`tests/test-simulation.js`:
```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
require('../js/contest.js');
require('../js/ending.js');
const DT = globalThis.DT;

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function chooseSensible(state) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.study < 30) return 'study';
  if (state.fatigue > 55) return 'rest';
  let worst = DT.DATA.TRAININGS[0];
  DT.DATA.TRAININGS.forEach(t => {
    if (state.stats[t.stat] < state.stats[worst.stat]) worst = t;
  });
  return worst.id;
}

function playThrough(rng, choose) {
  const state = DT.state.newCharacter(rng);
  let guard = 0;
  while (state.status === 'playing' && guard < 100) {
    guard += 1;
    DT.engine.applyAction(state, choose(state), rng);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) DT.contest.run(state, contest, rng);
    DT.engine.endTurn(state, rng);
  }
  return state;
}

test('まともな方針なら20回全部卒業できる', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    assert.strictEqual(s.status, 'graduated', 'seed=' + seed);
    assert.strictEqual(s.results.length, 8, 'seed=' + seed + ' 大会数');
    const e = DT.ending.evaluate(s);
    assert.ok('SABCDE'.includes(e.rank), 'seed=' + seed + ' rank=' + e.rank);
  }
});

test('まともな方針なら能力は確実に成長する', () => {
  const s = playThrough(lcg(42), chooseSensible);
  const avg = DT.DATA.STATS.reduce((a, st) => a + s.stats[st.id], 0) / DT.DATA.STATS.length;
  assert.ok(avg >= 40, '最終能力平均が低すぎる: ' + avg);
});

test('勉強を一切しないと退学になる', () => {
  const s = playThrough(lcg(7), (state) =>
    state.injuredTurns > 0 ? 'injured' : (state.fatigue > 55 ? 'rest' : 'multiplex')
  );
  assert.strictEqual(s.status, 'expelled');
  // 初期学力は最大60。減衰-2/月で20を割るまで最長約21ヶ月＋警告3ヶ月
  assert.ok(s.turn < 30, '退学が遅すぎる: turn=' + s.turn);
});

summary();
```

- [ ] **Step 2: テストを実行して結果を確認**

Run: `node tests/test-simulation.js`
Expected: `3 passed, 0 failed`

（失敗した場合はバランス数値のバグ発見の可能性が高い。期待値をいじって黙らせるのではなく、学力自然減衰と勉強頻度の釣り合い・疲労回復量などロジック側を疑って修正する）

- [ ] **Step 3: 全テストの最終確認**

Run: `for f in tests/test-*.js; do echo "== $f"; node "$f" || break; done`
Expected: 6ファイルすべて `0 failed`

- [ ] **Step 4: コミット**

```bash
git add tests/test-simulation.js
git commit -m "test: 48ターン自動プレイシミュレーション"
```

---

## 完了条件

- `index.html` をブラウザで開くだけで、キャラ作成→48ターン育成→大会8回→卒業評価まで通しでプレイできる
- 全テスト（data / state / engine / contest / ending / simulation）がNodeで緑
- スマホ幅（375px）で崩れない

## v1に含めないもの（設計書どおりv2以降）

- NPCイベント（コーチ・仲間・ライバル）
- 裏エンディング「サーカスの世界へ」
- AI生成イラスト
- 実際の大会採点基準への差し替え（データ入手後、`data.js`の`STATS`と`contest.js`の派生値・スコア式を更新する）
