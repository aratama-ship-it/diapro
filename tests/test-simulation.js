'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
require('../js/contest.js');
require('../js/ending.js');
const DT = globalThis.DT;

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function chooseSensible(state) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.study < 30) return 'study';
  if (state.fatigue > 55) return 'rest';
  let worst = DT.DATA.TRAININGS[0];
  DT.DATA.TRAININGS.forEach(t => {
    if (state.stats[t.stat] < state.stats[worst.stat]) worst = t;
  });
  return worst.id;
}

function playThrough(rng, choose) {
  const state = DT.state.newCharacter(rng);
  let guard = 0;
  while (state.status === 'playing' && guard < 100) {
    guard += 1;
    DT.engine.applyAction(state, choose(state), rng);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) DT.contest.run(state, contest, rng);
    DT.engine.endTurn(state, rng);
  }
  return state;
}

test('まともな方針なら20回全部卒業できる', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    assert.strictEqual(s.status, 'graduated', 'seed=' + seed);
    assert.strictEqual(s.results.length, 8, 'seed=' + seed + ' 大会数');
    const e = DT.ending.evaluate(s);
    assert.ok('SABCDE'.includes(e.rank), 'seed=' + seed + ' rank=' + e.rank);
  }
});

test('まともな方針なら能力は確実に成長する', () => {
  const s = playThrough(lcg(42), chooseSensible);
  const avg = DT.DATA.STATS.reduce((a, st) => a + s.stats[st.id], 0) / DT.DATA.STATS.length;
  assert.ok(avg >= 40, '最終能力平均が低すぎる: ' + avg);
});

test('勉強を一切しないと退学になる', () => {
  const s = playThrough(lcg(7), (state) =>
    state.injuredTurns > 0 ? 'injured' : (state.fatigue > 55 ? 'rest' : 'multiplex')
  );
  assert.strictEqual(s.status, 'expelled');
  // 初期学力は最大60。減衰-2/月で20を割るまで最長約21ヶ月＋警告3ヶ月
  assert.ok(s.turn < 30, '退学が遅すぎる: turn=' + s.turn);
});

summary();
