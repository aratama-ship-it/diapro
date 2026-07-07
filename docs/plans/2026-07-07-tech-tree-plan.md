# 技術解禁ツリー（TR）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ジャンルを習熟度で段階的に解禁する「技術ツリー」を導入し、大学スタートを技術0からのハードモードにする。

**Architecture:** 解禁状態はスキルから都度計算（スキルは単調増加のため状態不要）。判定関数 `isGenreUnlocked` を contest.js に置き、data.js の `SKILL_TREE` を参照する。解禁の告知だけ `state.announcedUnlocks` で重複防止する。UI（スロット選択・大会エントリー・コンディション欄）は解禁済みジャンルのみ提示する。

**Tech Stack:** Vanilla HTML/CSS/JS（ビルド不要）、Node組み込みの自作テストハーネス（tests/harness.js）。

## Global Constraints

- 既存パターン踏襲: 各jsは IIFE で `DT.<module>` に生やす。DOM生成は `el()` ヘルパー（innerHTML不使用）。
- 解禁指標は `genreAvg`（ジャンル3マス平均）、閾値は **厳密に > 20**（20ちょうどは未解禁）。
- ツリー: `h1d`(根/常時解禁) → `v1d`・`d2`（h1d習熟>20）、`d2`習熟>20 → `d3`。
- 大学(college): 技術12マス=0、演技構成は小さめレンジ（compMin:3, compSpread:8 = 3〜10）。他経歴は初期値不変。
- 解禁告知は練習直後。開始時から解禁済みのジャンルは告知しない。
- セーブキー v8→v9（`OLD_KEYS` に v8 追加）。
- テストは各ファイル `node tests/test-*.js` で実行、`N passed, 0 failed` を確認。
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

### Task 1: SKILL_TREE データ＋解禁判定関数（contest.js）

**Files:**
- Modify: `js/data.js`（`SKILL_TREE` 追加）
- Modify: `js/contest.js`（`isGenreUnlocked` / `newlyUnlockedGenres` / `nextUnlockTarget` 追加・export）
- Test: `tests/test-contest.js`

**Interfaces:**
- Produces:
  - `DT.DATA.SKILL_TREE`: `{ [genreId]: { requires: null | { genre: string, threshold: number } } }`
  - `DT.contest.isGenreUnlocked(state, genreId) -> boolean`
  - `DT.contest.newlyUnlockedGenres(state) -> string[]`（今解禁済みで `state.announcedUnlocks` に無いジャンルid）
  - `DT.contest.nextUnlockTarget(state) -> null | { id, reqGenre, remaining }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-contest.js` の `summary();` 直前に追記:

```javascript
test('isGenreUnlocked: h1dは常時解禁、v1d/d2はh1d習熟>20、d3はd2習熟>20', () => {
  const mk = (avgs) => {
    const skills = {};
    DT.DATA.GENRES.forEach(g => {
      skills[g.id] = { difficulty: avgs[g.id], novelty: avgs[g.id], control: avgs[g.id] };
    });
    return { skills, announcedUnlocks: [] };
  };
  const zero = mk({ h1d: 0, v1d: 0, d2: 0, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'h1d'), true);  // 根は常時
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'v1d'), false);
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'd2'), false);
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'd3'), false);

  const boundary = mk({ h1d: 20, v1d: 0, d2: 0, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(boundary, 'v1d'), false); // 20ちょうどは未解禁
  const over = mk({ h1d: 21, v1d: 0, d2: 0, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(over, 'v1d'), true);
  assert.strictEqual(DT.contest.isGenreUnlocked(over, 'd2'), true);
  assert.strictEqual(DT.contest.isGenreUnlocked(over, 'd3'), false); // d2習熟はまだ0

  const d3ready = mk({ h1d: 21, v1d: 0, d2: 25, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(d3ready, 'd3'), true);
});

test('newlyUnlockedGenres: 解禁済みかつ未告知のジャンルidのみ返す', () => {
  const skills = {};
  DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: 25, novelty: 25, control: 25 }; });
  // h1d解禁済み・告知済み、v1d/d2は解禁済みだが未告知、d3はd2習熟25>20で解禁済み未告知
  const state = { skills, announcedUnlocks: ['h1d'] };
  assert.deepStrictEqual(DT.contest.newlyUnlockedGenres(state).sort(), ['d2', 'd3', 'v1d']);
});

test('nextUnlockTarget: 前提が解禁済みで一番近い未解禁ジャンルを返す', () => {
  const skills = {};
  DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: 10, novelty: 10, control: 10 }; });
  const state = { skills, announcedUnlocks: ['h1d'] };
  const t = DT.contest.nextUnlockTarget(state); // h1d習熟10 → v1d/d2が候補
  assert.ok(t && (t.id === 'v1d' || t.id === 'd2'));
  assert.strictEqual(t.reqGenre, 'h1d');
  assert.ok(t.remaining >= 1);
  // 全解禁済みならnull
  DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: 50, novelty: 50, control: 50 }; });
  assert.strictEqual(DT.contest.nextUnlockTarget({ skills, announcedUnlocks: [] }), null);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node tests/test-contest.js`
Expected: FAIL（`DT.contest.isGenreUnlocked is not a function` 等）

- [ ] **Step 3: SKILL_TREE を data.js に追加**

`js/data.js` の `DIVISIONS: [...]` 配列の直後（`],` の次の行）に追記:

```javascript
    // 技術解禁ツリー: ジャンルは基礎ジャンルの習熟(genreAvg)がthresholdを「超える」と解禁される。
    // requires=null は根（常時解禁）。h1d→{v1d,d2}→d3。閾値は厳密に > threshold。
    SKILL_TREE: {
      h1d: { requires: null },
      v1d: { requires: { genre: 'h1d', threshold: 20 } },
      d2:  { requires: { genre: 'h1d', threshold: 20 } },
      d3:  { requires: { genre: 'd2',  threshold: 20 } }
    },
```

- [ ] **Step 4: 判定関数を contest.js に追加**

`js/contest.js` の `maxEntries` 関数定義の直前に追記:

```javascript
  // 技術解禁ツリー: genreId が現在解禁されているか。requires=null（根）は常にtrue。
  // スキルは単調増加なので、都度genreAvgで判定すれば永続フラグ無しで常に正しい。
  function isGenreUnlocked(state, genreId) {
    const node = DT.DATA.SKILL_TREE[genreId];
    const req = node ? node.requires : null;
    if (!req) return true;
    return genreAvg(state, req.genre) > req.threshold;
  }

  // 今解禁済みで state.announcedUnlocks に未登録のジャンルid（解禁演出用）
  function newlyUnlockedGenres(state) {
    const announced = state.announcedUnlocks || [];
    return DT.DATA.GENRES.map(g => g.id)
      .filter(id => isGenreUnlocked(state, id) && announced.indexOf(id) < 0);
  }

  // UI「次の解禁」表示用: 前提ジャンルが解禁済みの未解禁ジャンルのうち、残り習熟が最小のもの。無ければnull。
  function nextUnlockTarget(state) {
    const targets = DT.DATA.GENRES.map(g => g.id)
      .filter(id => !isGenreUnlocked(state, id))
      .map(id => {
        const req = DT.DATA.SKILL_TREE[id].requires;
        return { id: id, reqGenre: req.genre,
                 remaining: Math.max(1, Math.ceil((req.threshold + 0.1) - genreAvg(state, req.genre))) };
      })
      .filter(t => isGenreUnlocked(state, t.reqGenre));
    if (targets.length === 0) return null;
    targets.sort((a, b) => a.remaining - b.remaining);
    return targets[0];
  }
```

`js/contest.js` の export 行（`DT.contest = { ... }`）に3関数を追加:

```javascript
  DT.contest = {
    genreAvg, derivedVariety, derivedBase, breakdown, missRate, playerScore,
    maxEntries, runAll, contestForTurn, worldsContestForTurn, worldsQualified,
    rivalScore, LEVELS, buildStandings,
    isGenreUnlocked, newlyUnlockedGenres, nextUnlockTarget
  };
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node tests/test-contest.js`
Expected: PASS（`N passed, 0 failed`）

- [ ] **Step 6: コミット**

```bash
git add js/data.js js/contest.js tests/test-contest.js
git commit -m "$(cat <<'EOF'
feat(TR): 技術解禁ツリーのデータと判定関数を追加

SKILL_TREE(h1d→{v1d,d2}→d3)とisGenreUnlocked/newlyUnlockedGenres/
nextUnlockTargetを追加。習熟20超で解禁。単体テスト付き。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 大学の技術0スタートと演技構成レンジ分離（data.js / state.js）

**Files:**
- Modify: `js/data.js`（BACKGROUNDS の college）
- Modify: `js/state.js`（`newCharacter` の演技構成生成分離）
- Test: `tests/test-state.js`

**Interfaces:**
- Consumes: `DT.DATA.BACKGROUNDS[].compMin?`, `compSpread?`
- Produces: `newCharacter` は college で技術12マス=0・composition=3〜10 を返す。他経歴は挙動不変。

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-state.js` の既存テスト「経歴で初期能力レンジが変わる」を次の内容に**置き換える**（`college` の期待値を 5→0、composition を専用レンジに）:

```javascript
test('newCharacter: 経歴で初期能力レンジが変わる（大学は技術0・演技構成は小レンジ）', () => {
  const hard = DT.state.newCharacter(() => 0, 'college');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(hard.skills[g.id][m.id], 0)));
  assert.strictEqual(hard.composition, 3); // compMin3 + floor(0*8)
  const hardMax = DT.state.newCharacter(() => 0.999, 'college');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(hardMax.skills[g.id][m.id], 0)));
  assert.strictEqual(hardMax.composition, 10); // 3 + floor(0.999*8)=3+7
  assert.strictEqual(hard.study, 40);
  assert.strictEqual(hard.background, 'college');

  const easyMax = DT.state.newCharacter(() => 0.999, 'childhood');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(easyMax.skills[g.id][m.id], 55)));
  assert.strictEqual(easyMax.composition, 55); // 他経歴はcompMin未指定→従来通りstatと同レンジ
  assert.strictEqual(easyMax.study, 60);

  const def = DT.state.newCharacter(() => 0);
  assert.strictEqual(def.background, 'highschool');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(def.skills[g.id][m.id], 10)));
  assert.strictEqual(def.composition, 10);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node tests/test-state.js`
Expected: FAIL（college技術が5で返り 0 と不一致）

- [ ] **Step 3: college背景を data.js で変更**

`js/data.js` の BACKGROUNDS の college 行を置換:

```javascript
      { id: 'college',    label: '大学から始めた', difficulty: 'ハード',         statMin: 0,  statSpread: 0, compMin: 3, compSpread: 8 },
```

- [ ] **Step 4: newCharacter の演技構成生成を分離**

`js/state.js` の composition 生成行:

```javascript
    const composition = bg.statMin + Math.floor(rng() * bg.statSpread);
```

を次に置換（compMin/compSpread 未指定なら従来どおり stat レンジを流用）:

```javascript
    // 演技構成は技術と別レンジを持てる（大学は技術0でも演技構成を少し残すため）。未指定なら技術と同レンジ。
    const compMin = (bg.compMin !== undefined) ? bg.compMin : bg.statMin;
    const compSpread = (bg.compSpread !== undefined) ? bg.compSpread : bg.statSpread;
    const composition = compMin + Math.floor(rng() * compSpread);
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node tests/test-state.js`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add js/data.js js/state.js tests/test-state.js
git commit -m "$(cat <<'EOF'
feat(TR): 大学を技術0スタートに・演技構成レンジを分離

college技術12マス=0、演技構成は3〜10で少し残す。他経歴は挙動不変。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: announcedUnlocks 初期化とセーブ v9（state.js）

**Files:**
- Modify: `js/state.js`（`newCharacter` に `announcedUnlocks`、`SAVE_KEY`/`OLD_KEYS`）
- Modify: `tests/test-state.js`（require に contest 追加、v9テスト更新、announcedUnlocks検証）

**Interfaces:**
- Consumes: `DT.contest.isGenreUnlocked`（Task 1）
- Produces: `state.announcedUnlocks: string[]`（生成時点で解禁済みのジャンルidで初期化）、`DT.state.SAVE_KEY === 'diabolo-trainer-save-v9'`

- [ ] **Step 1: test-state.js の require に contest を追加**

`tests/test-state.js` の require 群（`require('../js/state.js');` の行の直後）に追記:

```javascript
require('../js/contest.js');
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/test-state.js` の「SAVE_KEYはv8」テストを置換し、announcedUnlocks テストを追加:

```javascript
test('SAVE_KEYはv9・OLD_KEYSにv1〜v8を含む', () => {
  assert.strictEqual(DT.state.SAVE_KEY, 'diabolo-trainer-save-v9');
});

test('newCharacter: announcedUnlocksは開始時解禁済みジャンルで初期化される', () => {
  const hard = DT.state.newCharacter(() => 0, 'college'); // 技術0 → h1dのみ解禁
  assert.deepStrictEqual(hard.announcedUnlocks, ['h1d']);
  const easy = DT.state.newCharacter(() => 0.999, 'childhood'); // 全マス55 → 全解禁
  assert.deepStrictEqual(easy.announcedUnlocks.sort(), ['d2', 'd3', 'h1d', 'v1d']);
});
```

さらに「load: 旧バージョン(v1〜v7)のセーブキーを掃除する」テストに v8 の掃除も追加する。テスト本文の
`store.setItem('diabolo-trainer-save-v7', '{}');` の直後に:

```javascript
  store.setItem('diabolo-trainer-save-v8', '{}');
```

を追加し、末尾の検証群の `assert.strictEqual(store.getItem('diabolo-trainer-save-v7'), null);` の直後に:

```javascript
  assert.strictEqual(store.getItem('diabolo-trainer-save-v8'), null);
```

を追加する。

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `node tests/test-state.js`
Expected: FAIL（SAVE_KEY が v8 のまま／announcedUnlocks undefined）

- [ ] **Step 4: state.js を更新**

`js/state.js` の SAVE_KEY/OLD_KEYS を置換:

```javascript
  const SAVE_KEY = 'diabolo-trainer-save-v9';
  const OLD_KEYS = ['diabolo-trainer-save-v1', 'diabolo-trainer-save-v2', 'diabolo-trainer-save-v3', 'diabolo-trainer-save-v4', 'diabolo-trainer-save-v5', 'diabolo-trainer-save-v6', 'diabolo-trainer-save-v7', 'diabolo-trainer-save-v8'];
```

`js/state.js` の return オブジェクト末尾、`lastSlots: []` の後に `announcedUnlocks` を追加（`lastSlots: []` を `lastSlots: [],` にして次行追加）:

```javascript
      lastSlots: [],
      // 開始時に既に解禁済みのジャンルは告知しない（h1d常時＋経歴により解禁されるもの）
      announcedUnlocks: DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked({ skills: skills }, g.id)).map(g => g.id)
```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node tests/test-state.js`
Expected: PASS

- [ ] **Step 6: 全テスト回帰確認**

Run: `for f in tests/test-*.js; do node "$f" | tail -1; done`
Expected: 各ファイル `N passed, 0 failed`（このタスク時点で test-simulation は Task 8 前だが、newCharacter に announcedUnlocks が増えるだけで既存アサートは不変なので緑のはず。赤が出たら内容を記録し Task 8 で対応）

- [ ] **Step 7: コミット**

```bash
git add js/state.js tests/test-state.js
git commit -m "$(cat <<'EOF'
feat(TR): announcedUnlocks初期化とセーブをv9へ

生成時点の解禁済みジャンルでannouncedUnlocksを初期化（初期解禁は告知しない）。
SAVE_KEY v8→v9、旧v8を掃除対象に追加。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 練習直後の解禁演出（engine.js）

**Files:**
- Modify: `js/engine.js`（`applyTraining` 末尾で解禁検知・告知）
- Modify: `tests/test-engine.js`（require に contest 追加、解禁演出テスト）

**Interfaces:**
- Consumes: `DT.contest.newlyUnlockedGenres`（Task 1）、`state.announcedUnlocks`（Task 3）
- Produces: `applyTraining` の戻り `messages` に解禁告知を含め、`state.announcedUnlocks` を更新

- [ ] **Step 1: test-engine.js の require に contest を追加**

`tests/test-engine.js` の `require('../js/engine.js');` の直後に追記:

```javascript
require('../js/contest.js');
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/test-engine.js` の `summary();` 直前に追記:

```javascript
test('applyTraining: h1d習熟が20を超えた練習でv1d/d2の解禁が告知される（一度だけ）', () => {
  const s = DT.state.newCharacter(() => 0, 'college'); // 技術0・h1dのみ解禁・announced=['h1d']
  // h1dの3マスを直接20付近に持ち上げ、あと一押しで20超になる状態を作る
  s.skills.h1d = { difficulty: 20, novelty: 20, control: 19 }; // 平均19.7 → まだ未解禁
  const combo = { genre: 'h1d', method: 'control' };
  // rng0.3=成功でcontrolが+2 → 平均(20+20+21)/3=20.33 > 20 → v1d/d2解禁
  const r = DT.engine.applyTraining(s, [combo], () => 0.3);
  const joined = r.messages.join('\n');
  assert.ok(joined.includes('1ディアボロ垂直軸') && joined.includes('解禁'), 'v1d解禁の告知が出る');
  assert.ok(joined.includes('2ディアボロ') && joined.includes('解禁'), 'd2解禁の告知が出る');
  assert.ok(s.announcedUnlocks.indexOf('v1d') >= 0 && s.announcedUnlocks.indexOf('d2') >= 0);

  // 2回目の練習では再告知されない
  const r2 = DT.engine.applyTraining(s, [combo], () => 0.3);
  assert.ok(!r2.messages.join('\n').includes('解禁'), '解禁告知は一度だけ');
});
```

- [ ] **Step 3: テストを実行して失敗を確認**

Run: `node tests/test-engine.js`
Expected: FAIL（解禁告知メッセージが出ない）

- [ ] **Step 4: applyTraining に解禁検知を追加**

`js/engine.js` の `applyTraining` 内、`state.didTrain = true;` の**直前**に追記:

```javascript
    // 解禁演出（練習直後）: 今回の練習で新しく解禁されたジャンルを一度だけ告知する。
    // イベント等で先に解禁されていた分も、未告知ならここで拾われる（単調性で重複しない）。
    state.announcedUnlocks = state.announcedUnlocks || [];
    DT.contest.newlyUnlockedGenres(state).forEach(id => {
      state.announcedUnlocks.push(id);
      messages.push('🎉 ' + genreLabel(id) + 'が解禁された！新しいジャンルを練習できる。');
    });

```

- [ ] **Step 5: テストを実行して成功を確認**

Run: `node tests/test-engine.js`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add js/engine.js tests/test-engine.js
git commit -m "$(cat <<'EOF'
feat(TR): 練習直後にジャンル解禁を告知

applyTraining末尾でnewlyUnlockedGenresを検知し、messagesに解禁告知を追加。
announcedUnlocksで重複告知を防止。単体テスト付き。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: スロット選択の未解禁ロック＋コンディション欄の次目標（app.js）

**Files:**
- Modify: `js/app.js`（`renderActions` のジャンル行、`renderMain` のコンディション欄）

**Interfaces:**
- Consumes: `DT.contest.isGenreUnlocked`、`DT.contest.nextUnlockTarget`、`DT.DATA.SKILL_TREE`
- Produces: なし（UI）

このタスクは既存DOMテストが無いため、preview で目視検証する。

- [ ] **Step 1: ジャンル選択ボタンの未解禁ロックを実装**

`js/app.js` の `renderActions` 内、ジャンル選択行（`const genreRow = el('div', 'genre-row');` から `nodes.push(genreRow);` まで）を次に置換:

```javascript
    // (b) ジャンル選択行（未解禁ジャンルはロック表示・選択不可）
    const genreRow = el('div', 'genre-row');
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const b = el('button', g.id === selectedGenre ? 'primary' : '', unlocked ? g.label : '🔒 ' + g.label);
      if (!unlocked) {
        const req = DT.DATA.SKILL_TREE[g.id].requires;
        b.disabled = true;
        b.title = genreLabel(req.genre) + 'の習熟' + req.threshold + '超で解禁';
      } else {
        b.onclick = () => {
          selectedGenre = (selectedGenre === g.id) ? null : g.id;
          renderActions();
        };
      }
      genreRow.appendChild(b);
    });
    nodes.push(genreRow);
```

- [ ] **Step 2: コンディション欄に「次の解禁」を追加**

`js/app.js` の `renderMain` 内、`$('#main-cond').replaceChildren(...condNodes);` の**直前**に追記:

```javascript
    const nextUnlock = DT.contest.nextUnlockTarget(state);
    if (nextUnlock) {
      condNodes.push(textRow('次の解禁',
        genreLabel(nextUnlock.id) + '（' + genreLabel(nextUnlock.reqGenre) + 'の習熟あと' + nextUnlock.remaining + '）'));
    }
```

- [ ] **Step 3: preview で検証（大学スタート）**

```
preview_start(name: "diabolo-trainer")
```
その後 preview_eval で大学キャラを作ってメイン画面へ:

```javascript
// 新規→大学経歴→開始 を最短で再現
(function () {
  var s = DT.state.newCharacter(function(){return 0;}, 'college');
  window.__testState = s;
  return { comp: s.composition, h1d: s.skills.h1d, unlockedV1d: DT.contest.isGenreUnlocked(s, 'v1d') };
})();
```
Expected: `h1d` 全0、`unlockedV1d: false`。
実UIでは preview_snapshot でジャンル行を確認し、`🔒 1ディアボロ垂直軸` 等が disabled、コンディション欄に「次の解禁」行が出ることを確認する。必要なら preview_click でタイトル→はじめから→大学→開始と操作して snapshot。

- [ ] **Step 4: 回帰テスト（UIロジック以外が壊れていないこと）**

Run: `for f in tests/test-*.js; do node "$f" | tail -1; done`
Expected: 各 `N passed, 0 failed`（Task 8 前の test-simulation を除き緑。赤なら記録）

- [ ] **Step 5: コミット**

```bash
git add js/app.js
git commit -m "$(cat <<'EOF'
feat(TR): 練習スロットで未解禁ジャンルをロック表示・次の解禁を表示

未解禁ジャンルボタンは🔒付きdisabled＋解禁条件をtitle表示。
コンディション欄に「次の解禁（あとN）」を追加。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 大会エントリーで未解禁部門を除外（app.js）

**Files:**
- Modify: `js/app.js`（`renderEntry` の DIVISIONS ループ）

**Interfaces:**
- Consumes: `DT.contest.isGenreUnlocked`
- Produces: なし（UI）

- [ ] **Step 1: エントリー候補から未解禁スペシャリスト部門を除外**

`js/app.js` の `renderEntry` 内、`DT.DATA.DIVISIONS.forEach(d => {` の直後（`const label = ...` の前）に追記:

```javascript
      // スペシャリスト部門は該当ジャンルが未解禁なら出場不可（総合は常に出場可）
      if (d.scoring === 'specialist' && !DT.contest.isGenreUnlocked(state, d.id)) return;
```

- [ ] **Step 2: preview で検証**

preview_eval で、大学スタート（h1dのみ解禁）で大会エントリー画面に相当する部門候補を確認:

```javascript
(function () {
  var s = DT.state.newCharacter(function(){return 0;}, 'college');
  return DT.DATA.DIVISIONS.filter(function(d){
    return d.scoring !== 'specialist' || DT.contest.isGenreUnlocked(s, d.id);
  }).map(function(d){ return d.id; });
})();
```
Expected: `["overall", "h1d"]`（v1d/d2/d3 は含まれない）。

- [ ] **Step 3: コミット**

```bash
git add js/app.js
git commit -m "$(cat <<'EOF'
feat(TR): 大会エントリーで未解禁ジャンルの部門を除外

練習できない部門には出場できないよう、renderEntryで未解禁スペシャリスト部門を候補から除外。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: テストAIの解禁対応とバランス再検証（test-simulation.js）

**Files:**
- Modify: `tests/test-simulation.js`（`pickCombo` / `entryPick` を解禁対応、必要なら閾値/バランス調整）

**Interfaces:**
- Consumes: `DT.contest.isGenreUnlocked`

- [ ] **Step 1: pickCombo を解禁済みジャンル限定に修正**

`tests/test-simulation.js` の `pickCombo` 関数を次に置換:

```javascript
function pickCombo(state) {
  const methodIds = DT.DATA.METHODS.map(m => m.id);
  const genres = DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked(state, g.id));
  let worstGenre = genres[0].id;
  let worstMethod = methodIds[0];
  let worstValue = state.skills[worstGenre][worstMethod];
  genres.forEach(g => {
    methodIds.forEach(m => {
      const v = state.skills[g.id][m];
      if (v < worstValue) { worstValue = v; worstGenre = g.id; worstMethod = m; }
    });
  });
  return { genre: worstGenre, method: worstMethod };
}
```

- [ ] **Step 2: entryPick を解禁済み部門限定に修正**

`tests/test-simulation.js` の `entryPick` 関数を次に置換（引数に state を追加）:

```javascript
function entryPick(turn, state) {
  const specialistIds = DT.DATA.DIVISIONS
    .filter(d => d.scoring === 'specialist' && DT.contest.isGenreUnlocked(state, d.id))
    .map(d => d.id);
  const max = DT.contest.maxEntries(turn);
  return ['overall'].concat(specialistIds.slice(0, max - 1));
}
```

`entryPick(state.turn)` の呼び出し箇所2か所（`playThrough` 内と、末尾「赤点回数」テスト内）を `entryPick(state.turn, state)` に変更する。

- [ ] **Step 3: シミュレーションテストを実行**

Run: `node tests/test-simulation.js`
Expected: できれば全 PASS。特に確認するアサート:
- 「まともな方針なら20回全部卒業できる」
- 「まともな方針なら4年間でどこかの大会で3位以内に入れる」
- 「世界大会は出場権があるときだけ結果に現れる」（出場≥1）

- [ ] **Step 4: 失敗時のバランス調整（PASSなら本Stepはスキップ）**

もし卒業率・順位・世界大会出場のいずれかが破綻したら、原因を切り分けて調整する。想定される調整候補（1つずつ試し、都度テスト実行）:
- 解禁閾値 `SKILL_TREE` の 20 を下げる（例: 15）。序盤にh1dに縛られる期間が短くなる。
- 大学以外の初期値は不変のため、主に高校スタートで h1d 初期習熟が20未満だと序盤h1d集中になる点が効く。エントリー枠 `maxEntries` は変更しない。
- バランス値（`DT.contest.LEVELS`）は v5調整の意図を壊さないため、まず閾値側で調整する。
- 参考テスト「20シードの卒業ランク分布」の出力を見て、E偏重なら閾値を緩める。

調整後は再度 `node tests/test-simulation.js` を実行し、上記アサートが緑になることを確認する。
関連メモ: `.superpowers/sdd/`（過去のバランス調整記録）と設計書 [[project_diabolo_trainer_balance_v5]]。

- [ ] **Step 5: 全テスト最終確認**

Run: `for f in tests/test-*.js; do echo "$f"; node "$f" | tail -1; done`
Expected: 全ファイル `N passed, 0 failed`

- [ ] **Step 6: コミット**

```bash
git add tests/test-simulation.js js/data.js js/contest.js
git commit -m "$(cat <<'EOF'
test(TR): テストAIを解禁対応・バランス再検証

pickCombo/entryPickを解禁済みジャンル限定に修正。TR導入後の卒業率・順位・
世界大会出場を再検証（必要に応じ解禁閾値を微調整）。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 総合スモーク検証（preview 一気通し）

**Files:** なし（検証のみ）

- [ ] **Step 1: preview で大学ハードの一連の流れを確認**

preview_start 済みのサーバで、タイトル→はじめから→経歴「大学から始めた」→この選手で始める、と preview_click で操作し、preview_snapshot で:
- 技術テーブルが全0、演技構成が3〜10
- ジャンル行で v1d/d2/d3 が `🔒` 付き disabled、h1d のみ選択可
- コンディション欄に「次の解禁」行

- [ ] **Step 2: h1d を育てて解禁演出を確認**

preview_eval で h1d を底上げして1ヶ月練習し、解禁告知が出ることを確認:

```javascript
(function () {
  // 現在のstateはアプリ内クロージャのため、UI操作で h1d×反復練習 を数ヶ月繰り返して
  // 習熟20超→「1ディアボロ垂直軸が解禁された！」等が練習結果ログに出ることを確認する。
  return document.querySelector('#main-log') ? document.querySelector('#main-log').textContent : 'no-log';
})();
```
（UI操作: h1d選択→反復練習を4枠→この内容で練習する、を習熟20超まで繰り返し、結果ログに解禁告知が出ることを snapshot で確認）

- [ ] **Step 3: コンソールエラーが無いことを確認**

preview_console_logs(level: "error")
Expected: エラーなし

- [ ] **Step 4: 最終コミット（必要なら）**

検証のみで変更が無ければコミット不要。ドキュメント微修正等があればまとめてコミット。

---

## Self-Review 結果（計画作成者による確認）

- **Spec coverage:** 設計書の各節に対応するタスクあり — 2.x/データ・判定=Task1、3.x/初期値=Task2、5.x/状態=Task3、5.1/演出=Task4、4.1-4.2/UI=Task5、4.3/エントリー=Task6、6.2/テスト再検証=Task7、6.1の一部（UIスモーク）=Task8。6.1のUI単体（disabled等）はDOMテスト基盤が無いためpreview検証に置換（プロジェクトにDOMテストが無いことを踏まえた判断）。
- **Placeholder scan:** 具体コードと期待値を各ステップに明記。Task7 Step4のみ「失敗時の調整」で分岐だが、調整候補と検証手順を具体化済み。
- **Type consistency:** `isGenreUnlocked(state, genreId)`、`newlyUnlockedGenres(state)`、`nextUnlockTarget(state)->{id,reqGenre,remaining}`、`announcedUnlocks:string[]` を全タスクで一貫使用。`entryPick(turn, state)` の引数追加を呼び出し側含め明記。
