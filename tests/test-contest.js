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

test('breakdown: 配点換算と基礎点の段階式', () => {
  const b = DT.contest.breakdown(allFifty());
  assert.strictEqual(b.difficulty, 15);   // 50% of 30
  assert.strictEqual(b.variety, 5);
  assert.strictEqual(b.control, 5);
  assert.strictEqual(b.novelty, 5);
  assert.strictEqual(b.composition, 10);
  assert.strictEqual(b.fundamentals, 10); // floor(50/25)=2要素 × 5点
});

test('breakdown: 基礎点は0/5/10/15/20の段階式', () => {
  const s = allFifty();
  [[0, 0], [24, 0], [25, 5], [74, 10], [75, 15], [100, 20]].forEach(([v, exp]) => {
    s.stats.fundamentals = v;
    assert.strictEqual(DT.contest.breakdown(s).fundamentals, exp, 'stat=' + v);
  });
});

test('breakdown: 全能力100で満点100点', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  const total = Object.values(DT.contest.breakdown(s)).reduce((a, v) => a + v, 0);
  assert.strictEqual(total, 100);
});

test('missRate: 操作安定度と疲労で決まりクランプされる', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.missRate(s), 10); // 25 + 0 - 15
  s.fatigue = 100; s.stats.control = 0;
  assert.strictEqual(DT.contest.missRate(s), 55); // 25 + 30 - 0
  s.fatigue = 0; s.stats.control = 100;
  assert.strictEqual(DT.contest.missRate(s), 2);  // 下限クランプ
});

test('playerScore: 乱数0.5固定でノイズ0・ミス0・スコア50', () => {
  const r = DT.contest.playerScore(allFifty(), () => 0.5);
  assert.strictEqual(r.score, 50);
  assert.strictEqual(r.misses, 0);
  assert.strictEqual(r.execDeduction, 0);
  assert.strictEqual(r.specialDeduction, 0);
});

test('playerScore: ミス発生で実施減点1〜2点', () => {
  const s = allFifty();
  s.fatigue = 100; s.stats.control = 0; // missRate 55
  // rng: noise=0.5, miss判定0.0(<55 ミス), 減点幅0.0(→1点), miss判定0.99(ノーミス), special 0.99
  const seq = [0.5, 0.0, 0.0, 0.99, 0.99];
  let i = 0;
  const r = DT.contest.playerScore(s, () => seq[i++]);
  assert.strictEqual(r.misses, 1);
  assert.strictEqual(r.execDeduction, 1);
});

test('contestForTurn: 大会月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'summer');
  assert.strictEqual(DT.contest.contestForTurn(47).type, 'national');
  assert.strictEqual(DT.contest.contestForTurn(6), null);
});

test('run: 全員平均点の相手に勝てば1位・夏大会40pt', () => {
  const s = allFifty();
  const r = DT.contest.run(s, DT.DATA.CONTESTS[0], () => 0.5); // 1年夏 相手平均25
  assert.strictEqual(r.rank, 1);
  assert.strictEqual(r.points, 40);
  assert.ok(r.parts);
  assert.strictEqual(s.results.length, 1);
});

test('run: 弱いと下位グループで最低ポイント', () => {
  const s = DT.state.newCharacter(() => 0); // 全能力10
  const r = DT.contest.run(s, DT.DATA.CONTESTS[7], () => 0.5); // 4年全国 相手平均56
  assert.ok(r.rank > 8);
  assert.strictEqual(r.points, 5);
});

summary();
