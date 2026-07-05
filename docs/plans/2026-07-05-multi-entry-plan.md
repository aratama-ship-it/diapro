# 複数部門エントリー＋大会実名化（v1.2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 大会を実名化（8月OIDC、3月AJDC=全日本選手権が頂点）し、個人総合＋スペシャリストクラス3部門（1D垂直軸/1D水平軸/2D）への複数エントリーを実装する。スペシャリストの採点はJDA規定の配点（難易度45/操作安定15/新奇性30/演技構成10、基礎・多彩性なし）。

**Architecture:** 部門を `DT.DATA.DIVISIONS`、採点方式を `DT.DATA.SCORING.{overall,specialist}` にデータ駆動化。大会は「エントリー選択→部門ごとに順次演技（1演技ごとに疲労加算→後の演技ほどミス率上昇）→部門別順位・ポイント」の流れ。掛け持ち枠は学年数（1年:総合+1 → 3年以降:総合+全3部門）。スペシャリストのポイントは総合の半分。

**Tech Stack:** 変更なし

## Global Constraints

- 既存のIIFE・rng注入・innerHTML禁止・データ駆動規約を維持
- スペシャリスト配点はJDA規定書のスペシャリストクラス表のとおり: 難易度45/操作安定度15/新奇性30/演技構成10（多彩性・基礎は採点されない）
- 掛け持ち枠: スペシャリスト出場可能数 = min(3, 学年)。総合は常に出場
- 演技順: 総合→選択したスペシャリスト部門。**2演技目以降、演技前に疲労+6**（SCORING.entryFatigue）
- ポイント: OIDC総合[40,25,15,8,2]/スペシャ[20,13,8,4,1]、AJDC総合[100,70,50,20,5]/スペシャ[50,35,25,10,3]
- S評価の「全国優勝」は「AJDC**総合部門**優勝」に読み替える
- セーブキーは `diabolo-trainer-save-v3`。load時に旧キー(v1/v2)を掃除
- 前回最終レビューのMinor対応を織り込む: execDeductionMaxを実際に使う／大会結果に「調子・審査」行（内訳合計=スコアが成立）／ミス率表示は「1判定あたり」と明記
- リポジトリルート: app-dev/diabolo-trainer/

---

### Task 1: data.js 部門・実名大会・採点定数の再構成、セーブキーv3

**Files:**
- Modify: `js/data.js`（CONTESTS/SCORING差し替え、DIVISIONS追加。STATS/TRAININGS/STUDY等は不変）
- Modify: `js/state.js`（SAVE_KEY v3＋旧キー掃除）
- Modify: `tests/test-data.js`
- Modify: `tests/test-state.js`

**Interfaces:**
- Produces: `DT.DATA.CONTESTS` = OIDC(turn 5,17,29,41, type:'oidc') / AJDC(turn 12,24,36,48, type:'ajdc')
- Produces: `DT.DATA.DIVISIONS` = `[{id:'overall', label:'個人総合部門', scoring:'overall'}, {id:'v1d', label:'1ディアボロ垂直軸部門', scoring:'specialist'}, {id:'h1d', label:'1ディアボロ水平軸部門', scoring:'specialist'}, {id:'d2', label:'2ディアボロ部門', scoring:'specialist'}]`
- Produces: `DT.DATA.SCORING` = `{ overall: {weights:{difficulty:30,variety:10,control:10,novelty:10,composition:20}, base:{stat:'fundamentals',elements:4,perElement:5}}, specialist: {weights:{difficulty:45,control:15,novelty:30,composition:10}}, execDeductionMax:2, specialDeduction:3, entryFatigue:6 }`
- Produces: `DT.state.SAVE_KEY`='diabolo-trainer-save-v3'、`load()`が旧キーを削除

- [ ] **Step 1: test-data.jsを更新**

SCORINGテストとCONTESTSテストを差し替え、DIVISIONSテストを追加（STATS/TRAININGSテストは不変）:
```js
test('DATA: SCORINGは総合とスペシャリストの2方式（各100点）', () => {
  const o = DT.DATA.SCORING.overall;
  assert.deepStrictEqual(o.weights, { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 });
  assert.strictEqual(o.base.elements * o.base.perElement, 20);
  const s = DT.DATA.SCORING.specialist;
  assert.deepStrictEqual(s.weights, { difficulty: 45, control: 15, novelty: 30, composition: 10 });
  assert.strictEqual(s.base, undefined); // スペシャリストに基礎点はない
  assert.strictEqual(Object.values(s.weights).reduce((a, v) => a + v, 0), 100);
});

test('DATA: DIVISIONSは総合1＋スペシャリスト3', () => {
  assert.strictEqual(DT.DATA.DIVISIONS.length, 4);
  assert.strictEqual(DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').length, 3);
  assert.strictEqual(DT.DATA.DIVISIONS[0].id, 'overall');
});

test('DATA: 大会はOIDC(8月)×4とAJDC(3月)×4', () => {
  assert.strictEqual(DT.DATA.CONTESTS.length, 8);
  assert.deepStrictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'oidc').map(c => c.turn), [5, 17, 29, 41]);
  assert.deepStrictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'ajdc').map(c => c.turn), [12, 24, 36, 48]);
});
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/test-data.js` → 新テストFAIL

- [ ] **Step 3: data.jsを更新**

```js
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
```

- [ ] **Step 4: state.jsを更新＋test-state.jsにテスト追加**

state.js:
```js
  const SAVE_KEY = 'diabolo-trainer-save-v3';
  const OLD_KEYS = ['diabolo-trainer-save-v1', 'diabolo-trainer-save-v2'];
```
load()の先頭で旧キー掃除:
```js
  function load(storage) {
    const s = storage || global.localStorage;
    OLD_KEYS.forEach(k => s.removeItem(k));
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
```
test-state.jsの`summary();`直前に追加:
```js
test('load: 旧バージョンのセーブキーを掃除する', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  store.setItem('diabolo-trainer-save-v1', '{}');
  store.setItem('diabolo-trainer-save-v2', '{}');
  DT.state.load(store);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v1'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v2'), null);
});
```

- [ ] **Step 5: ゲート確認**

Run: `node tests/test-data.js && node tests/test-state.js && node tests/test-engine.js`
Expected: すべて緑（test-contest/test-ending/test-simulationはTask 2-3まで壊れていてよい）

- [ ] **Step 6: コミット**

```bash
git add js/data.js js/state.js tests/test-data.js tests/test-state.js
git commit -m "feat: 部門定義・OIDC/AJDC実名大会・スペシャリスト配点を追加、セーブキーv3"
```

---

### Task 2: contest.js 部門対応＋ending.js AJDC総合優勝判定

**Files:**
- Modify: `js/contest.js`（全面改訂）
- Modify: `js/ending.js`（nationalWin→ajdcOverallWin）
- Modify: `tests/test-contest.js`（全面書き換え）
- Modify: `tests/test-ending.js`（結果オブジェクトの形を追随）

**Interfaces:**
- Produces: `DT.contest.breakdown(state, divisionId)` → 部門の採点方式による項目別得点（specialistは4項目のみ）
- Produces: `DT.contest.missRate(state)`（不変）
- Produces: `DT.contest.playerScore(state, divisionId, rng)` → `{ score, parts, judgeMod, misses, execDeduction, specialDeduction }`（judgeMod=調子＋審査ぶれ、0.1点精度。parts合計+judgeMod−減点=score が成立する）
- Produces: `DT.contest.maxSpecialists(turn)` → min(3, 学年)
- Produces: `DT.contest.runAll(state, contest, specialistIds, rng)` → 結果配列。演技順=総合→specialistIds順。2演技目以降は演技前に疲労+entryFatigue。各結果を`state.results`にpush
- Produces: 結果オブジェクト: `{ name, type, division, divisionLabel, rank, entrants, score, parts, judgeMod, misses, execDeduction, specialDeduction, points }`
- Produces: `DT.contest.contestForTurn` / `LEVELS`（pointsは`{overall:[], specialist:[]}`の2表に）
- 廃止: `DT.contest.run`（app.js側はTask 4で追随）
- Produces: `DT.ending.evaluate` のS条件が「AJDC総合部門優勝 or 250pt」に

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
  return s;
}

test('breakdown(overall): 従来どおり6項目・all50で合計50', () => {
  const b = DT.contest.breakdown(allFifty(), 'overall');
  assert.deepStrictEqual(b, { difficulty: 15, variety: 5, control: 5, novelty: 5, composition: 10, fundamentals: 10 });
});

test('breakdown(specialist): 4項目のみ・all50で合計50', () => {
  const b = DT.contest.breakdown(allFifty(), 'v1d');
  assert.deepStrictEqual(b, { difficulty: 22.5, control: 7.5, novelty: 15, composition: 5 });
});

test('playerScore: parts合計+judgeMod-減点=score が成立', () => {
  const s = allFifty();
  s.motivation = 5; // judgeMod = 4 + noise
  const r = DT.contest.playerScore(s, 'overall', () => 0.5); // noise 0
  const partsSum = Object.values(r.parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(r.judgeMod, 4);
  assert.strictEqual(r.score, Math.round((partsSum + r.judgeMod) * 10) / 10);
});

test('playerScore: 実施減点はexecDeductionMaxを使う', () => {
  const s = allFifty();
  s.fatigue = 100; s.stats.control = 0; // missRate 55
  // rng: noise0.5, miss判定0.0(ミス), 減点幅1.0(→1+round(1*(2-1))=2点), miss判定0.99, special0.99
  const seq = [0.5, 0.0, 1.0, 0.99, 0.99];
  let i = 0;
  const r = DT.contest.playerScore(s, 'overall', () => seq[i++]);
  assert.strictEqual(r.misses, 1);
  assert.strictEqual(r.execDeduction, 2);
});

test('maxSpecialists: 学年ごとに1つずつ増え3で頭打ち', () => {
  assert.strictEqual(DT.contest.maxSpecialists(5), 1);   // 1年
  assert.strictEqual(DT.contest.maxSpecialists(17), 2);  // 2年
  assert.strictEqual(DT.contest.maxSpecialists(29), 3);  // 3年
  assert.strictEqual(DT.contest.maxSpecialists(48), 3);  // 4年（cap）
});

test('runAll: 総合+スペシャ1部門で結果2件・疲労が演技間に加算される', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['v1d'], () => 0.5); // 1年OIDC 相手平均25
  assert.strictEqual(rs.length, 2);
  assert.strictEqual(rs[0].division, 'overall');
  assert.strictEqual(rs[0].rank, 1);
  assert.strictEqual(rs[0].points, 40);
  assert.strictEqual(rs[1].division, 'v1d');
  assert.strictEqual(rs[1].divisionLabel, '1ディアボロ垂直軸部門');
  assert.strictEqual(rs[1].rank, 1);
  assert.strictEqual(rs[1].points, 20); // スペシャリストは半分
  assert.strictEqual(s.fatigue, 6);     // 2演技目の前に+6
  assert.strictEqual(s.results.length, 2);
});

test('runAll: AJDCのポイントは総合100/スペシャ50', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[7], ['d2'], () => 0.5); // 4年AJDC 相手平均56
  assert.strictEqual(rs[0].points, 100);
  assert.strictEqual(rs[1].points, 50);
});

test('contestForTurn: OIDC/AJDCの月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'oidc');
  assert.strictEqual(DT.contest.contestForTurn(48).type, 'ajdc');
  assert.strictEqual(DT.contest.contestForTurn(11), null); // 旧全国大会の月は今は大会なし
});

summary();
```

- [ ] **Step 2: 失敗確認**

Run: `node tests/test-contest.js` → FAIL

- [ ] **Step 3: contest.jsを改訂**

```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function divisionOf(divisionId) {
    return DT.DATA.DIVISIONS.find(d => d.id === divisionId);
  }

  function breakdown(state, divisionId) {
    const sc = DT.DATA.SCORING[divisionOf(divisionId).scoring];
    const parts = {};
    Object.keys(sc.weights).forEach(id => {
      parts[id] = Math.round(state.stats[id] * sc.weights[id]) / 100;
    });
    if (sc.base) {
      const elements = Math.min(sc.base.elements, Math.floor(state.stats[sc.base.stat] / 25));
      parts[sc.base.stat] = elements * sc.base.perElement;
    }
    return parts;
  }

  function missRate(state) {
    return clamp(Math.round(25 + state.fatigue * 0.3 - state.stats.control * 0.3), 2, 60);
  }

  function playerScore(state, divisionId, rng) {
    rng = rng || Math.random;
    const parts = breakdown(state, divisionId);
    let total = Object.values(parts).reduce((a, v) => a + v, 0);
    // 調子＋審査員ぶれ（内訳表示できるよう0.1点精度で保持）
    const judgeMod = Math.round(((state.motivation - 3) * 2 + (rng() * 6 - 3)) * 10) / 10;
    total += judgeMod;

    const rolls = state.stats.difficulty >= 60 ? 3 : 2;
    const rate = missRate(state);
    let misses = 0;
    let execDeduction = 0;
    for (let i = 0; i < rolls; i++) {
      if (rng() * 100 < rate) {
        misses += 1;
        execDeduction += 1 + Math.round(rng() * (DT.DATA.SCORING.execDeductionMax - 1));
      }
    }
    const specialDeduction = rng() * 100 < 5 ? DT.DATA.SCORING.specialDeduction : 0;

    total -= execDeduction + specialDeduction;
    return { score: Math.round(total * 10) / 10, parts, judgeMod, misses, execDeduction, specialDeduction };
  }

  const LEVELS = {
    oidc: { base: 25, growth: 5, sd: 10, entrants: 16,
            points: { overall: [40, 25, 15, 8, 2], specialist: [20, 13, 8, 4, 1] } },
    ajdc: { base: 35, growth: 7, sd: 12, entrants: 16,
            points: { overall: [100, 70, 50, 20, 5], specialist: [50, 35, 25, 10, 3] } }
  };

  function maxSpecialists(turn) {
    const specialistCount = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').length;
    return Math.min(specialistCount, Math.ceil(turn / 12));
  }

  function runDivision(state, contest, divisionId, rng) {
    const lv = LEVELS[contest.type];
    const year = Math.ceil(contest.turn / 12);
    const mean = lv.base + lv.growth * (year - 1);
    const opponents = [];
    for (let i = 0; i < lv.entrants - 1; i++) {
      const g = (rng() + rng() + rng()) / 3;
      opponents.push(mean + (g - 0.5) * 2 * lv.sd * 1.8);
    }
    const p = playerScore(state, divisionId, rng);
    const rank = 1 + opponents.filter(o => o > p.score).length;
    const half = Math.ceil(lv.entrants / 2);
    const div = divisionOf(divisionId);
    const table = lv.points[div.scoring];
    const points = rank === 1 ? table[0]
      : rank === 2 ? table[1]
      : rank === 3 ? table[2]
      : rank <= half ? table[3]
      : table[4];
    return {
      name: contest.name, type: contest.type,
      division: divisionId, divisionLabel: div.label,
      rank, entrants: lv.entrants, score: p.score,
      parts: p.parts, judgeMod: p.judgeMod, misses: p.misses,
      execDeduction: p.execDeduction, specialDeduction: p.specialDeduction,
      points
    };
  }

  function runAll(state, contest, specialistIds, rng) {
    rng = rng || Math.random;
    const order = ['overall'].concat(specialistIds || []);
    const results = [];
    order.forEach((id, i) => {
      if (i > 0) state.fatigue = clamp(state.fatigue + DT.DATA.SCORING.entryFatigue, 0, 100);
      const r = runDivision(state, contest, id, rng);
      state.results.push(r);
      results.push(r);
    });
    return results;
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { breakdown, missRate, playerScore, maxSpecialists, runAll, contestForTurn, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: ending.jsのS条件を更新＋test-ending.js追随**

ending.js:
```js
    const ajdcOverallWin = state.results.some(r => r.type === 'ajdc' && r.division === 'overall' && r.rank === 1);
    let rank;
    if (ajdcOverallWin || points >= 250) rank = 'S';
```
（返り値のフィールド名も `nationalWin` → `ajdcOverallWin` に変更）

test-ending.jsの`withResults`を新形式に:
```js
function withResults(pointsList, ajdcWin) {
  const s = DT.state.newCharacter(() => 0.5);
  s.status = 'graduated';
  s.results = pointsList.map((p, i) => ({
    name: 'test' + i,
    type: (ajdcWin && i === 0) ? 'ajdc' : 'oidc',
    division: 'overall',
    divisionLabel: '個人総合部門',
    rank: (ajdcWin && i === 0) ? 1 : 5,
    entrants: 16, score: 50, misses: 0, points: p
  }));
  return s;
}
```
「全国優勝があればS」テストのアサーションを `e.ajdcOverallWin === true` に変更。他のテストは閾値不変。

- [ ] **Step 5: テスト確認**

Run: `node tests/test-contest.js && node tests/test-ending.js`
Expected: 両方緑

検算メモ: specialist all-50 → 22.5+7.5+15+5=50。judgeModテスト: motivation5 → (5-3)*2+0=4。減点幅 rng=1.0 → 1+round(1*(2-1))=2点。

- [ ] **Step 6: コミット**

```bash
git add js/contest.js js/ending.js tests/test-contest.js tests/test-ending.js
git commit -m "feat: 部門別採点・複数エントリー実行・AJDC総合優勝のS判定"
```

---

### Task 3: シミュレーション更新（掛け持ちポリシー＋結果件数検証）

**Files:**
- Modify: `tests/test-simulation.js`

**Interfaces:**
- Consumes: `DT.contest.runAll` / `maxSpecialists`。旧`run`呼び出しを置き換える

- [ ] **Step 1: playThroughを更新**

```js
function specialistPick(turn) {
  const ids = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').map(d => d.id);
  return ids.slice(0, DT.contest.maxSpecialists(turn));
}

function playThrough(rng, choose) {
  const state = DT.state.newCharacter(rng);
  let guard = 0;
  while (state.status === 'playing' && guard < 100) {
    guard += 1;
    DT.engine.applyAction(state, choose(state), rng);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) DT.contest.runAll(state, contest, specialistPick(state.turn), rng);
    DT.engine.endTurn(state, rng);
  }
  return state;
}
```

- [ ] **Step 2: アサーション更新**

「20回全部卒業できる」テスト内の `assert.strictEqual(s.results.length, 8, ...)` を:
```js
    // 8大会 × (総合1+スペシャ枠) = 1年2+2 + 2年3+3 + 3年4+4 + 4年4+4 = 26エントリー
    assert.strictEqual(s.results.length, 26, 'seed=' + seed + ' エントリー数');
```
に変更。最後に卒業評価の分布を出力する（アサーションではなく情報表示）:
```js
test('参考: 20シードの卒業ランク分布を表示', () => {
  const dist = {};
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    const r = DT.ending.evaluate(s).rank;
    dist[r] = (dist[r] || 0) + 1;
  }
  console.log('  ランク分布: ' + JSON.stringify(dist));
  assert.ok(true);
});
```

- [ ] **Step 3: 全テスト実行**

Run: `for f in tests/test-*.js; do echo "== $f"; node "$f" || break; done`
Expected: 6ファイル緑。**ランク分布を必ずレポートに記載する**（スペシャリスト分でポイントが増えるため、S が20中6以上になっていたら DONE_WITH_CONCERNS で報告。閾値調整はコントローラーが判断する — 勝手に ending.js を変えない）

- [ ] **Step 4: コミット**

```bash
git add tests/test-simulation.js
git commit -m "test: 複数エントリーをシミュレーションに反映、ランク分布を出力"
```

---

### Task 4: UI — エントリー選択画面と部門別結果表示

**Files:**
- Modify: `index.html`（screen-entryセクション追加）
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `DT.contest.runAll` / `maxSpecialists` / 結果配列

- [ ] **Step 1: index.htmlにエントリー画面を追加**

`#screen-main` の直後に:
```html
  <section id="screen-entry" class="screen hidden">
    <h2 id="entry-title"></h2>
    <p class="subtitle" id="entry-hint"></p>
    <div id="entry-divisions" class="card"></div>
    <button id="btn-entry-go" class="primary">この内容でエントリー</button>
  </section>
```

- [ ] **Step 2: app.jsの大会フローを差し替え**

`onAction`/`afterTurn`/`renderContest` 一帯を以下に置き換え（`pendingLogs`はそのまま使う。新たにモジュール内変数 `pendingMessages = []`, `entrySelection = []`, `pendingContest = null` を宣言に追加）:

```js
  // --- ターン実行 ---
  function onAction(actionId) {
    const result = DT.engine.applyAction(state, actionId);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      pendingMessages = result.messages;
      pendingContest = contest;
      renderEntry(contest);
      return;
    }
    finishTurn(result.messages, null);
  }

  function finishTurn(messages, contestResults) {
    const end = DT.engine.endTurn(state);
    const logs = messages.concat(end.events);
    DT.state.save(state);
    if (contestResults) {
      pendingLogs = logs;
      renderContestResults(contestResults);
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

  // --- エントリー選択 ---
  function renderEntry(contest) {
    const max = DT.contest.maxSpecialists(state.turn);
    entrySelection = [];
    $('#entry-title').textContent = contest.name + ' エントリー';
    $('#entry-hint').textContent = '個人総合部門は必ず出場。スペシャリストはあと' + max + '部門まで掛け持ちできます（1演技ごとに疲労+' + DT.DATA.SCORING.entryFatigue + '）';
    const rows = [];
    const fixed = el('button', '', '個人総合部門（必須）');
    fixed.disabled = true;
    rows.push(fixed);
    DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').forEach(d => {
      const b = el('button', '', d.label);
      b.onclick = () => {
        const idx = entrySelection.indexOf(d.id);
        if (idx >= 0) {
          entrySelection.splice(idx, 1);
          b.classList.remove('primary');
        } else if (entrySelection.length < max) {
          entrySelection.push(d.id);
          b.classList.add('primary');
        }
      };
      rows.push(b);
    });
    $('#entry-divisions').replaceChildren(...rows);
    show('#screen-entry');
  }

  $('#btn-entry-go').onclick = () => {
    const results = DT.contest.runAll(state, pendingContest, entrySelection);
    finishTurn(pendingMessages, results);
  };

  // --- 大会結果 ---
  function renderContestResults(results) {
    $('#contest-name').textContent = results[0].name + ' 結果';
    const nodes = [];
    results.forEach((r, i) => {
      nodes.push(el('div', 'result-big', r.divisionLabel + ' ' + r.rank + '位 / ' + r.entrants + '人'));
      if (i === 0) {
        DT.DATA.STATS.forEach(s => {
          if (r.parts[s.id] !== undefined) nodes.push(textRow(s.label + '点', String(r.parts[s.id])));
        });
        nodes.push(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
        nodes.push(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
        nodes.push(textRow('特別減点', '-' + r.specialDeduction + '点'));
      }
      nodes.push(textRow('スコア', r.score + '点'));
      nodes.push(textRow('獲得ポイント', r.points + 'pt'));
    });
    $('#contest-result').replaceChildren(...nodes);
    show('#screen-contest');
  }

  $('#btn-contest-ok').onclick = () => afterTurn(pendingLogs);
```

- [ ] **Step 3: ミス率表示と成績表の部門表示を更新**

renderMain内: `textRow('ミス率', DT.contest.missRate(state) + '%')` → `textRow('ミス率（1判定あたり）', DT.contest.missRate(state) + '%')`

resultsTable内の1列目を大会名＋部門に:
```js
      tr.appendChild(el('td', '', r.name + ' ' + r.divisionLabel));
```

- [ ] **Step 4: 検証**

`node --check js/app.js` ＋ 全テスト再実行。
ブラウザ確認（コントローラー実施）: 大会月にエントリー画面→部門トグル（枠上限）→部門別結果（総合のみ内訳・調子審査行つき）→内訳合計がスコアと一致。

- [ ] **Step 5: コミット**

```bash
git add index.html js/app.js
git commit -m "feat: エントリー選択画面と部門別大会結果を実装"
```

---

## 完了条件

- 全テスト緑、シミュレーションのランク分布が報告されている
- ブラウザで: 1年目は総合+1部門、学年が上がると枠が増える。総合結果の内訳（項目点＋調子・審査−減点）がスコアと一致
- 旧セーブ(v1/v2)は自動掃除、v3で新規開始

## 対象外

- チャレンジクラス（足回り・縄跳び等の計測系）— 将来増分
- 卒業ランク閾値の調整 — シミュレーション分布を見てコントローラー判断
