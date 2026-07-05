'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
const DT = globalThis.DT;

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

summary();
