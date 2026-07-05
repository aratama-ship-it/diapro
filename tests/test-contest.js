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
  return s;
}

test('breakdown(overall): 従来どおり6項目・all50で合計50', () => {
  const b = DT.contest.breakdown(allFifty(), 'overall');
  assert.deepStrictEqual(b, { difficulty: 15, variety: 5, control: 5, novelty: 5, composition: 10, fundamentals: 10 });
});

test('breakdown(specialist): 4項目のみ・all50で合計50', () => {
  const b = DT.contest.breakdown(allFifty(), 'v1d');
  assert.deepStrictEqual(b, { difficulty: 22.5, control: 7.5, novelty: 15, composition: 5 });
});

test('playerScore: parts合計+judgeMod-減点=score が成立', () => {
  const s = allFifty();
  s.motivation = 5; // judgeMod = 4 + noise
  const r = DT.contest.playerScore(s, 'overall', () => 0.5); // noise 0
  const partsSum = Object.values(r.parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(r.judgeMod, 4);
  assert.strictEqual(r.score, Math.round((partsSum + r.judgeMod) * 10) / 10);
});

test('playerScore: 実施減点はexecDeductionMaxを使う', () => {
  const s = allFifty();
  s.fatigue = 100; s.stats.control = 0; // missRate 55
  // rng: noise0.5, miss判定0.0(ミス), 減点幅1.0(→1+round(1*(2-1))=2点), miss判定0.99, special0.99
  const seq = [0.5, 0.0, 1.0, 0.99, 0.99];
  let i = 0;
  const r = DT.contest.playerScore(s, 'overall', () => seq[i++]);
  assert.strictEqual(r.misses, 1);
  assert.strictEqual(r.execDeduction, 2);
});

test('maxSpecialists: 学年ごとに1つずつ増え3で頭打ち', () => {
  assert.strictEqual(DT.contest.maxSpecialists(5), 1);   // 1年
  assert.strictEqual(DT.contest.maxSpecialists(17), 2);  // 2年
  assert.strictEqual(DT.contest.maxSpecialists(29), 3);  // 3年
  assert.strictEqual(DT.contest.maxSpecialists(48), 3);  // 4年（cap）
});

test('runAll: 総合+スペシャ1部門で結果2件・疲労が演技間に加算される', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['v1d'], () => 0.5); // 1年OIDC 相手平均25
  assert.strictEqual(rs.length, 2);
  assert.strictEqual(rs[0].division, 'overall');
  assert.strictEqual(rs[0].rank, 1);
  assert.strictEqual(rs[0].points, 40);
  assert.strictEqual(rs[1].division, 'v1d');
  assert.strictEqual(rs[1].divisionLabel, '1ディアボロ垂直軸部門');
  assert.strictEqual(rs[1].rank, 1);
  assert.strictEqual(rs[1].points, 20); // スペシャリストは半分
  assert.strictEqual(s.fatigue, 6);     // 2演技目の前に+6
  assert.strictEqual(s.results.length, 2);
});

test('runAll: AJDCのポイントは総合100/スペシャ50', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[7], ['d2'], () => 0.5); // 4年AJDC 相手平均62
  assert.strictEqual(rs[0].points, 100);
  assert.strictEqual(rs[1].points, 50);
});

test('contestForTurn: OIDC/AJDCの月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'oidc');
  assert.strictEqual(DT.contest.contestForTurn(48).type, 'ajdc');
  assert.strictEqual(DT.contest.contestForTurn(11), null); // 旧全国大会の月は今は大会なし
});

summary();
