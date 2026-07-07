# 技術レーダーチャート（RC）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各ジャンルの3ステータス（難易度・新奇性・操作安定度）を三角レーダーで表示し、既存の数値テーブルに追加する。

**Architecture:** 座標計算の純関数を DOM非依存の `js/radar.js`（Node単体テスト可能）に置き、SVG描画とグリッド組み立ては `app.js`。既存の技術テーブルは残し、その下に2×2のレーダーグリッドを追加する。

**Tech Stack:** Vanilla HTML/CSS/JS（ビルド不要）、インラインSVG、自作テストハーネス（tests/harness.js）。

## Global Constraints

- 各jsは IIFE で `DT.<module>` に生やす。既存スタイル（日本語コメント）踏襲。
- 数値テーブル（skillTable）は**置き換えず維持**し、レーダーは**追加**する。
- 3軸配置: 難易度=上、新奇性=左下、操作安定度=右下。角度 上=-90°/左下=150°/右下=30°。
- 半径マップ: r' = radius × clamp(value,0,100)/100。
- ロックジャンル（`DT.contest.isGenreUnlocked` が false）は値ポリゴンを描かず「🔒」表示。
- 配色: カード背景 `#1c1c30`、グリッド線 `#4a4a63`/`#3a3a52`、値ポリゴン塗り `rgba(78,205,196,0.35)`・輪郭 `#4ecdc4`、タイトル `#ffd166`。
- SVG生成は `document.createElementNS`（HTMLの `el()` は使えない）。
- テスト実行: `node tests/test-*.js` で `N passed, 0 failed`。
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

### Task 1: 座標計算モジュール radar.js（純関数＋単体テスト）

**Files:**
- Create: `js/radar.js`
- Create: `tests/test-radar.js`

**Interfaces:**
- Produces: `DT.radar.radarPoint(value, axisIndex, cx, cy, radius) -> { x, y }`（axisIndex: 0=上,1=左下,2=右下）、`DT.radar.AXIS_ANGLES = [-90, 150, 30]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/test-radar.js` を新規作成:

```javascript
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/radar.js');
const DT = globalThis.DT;
const near = (a, b) => Math.abs(a - b) < 0.001;

test('radarPoint: value=0はどの軸でも中心(cx,cy)に一致', () => {
  [0, 1, 2].forEach(axis => {
    const p = DT.radar.radarPoint(0, axis, 50, 50, 40);
    assert.ok(near(p.x, 50) && near(p.y, 50), 'axis=' + axis);
  });
});

test('radarPoint: value=100・軸0(上)は(cx, cy-radius)', () => {
  const p = DT.radar.radarPoint(100, 0, 50, 50, 40);
  assert.ok(near(p.x, 50), 'x=' + p.x);
  assert.ok(near(p.y, 10), 'y=' + p.y); // 50-40
});

test('radarPoint: 軸1(左下)と軸2(右下)はxがcx対称・yが等しく下側(y>cy)', () => {
  const p1 = DT.radar.radarPoint(100, 1, 50, 50, 40);
  const p2 = DT.radar.radarPoint(100, 2, 50, 50, 40);
  assert.ok(near(p1.x - 50, -(p2.x - 50)), 'x対称: ' + p1.x + ',' + p2.x);
  assert.ok(near(p1.y, p2.y), 'y等しい: ' + p1.y + ',' + p2.y);
  assert.ok(p1.y > 50, '下側なのでy>cy: ' + p1.y);
});

test('radarPoint: value>100や負値はクランプされる', () => {
  const over = DT.radar.radarPoint(200, 0, 50, 50, 40);
  assert.ok(near(over.y, 10), '200は100扱い y=' + over.y);
  const under = DT.radar.radarPoint(-50, 0, 50, 50, 40);
  assert.ok(near(under.y, 50), '負値は0扱い y=' + under.y);
});

summary();
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node tests/test-radar.js`
Expected: FAIL（`Cannot find module '../js/radar.js'`）

- [ ] **Step 3: radar.js を実装**

`js/radar.js` を新規作成:

```javascript
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  // 三角レーダーの軸角度（度）: 0=上, 1=左下, 2=右下。SVG座標(y下向き)で上=-90°。
  const AXIS_ANGLES = [-90, 150, 30];

  // 値(0-100)と軸番号からSVG座標{x,y}を返す純関数。半径 r' = radius × clamp(value,0,100)/100。
  function radarPoint(value, axisIndex, cx, cy, radius) {
    const v = Math.max(0, Math.min(100, value));
    const r = radius * v / 100;
    const rad = AXIS_ANGLES[axisIndex] * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  DT.radar = { radarPoint, AXIS_ANGLES };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `node tests/test-radar.js`
Expected: PASS（`4 passed, 0 failed`）

- [ ] **Step 5: コミット**

```bash
git add js/radar.js tests/test-radar.js
git commit -m "$(cat <<'EOF'
feat(RC): レーダー座標計算モジュールradar.jsを追加

radarPoint(value,axisIndex,cx,cy,radius)を純関数として実装（DOM非依存）。
三角3軸(上/左下/右下)、値クランプ、Node単体テスト付き。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: SVGレーダー描画とグリッド組み込み（app.js / style.css / index.html）

**Files:**
- Modify: `index.html`（`js/radar.js` の script 追加）
- Modify: `js/app.js`（`svgEl` / `genreRadar` / `skillRadarGrid` 追加、renderMain・renderCreate に組み込み）
- Modify: `css/style.css`（レーダー用スタイル追加）

**Interfaces:**
- Consumes: `DT.radar.radarPoint`（Task 1）、既存 `DT.contest.isGenreUnlocked`、`DT.contest.genreAvg`、`DT.DATA.GENRES`、app.js内 `el()`、`genreLabel()`
- Produces: なし（UI）

このタスクは既存DOMテストが無いため、preview で目視検証する。

- [ ] **Step 1: index.html に radar.js を追加**

`index.html` の `<script src="js/ending.js"></script>` の直後に1行追加:

```html
<script src="js/radar.js"></script>
```

（結果として data → state → engine → contest → events → ending → radar → app の順になる）

- [ ] **Step 2: css/style.css にレーダー用スタイルを追加**

`css/style.css` の末尾に追記:

```css
.radar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.radar-card { background: #1c1c30; border-radius: 8px; padding: 4px 2px 2px; }
.radar-title { font-size: 0.7rem; color: #ffd166; text-align: center; margin-bottom: 2px; }
.radar-svg { width: 100%; height: auto; display: block; }
```

- [ ] **Step 3: app.js に svgEl / genreRadar / skillRadarGrid を追加**

`js/app.js` の `skillTable` 関数定義（`function skillTable(skills) {` の行）の**直前**に、次の3関数を追加:

```javascript
  // SVG要素生成ヘルパー（HTML用のel()は名前空間が違うため使えない）
  function svgEl(tag, attrs, children) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
    if (children) children.forEach(c => n.appendChild(c));
    return n;
  }

  // 1ジャンル分の三角レーダーカード。cell={difficulty,novelty,control}, avg=習熟平均, unlocked=解禁済みか
  function genreRadar(genreId, cell, avg, unlocked) {
    const CX = 50, CY = 52, R = 30;
    const rp = (v, a) => DT.radar.radarPoint(v, a, CX, CY, R);
    const ptStr = pts => pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'radar-svg' });

    // グリッド（外枠100・中間50の三角）
    [100, 50].forEach(level => {
      const ring = [rp(level, 0), rp(level, 1), rp(level, 2)];
      svg.appendChild(svgEl('polygon', { points: ptStr(ring), fill: 'none', stroke: '#4a4a63', 'stroke-width': '0.6' }));
    });
    // 軸線（中心→各頂点）
    [0, 1, 2].forEach(a => {
      const o = rp(100, a);
      svg.appendChild(svgEl('line', { x1: CX, y1: CY, x2: o.x.toFixed(1), y2: o.y.toFixed(1), stroke: '#3a3a52', 'stroke-width': '0.5' }));
    });
    // 値ポリゴン（解禁時のみ）
    if (unlocked) {
      const vpts = [rp(cell.difficulty, 0), rp(cell.novelty, 1), rp(cell.control, 2)];
      svg.appendChild(svgEl('polygon', { points: ptStr(vpts), fill: 'rgba(78,205,196,0.35)', stroke: '#4ecdc4', 'stroke-width': '1' }));
    }
    // 頂点ラベル＋数値（100より少し外側に配置）
    const anchors = ['middle', 'end', 'start'];
    const dys = ['-1.2', '3.2', '3.2'];
    const labels = [['難', cell.difficulty, 0], ['新', cell.novelty, 1], ['操', cell.control, 2]];
    labels.forEach(function (lv) {
      const lab = lv[0], val = lv[1], a = lv[2];
      const o = DT.radar.radarPoint(100, a, CX, CY, R + 9);
      const t = svgEl('text', { x: o.x.toFixed(1), y: o.y.toFixed(1), 'text-anchor': anchors[a], dy: dys[a], fill: '#cfcfe0', 'font-size': '7' });
      t.textContent = unlocked ? (lab + val) : lab;
      svg.appendChild(t);
    });
    // 未解禁は中央に🔒
    if (!unlocked) {
      const t = svgEl('text', { x: CX, y: CY + 3, 'text-anchor': 'middle', 'font-size': '10' });
      t.textContent = '🔒';
      svg.appendChild(t);
    }

    const card = el('div', 'radar-card');
    card.appendChild(el('div', 'radar-title', genreLabel(genreId) + (unlocked ? ' ' + avg : '（未解禁）')));
    card.appendChild(svg);
    return card;
  }

  // 4ジャンルの三角レーダーを2×2グリッドで返す。skillsだけ渡せばメイン/スカウト両方で使える。
  function skillRadarGrid(skills) {
    const grid = el('div', 'radar-grid');
    DT.DATA.GENRES.forEach(function (g) {
      const unlocked = DT.contest.isGenreUnlocked({ skills: skills }, g.id);
      const avg = DT.contest.genreAvg({ skills: skills }, g.id);
      grid.appendChild(genreRadar(g.id, skills[g.id], avg, unlocked));
    });
    return grid;
  }

```

- [ ] **Step 4: renderMain に組み込み**

`js/app.js` の `renderMain` 内、`#main-stats` の `replaceChildren(...)` を次に変更（skillTableの直後に skillRadarGrid を追加）:

```javascript
    $('#main-stats').replaceChildren(
      el('div', 'section-label', '技術'),
      skillTable(state.skills),
      skillRadarGrid(state.skills),
      el('div', 'section-label', '演技構成'),
      statBar('演技構成', state.composition)
    );
```

- [ ] **Step 5: renderCreate に組み込み**

`js/app.js` の `renderCreate` 内、`#create-stats` の `replaceChildren(...)` を次に変更（skillTable(c.skills)の直後に skillRadarGrid を追加）:

```javascript
    $('#create-stats').replaceChildren(
      el('div', 'section-label', '技術'),
      skillTable(c.skills),
      skillRadarGrid(c.skills),
      el('div', 'section-label', '演技構成'),
      statBar('演技構成', c.composition),
      el('div', 'section-label', '学力'),
      statBar('学力', c.study)
    );
```

- [ ] **Step 6: 構文チェックと回帰テスト**

Run: `node --check js/app.js && node --check js/radar.js && for f in tests/test-*.js; do node "$f" | tail -1; done`
Expected: 構文エラーなし、各テスト `N passed, 0 failed`

- [ ] **Step 7: preview で目視検証**

```
preview_start(name: "diabolo-trainer")
```
preview_eval でタイトル→はじめから→大学から始めた→この選手で始める、と操作しメイン画面へ。
確認する点（preview_snapshot / preview_screenshot）:
- 技術テーブルの下に2×2のレーダーグリッドが出る（4カード）
- 各カードにジャンル名＋習熟平均のタイトル、三角の頂点に「難N/新N/操N」
- 大学スタートでは v1d/d2/d3 のカードが「🔒」表示（値ポリゴンなし）、h1d のみ三角が描かれる
- h1d を数ヶ月練習すると h1d カードの三角が広がる
- preview_console_logs(level: "error") でエラーなし
- スカウト画面（はじめから直後）でもレーダーが出ることを確認

- [ ] **Step 8: コミット**

```bash
git add index.html js/app.js css/style.css
git commit -m "$(cat <<'EOF'
feat(RC): 技術レーダーチャート(三角)をメイン/スカウト画面に追加

各ジャンルの難易度/新奇性/操作安定度を三角レーダーで表示（数値テーブルは維持）。
2×2グリッド、頂点に数値、未解禁ジャンルは🔒表示。SVGはradarPoint(radar.js)で描画。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 結果（計画作成者による確認）

- **Spec coverage:** 設計書の各節に対応 — §4.1 radar.js/radarPoint=Task1、§4.2 svgEl/genreRadar/skillRadarGrid=Task2 Step3、§3三角仕様=Step3、§3.2ロック=Step3(🔒)、§5組み込み(main/create)=Step4/5、§6配色=Global Constraints/Step2-3、§7テスト=Task1テスト+Step7 preview。index.html読み込み=Step1。
- **Placeholder scan:** 各ステップに具体コード・期待値を明記。TBD/曖昧表現なし。
- **Type consistency:** `radarPoint(value, axisIndex, cx, cy, radius)->{x,y}` をTask1定義・Task2使用で一致。`skillRadarGrid(skills)`（skillsのみ）で renderMain/renderCreate 双方から呼ぶ形に統一。`genreRadar(genreId, cell, avg, unlocked)` の引数順もStep3内で一貫。
