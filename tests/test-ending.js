'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/ending.js');
const DT = globalThis.DT;

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

test('evaluate: 退学は専用評価', () => {
  const s = DT.state.newCharacter(() => 0.5);
  s.status = 'expelled';
  const e = DT.ending.evaluate(s);
  assert.strictEqual(e.rank, '退学');
  assert.ok(e.comment.length > 0);
});

test('evaluate: ポイント閾値でランクが決まる', () => {
  assert.strictEqual(DT.ending.evaluate(withResults([850])).rank, 'S');
  assert.strictEqual(DT.ending.evaluate(withResults([700])).rank, 'A');
  assert.strictEqual(DT.ending.evaluate(withResults([450])).rank, 'B');
  assert.strictEqual(DT.ending.evaluate(withResults([300])).rank, 'C');
  assert.strictEqual(DT.ending.evaluate(withResults([90])).rank, 'D');
  assert.strictEqual(DT.ending.evaluate(withResults([89])).rank, 'E');
});

test('evaluate: AJDC総合優勝があればポイント不足でもS', () => {
  const e = DT.ending.evaluate(withResults([100], true));
  assert.strictEqual(e.rank, 'S');
  assert.strictEqual(e.ajdcOverallWin, true);
});

test('evaluate: 合計ポイントと能力平均を返す', () => {
  const e = DT.ending.evaluate(withResults([40, 25]));
  assert.strictEqual(e.totalPoints, 65);
  assert.ok(e.abilityAvg >= 10 && e.abilityAvg <= 35);
  assert.ok(e.title.length > 0);
});

test('evaluate: スペシャリスト部門のAJDC優勝ではSにならない', () => {
  const s = DT.state.newCharacter(() => 0.5);
  s.status = 'graduated';
  s.results = [{
    name: 'test', type: 'ajdc', division: 'v1d', divisionLabel: '1ディアボロ垂直軸部門',
    rank: 1, entrants: 16, score: 60, misses: 0, points: 50
  }];
  const e = DT.ending.evaluate(s);
  assert.notStrictEqual(e.rank, 'S');
  assert.strictEqual(e.ajdcOverallWin, false);
});

summary();
