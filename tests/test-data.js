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
