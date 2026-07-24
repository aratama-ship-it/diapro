'use strict';
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { test, summary } = require('./harness');

const css = readFileSync(require.resolve('../css/style.css'), 'utf8');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const app = readFileSync(require.resolve('../js/app.js'), 'utf8');

test('MOBILE LAYOUT: iPhone Safariの表示領域にアプリの高さが追従する', () => {
  const mobileApp = css.match(/@media \(max-width: 480px\)[\s\S]*?#app\s*\{([^}]*)\}/);
  assert.ok(mobileApp, 'スマホ用の#appルールが必要');
  assert.match(mobileApp[1], /height:\s*100vh;[\s\S]*?height:\s*-webkit-fill-available;[\s\S]*?height:\s*100dvh;/,
    '100vhの後に旧Safari用フォールバックと動的ビューポート高を指定する');
});

test('MOBILE LAYOUT: ボトムナビは端末下部のセーフエリアを避ける', () => {
  assert.match(css, /\.bottom-nav\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test('MOBILE LAYOUT: 更新したCSSを参照する', () => {
  assert.match(html, /css\/style\.css\?v=20260724a/);
});

test('CARD CATALOG: 一覧の取得済みカードにイラストを表示する', () => {
  assert.match(app, /function zukanTileArt\(entry, got\)[\s\S]*?fillCardArt\(art, Object\.assign\(\{\}, got\.snap, \{ id: entry\.id \}\)\)/);
  assert.match(app, /tile\.appendChild\(zukanTileArt\(c, got\)\)/);
  assert.match(css, /\.zukan-tile \.zt-art\s*\{[\s\S]*?aspect-ratio:\s*592\s*\/\s*300/);
  assert.match(css, /\.zukan-tile \.zt-art \.pcard-artimg\s*\{[\s\S]*?object-fit:\s*cover/);
});

test('SHORT EVENT FLOW: 奇数月のイベントを1件に統一する', () => {
  assert.match(app, /const slot = DT\.events\.shortEventFor\(state\)/);
  assert.match(app, /const sched = SHORT \? null : DT\.events\.scheduledEventFor\(state\)/);
  assert.match(app, /state\.turn === 26 && !state\.retireOfferSeen[\s\S]*?renderRetireOffer\(pendingMessages, afterPreSlot\)/);
  assert.doesNotMatch(app, /function showTaiwanToilet\(/);
});

test('MOBILE LAYOUT: 卒業生名簿の保存バーは下部セーフエリアを避ける', () => {
  assert.match(css, /\.alumni-savebar\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(html, /id="alumni-modal"/);
  assert.match(html, /id="alumni-search"/);
});

test('NAVIGATION: 新入生スカウトからタイトルへ戻れる', () => {
  assert.match(html, /id="btn-create-back"[^>]*aria-label="タイトルへ戻る"/);
  assert.match(app, /\$\('#btn-create-back'\)\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?candidate\s*=\s*null;[\s\S]*?initTitle\(\);/);
  assert.match(app, /QUERY_PARAMS\.get\('preview'\)\s*===\s*'create'[\s\S]*?renderCreate\(newCandidate\(\)\);/);
});

test('NAVIGATION: 卒業生名簿はタイトルではなく新入生スカウトで設定する', () => {
  const title = html.match(/<section id="screen-title"[\s\S]*?<\/section>/);
  const create = html.match(/<section id="screen-create"[\s\S]*?<\/section>/);
  assert.ok(title && create);
  assert.doesNotMatch(title[0], /id="btn-alumni"/);
  assert.match(create[0], /id="btn-alumni"[^>]*>🌸 登場する卒業生を設定/);
  assert.match(app, /function renderCreateAlumniButton\(\)[\s\S]*?requiredAlumniCount\(profile\)[\s\S]*?profile\.selectedIds\.length/);
  assert.match(app, /!?\$\('#screen-create'\)\.classList\.contains\('hidden'\)[\s\S]*?candidate\.activeAlumni\s*=\s*DT\.state\.loadActiveAlumni/);
});

summary();
