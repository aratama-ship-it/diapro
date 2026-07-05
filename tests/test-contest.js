'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/contest.js');
const DT = globalThis.DT;

function allFifty() {
  const s = DT.state.newCharacter(() => 0);
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 50; });
  return s; // fatigue0, motivation3
}

test('derived: 難易度=技3種平均, 表現=表現3種平均, ミス率クランプ', () => {
  const s = allFifty();
  const d = DT.contest.derived(s);
  assert.strictEqual(d.difficulty, 50);
  assert.strictEqual(d.expression, 50);
  assert.strictEqual(d.missRate, 10); // 25 + 0*0.3 - 50*0.3 = 10
  s.fatigue = 100;
  s.stats.basic = 0;
  assert.strictEqual(DT.contest.derived(s).missRate, 55); // 25 + 30 - 0
});

test('playerScore: 乱数0.5固定でノイズ0・ミス0', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, () => 0.5);
  // 50*0.45 + 50*0.15 + 50*0.35 + 0 + 0 = 47.5
  assert.strictEqual(r.score, 47.5);
  assert.strictEqual(r.misses, 0);
});

test('contestForTurn: 大会月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'summer');
  assert.strictEqual(DT.contest.contestForTurn(47).type, 'national');
  assert.strictEqual(DT.contest.contestForTurn(6), null);
});

test('run: 全員平均点の相手に勝てば1位・夏大会40pt', () => {
  const s = allFifty();
  const contest = DT.DATA.CONTESTS[0]; // 1年夏, 相手平均30
  const r = DT.contest.run(s, contest, () => 0.5);
  assert.strictEqual(r.rank, 1);
  assert.strictEqual(r.points, 40);
  assert.strictEqual(r.entrants, 16);
  assert.strictEqual(s.results.length, 1);
});

test('run: 弱いと下位グループで最低ポイント', () => {
  const s = DT.state.newCharacter(() => 0); // 全能力10
  const contest = DT.DATA.CONTESTS[7]; // 4年全国, 相手平均69
  const r = DT.contest.run(s, contest, () => 0.5);
  assert.ok(r.rank > 8);
  assert.strictEqual(r.points, 5);
});

summary();
