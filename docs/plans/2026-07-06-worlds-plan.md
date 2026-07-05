# 世界大会（WC）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 毎年11月開催の世界大会を実装する。直近1年のOIDC/AJDCでいずれかの部門優勝があれば出場権。任意出場・個人総合のみ・超高レベル。優勝で「世界チャンピオン」称号（S確定）。

**Architecture:** 世界大会は`CONTESTS`とは別スケジュール（`WORLDS_TURNS`）。実行は既存の`runAll(state, worldsContest, [])`をそのまま再利用（総合のみ・ライバル注入・ポイント計算が全部乗る）。王者・魁人は世界大会にも出場（`RIVALS.contests`に'worlds'追加）。出場権判定のため大会結果に`turn`フィールドを追加。

## Global Constraints

- 既存規約維持（IIFE/rng注入/innerHTML禁止/データ駆動）
- 世界大会ターン: 8, 20, 32, 44（11月）。CONTESTS(5,12,17,24,29,36,41,48)と衝突しない
- 出場権: `state.results`に「rank===1 かつ type∈{oidc,ajdc} かつ worldsTurn-12 < turn < worldsTurn」の結果が1件でもあること
- レベル: LEVELS.worlds = base 58 / growth 5 / sd 8 / entrants 16 / points.overall [150,100,70,30,10]（y1平均58〜y4平均73。魁人の曲線66〜73.5と整合する世界の壁）
- 魁人は世界大会にも出場（contests: ['ajdc','worlds']）。志音は出ない
- 出場は任意: 対象月に権利があればUIで出場/見送りを選ぶ。見送れば通常の月（イベントも発生しうる）
- 世界大会優勝: ending.evaluateで rank='S'・title='世界チャンピオン'（ajdcOverallWin/ポイント判定より優先）
- 出場した月はイベント発生なし（大会月と同じ扱い）
- セーブキーは**v4のまま**（resultsへのturn追加とRIVALS変更は後方破壊なし。開発中セーブの互換は不問）

---

### Task 1: ロジック — 世界大会の判定・実行・称号

**Files:**
- Modify: `js/data.js`（WORLDS_TURNS追加、kaitoのcontestsに'worlds'）
- Modify: `js/contest.js`（result.turn追加、LEVELS.worlds、worldsContestForTurn、worldsQualified）
- Modify: `js/ending.js`（世界チャンピオン判定）
- Modify: `tests/test-data.js` / `tests/test-contest.js` / `tests/test-ending.js`

**Interfaces:**
- Produces: `DT.DATA.WORLDS_TURNS = [8, 20, 32, 44]`
- Produces: 全大会結果オブジェクトに `turn: contest.turn`
- Produces: `DT.contest.worldsContestForTurn(turn)` → `{ turn, type:'worlds', name:'N年 世界大会' } | null`
- Produces: `DT.contest.worldsQualified(state, worldsTurn)` → boolean
- Produces: `DT.ending.evaluate` が世界大会優勝時 `{ rank:'S', title:'世界チャンピオン', worldsWin:true, ... }`

- [ ] **Step 1: テスト追記**

test-data.js（summary()前）:
```js
test('DATA: 世界大会は毎年11月・魁人も出場', () => {
  assert.deepStrictEqual(DT.DATA.WORLDS_TURNS, [8, 20, 32, 44]);
  DT.DATA.WORLDS_TURNS.forEach(t => {
    assert.ok(!DT.DATA.CONTESTS.some(c => c.turn === t), 'CONTESTS衝突: ' + t);
  });
  const kaito = DT.DATA.RIVALS.find(r => r.id === 'kaito');
  assert.deepStrictEqual(kaito.contests, ['ajdc', 'worlds']);
});
```

test-contest.js（summary()前）:
```js
test('worldsContestForTurn: 11月だけ返す', () => {
  assert.strictEqual(DT.contest.worldsContestForTurn(8).type, 'worlds');
  assert.strictEqual(DT.contest.worldsContestForTurn(8).name, '1年 世界大会');
  assert.strictEqual(DT.contest.worldsContestForTurn(44).name, '4年 世界大会');
  assert.strictEqual(DT.contest.worldsContestForTurn(5), null);
});

test('worldsQualified: 直近1年のOIDC/AJDC優勝で出場権', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.worldsQualified(s, 8), false);
  s.results.push({ name: '1年 OIDC', type: 'oidc', division: 'v1d', rank: 1, points: 20, turn: 5 });
  assert.strictEqual(DT.contest.worldsQualified(s, 8), true);   // スペシャ部門優勝でもOK
  assert.strictEqual(DT.contest.worldsQualified(s, 20), false); // 翌年には失効（20-12=8 < 5は範囲外）
  s.results.push({ name: '1年 AJDC', type: 'ajdc', division: 'overall', rank: 2, points: 70, turn: 12 });
  assert.strictEqual(DT.contest.worldsQualified(s, 20), false); // 2位では権利なし
  s.results.push({ name: '2年 OIDC', type: 'oidc', division: 'overall', rank: 1, points: 40, turn: 17 });
  assert.strictEqual(DT.contest.worldsQualified(s, 20), true);
});

test('runAll: 世界大会は総合のみ・魁人が出る・超高レベル', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  const wc = DT.contest.worldsContestForTurn(44); // 4年: 相手平均 58+15=73
  const rs = DT.contest.runAll(s, wc, [], () => 0.5);
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(rs[0].rank, 1); // 全能力100(=100点)なら魁人73.5にも勝つ
  assert.strictEqual(rs[0].points, 150);
  assert.strictEqual(rs[0].turn, 44);
  assert.strictEqual(rs[0].rivalOutcomes.length, 1);
  assert.strictEqual(rs[0].rivalOutcomes[0].id, 'kaito');
});

test('結果オブジェクトにturnが入る（既存大会）', () => {
  const s = allFifty();
  DT.contest.runAll(s, DT.DATA.CONTESTS[0], [], () => 0.5);
  assert.strictEqual(s.results[0].turn, 5);
});
```

test-ending.js（summary()前）:
```js
test('evaluate: 世界大会優勝で世界チャンピオン（S）', () => {
  const s = DT.state.newCharacter(() => 0.5);
  s.status = 'graduated';
  s.results = [{ name: '4年 世界大会', type: 'worlds', division: 'overall', divisionLabel: '個人総合部門',
                 rank: 1, entrants: 16, score: 80, misses: 0, points: 150, turn: 44 }];
  const e = DT.ending.evaluate(s);
  assert.strictEqual(e.rank, 'S');
  assert.strictEqual(e.title, '世界チャンピオン');
  assert.strictEqual(e.worldsWin, true);
});
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: 実装**

data.js: `WORLDS_TURNS: [8, 20, 32, 44],` を追加、kaito を `contests: ['ajdc', 'worlds']` に変更。

contest.js:
- LEVELSに追加:
```js
    worlds: { base: 58, growth: 5, sd: 8, entrants: 16,
              points: { overall: [150, 100, 70, 30, 10], specialist: [75, 50, 35, 15, 5] } }
```
（specialist表は使われないが構造の一貫性のため置く）
- runDivisionの結果オブジェクトに `turn: contest.turn,` を追加
- 追加:
```js
  function worldsContestForTurn(turn) {
    if (!DT.DATA.WORLDS_TURNS.includes(turn)) return null;
    const year = Math.ceil(turn / 12);
    return { turn, type: 'worlds', name: year + '年 世界大会' };
  }

  function worldsQualified(state, worldsTurn) {
    return state.results.some(r =>
      r.rank === 1 && (r.type === 'oidc' || r.type === 'ajdc') &&
      r.turn > worldsTurn - 12 && r.turn < worldsTurn
    );
  }
```
- exportsに `worldsContestForTurn, worldsQualified` を追加

ending.js: evaluate内、ajdcOverallWin計算の直前に:
```js
    const worldsWin = state.results.some(r => r.type === 'worlds' && r.rank === 1);
```
rank決定の後に上書き:
```js
    if (worldsWin) rank = 'S';
    const titles = { ... 既存 ... };
    const title = worldsWin ? '世界チャンピオン' : titles[rank];
```
返り値に `worldsWin` を追加し、`title` は上記変数を使う。

- [ ] **Step 4: 全テスト緑を確認**（既存の分布テスト等は世界大会に触れないので不変のはず）

- [ ] **Step 5: コミット** `feat: 世界大会（出場権判定・実行・世界チャンピオン称号）`

---

### Task 2: シミュレーション統合

**Files:**
- Modify: `tests/test-simulation.js`

- [ ] **Step 1: playThroughに世界大会を追加**

大会分岐とイベント分岐の間に（イベントより先）:
```js
    const wc = DT.contest.worldsContestForTurn(state.turn);
    if (!contest && wc && DT.contest.worldsQualified(state, state.turn)) {
      DT.contest.runAll(state, wc, [], rng);
    } else if (!contest && action !== 'injured') {
      // 既存のイベントroll
    }
```
（構造は既存コードに合わせて整理してよいが、「大会月＞世界大会＞イベント」の優先と「世界大会出場月はイベントなし」を守ること）

- [ ] **Step 2: アサーション調整＋追加**

- 「26エントリー」アサーションを通常大会のみに: `s.results.filter(r => r.type !== 'worlds').length === 26`
- 既存の「ライバル戦績」テスト: 魁人は世界大会にも出るため、seed 3の魁人戦数は `4 + 世界大会出場回数` になる。次のように修正（緩めるのではなく正確に）:
```js
  const worldsCount = s.results.filter(r => r.type === 'worlds').length;
  assert.strictEqual(kaito.win + kaito.lose, 4 + worldsCount);
```
（志音の8戦は不変）
- 追加:
```js
test('世界大会は出場権があるときだけ結果に現れる', () => {
  let worldsAppearances = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    const wins = (t) => s.results.some(r => r.rank === 1 && (r.type === 'oidc' || r.type === 'ajdc') && r.turn > t - 12 && r.turn < t);
    s.results.filter(r => r.type === 'worlds').forEach(r => {
      assert.ok(wins(r.turn), 'seed=' + seed + ' 無資格出場 turn=' + r.turn);
      worldsAppearances += 1;
    });
  }
  console.log('  世界大会出場回数(20シード計): ' + worldsAppearances);
  assert.ok(worldsAppearances >= 1, '20シードで一度も世界大会に出られていない');
});
```

- [ ] **Step 3: 全テスト実行**

ランク分布と世界大会出場回数をレポートに記録。S >= 5/20 なら DONE_WITH_CONCERNS（コントローラー判断）。

- [ ] **Step 4: コミット** `test: 世界大会をシミュレーションに統合`

---

### Task 3: UI — 出場選択と表示

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: onActionに世界大会分岐**

大会分岐の後・イベント分岐の前に:
```js
    const wc = DT.contest.worldsContestForTurn(state.turn);
    if (wc && DT.contest.worldsQualified(state, state.turn)) {
      pendingMessages = result.messages;
      pendingContest = wc;
      renderWorldsEntry(wc);
      return;
    }
```

- [ ] **Step 2: renderWorldsEntry（screen-entry再利用）**

```js
  function renderWorldsEntry(wc) {
    $('#entry-title').textContent = wc.name + ' 出場権獲得！';
    $('#entry-hint').textContent = '直近1年の優勝実績により出場できます。相手は世界トップレベル（王者・魁人も出場）。';
    const enter = el('button', 'primary', '出場する');
    enter.onclick = () => {
      const results = DT.contest.runAll(state, pendingContest, []);
      finishTurn(pendingMessages, results);
    };
    const skip = el('button', '', '見送る');
    skip.onclick = () => finishTurn(pendingMessages, null);
    $('#entry-divisions').replaceChildren(enter, skip);
    show('#screen-entry');
  }
```
注意: `#btn-entry-go` は通常大会用の固定ボタン。世界大会では使わないので**非表示にする**（renderWorldsEntry内で `$('#btn-entry-go').classList.add('hidden');`、通常の `renderEntry` 冒頭で `classList.remove('hidden')` を追加して復帰させること）。

- [ ] **Step 3: メイン画面ヘッダーに出場権表示（任意の小改善）**

renderMainのnextContest行のあとに、次の世界大会ターンで出場権があるなら `｜世界大会出場権あり` を付加:
```js
    const nextWorlds = DT.DATA.WORLDS_TURNS.find(t => t >= state.turn);
    const worldsNote = (nextWorlds && DT.contest.worldsQualified(state, nextWorlds)) ? '｜世界大会出場権あり！' : '';
```
ヘッダー文字列の末尾に `+ worldsNote`。

- [ ] **Step 4: 検証** `node --check js/app.js`＋全スイート。ブラウザ確認はコントローラー（優勝実績のあるセーブを作って11月に出場/見送り両方、結果画面、エンディング称号）

- [ ] **Step 5: コミット** `feat: 世界大会の出場選択UIと出場権表示`

---

## 完了条件

- 全テスト緑。シミュレーションで無資格出場ゼロ・出場権発生が確認される
- ブラウザ: 優勝→11月に出場権画面→出場で結果（魁人と対戦）／見送りで通常進行。世界大会優勝でエンディング「世界チャンピオン」

## 対象外

- 志音の世界大会出場（志音が優勝した年に出る等の連動）— v3以降の候補
- タイミング補正（CM）・練習2軸化（V3）— 後続タスク
