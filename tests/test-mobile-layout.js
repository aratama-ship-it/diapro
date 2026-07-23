'use strict';
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { test, summary } = require('./harness');

const css = readFileSync(require.resolve('../css/style.css'), 'utf8');
const html = readFileSync(require.resolve('../index.html'), 'utf8');

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
  assert.match(html, /css\/style\.css\?v=20260723b/);
});

summary();
