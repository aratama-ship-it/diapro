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

test('DATA: 練習メニューは競技能力と1対1対応', () => {
  assert.strictEqual(DT.DATA.TRAININGS.length, 6);
  DT.DATA.TRAININGS.forEach(t => {
    assert.ok(DT.DATA.STATS.some(s => s.id === t.stat), t.id + ' のstatが未定義');
    assert.ok(t.gain > 0 && t.fatigue >= 0 && t.risk >= 0);
  });
});

test('DATA: 大会はOIDC(8月)×4とAJDC(3月)×4', () => {
  assert.strictEqual(DT.DATA.CONTESTS.length, 8);
  assert.deepStrictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'oidc').map(c => c.turn), [5, 17, 29, 41]);
  assert.deepStrictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'ajdc').map(c => c.turn), [12, 24, 36, 48]);
});

summary();
