'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
const DT = globalThis.DT;

function base() {
  return DT.state.newCharacter(() => 0); // stats全10, study40, fatigue0, motivation3
}

test('growthMult: 能力値が高いほど伸びにくい', () => {
  assert.strictEqual(DT.engine.growthMult(10), 1.0);
  assert.strictEqual(DT.engine.growthMult(39), 1.0);
  assert.strictEqual(DT.engine.growthMult(40), 0.75);
  assert.strictEqual(DT.engine.growthMult(70), 0.5);
  assert.strictEqual(DT.engine.growthMult(90), 0.25);
});

test('outcomeProbs: 基準状態は大成功10%・失敗10%', () => {
  const p = DT.engine.outcomeProbs(base());
  assert.ok(Math.abs(p.great - 0.10) < 1e-9);
  assert.ok(Math.abs(p.fail - 0.10) < 1e-9);
});

test('outcomeProbs: 疲労100だと大成功2%・失敗40%（クランプ）', () => {
  const s = base();
  s.fatigue = 100;
  const p = DT.engine.outcomeProbs(s);
  assert.ok(Math.abs(p.great - 0.02) < 1e-9);
  assert.ok(Math.abs(p.fail - 0.40) < 1e-9);
});

test('outcomeProbs: 学力70以上でボーナス+5%', () => {
  const s = base();
  s.study = 70;
  assert.ok(Math.abs(DT.engine.outcomeProbs(s).great - 0.15) < 1e-9);
});

test('rollTier: 乱数値で4段階に分かれる', () => {
  const s = base(); // great=0.10, fail=0.10 → 成功帯0.20〜0.68, 普通帯0.68〜1.0
  assert.strictEqual(DT.engine.rollTier(s, () => 0.05), '大成功');
  assert.strictEqual(DT.engine.rollTier(s, () => 0.15), '失敗');
  assert.strictEqual(DT.engine.rollTier(s, () => 0.30), '成功');
  assert.strictEqual(DT.engine.rollTier(s, () => 0.90), '普通');
});

test('applyAction: 練習大成功で能力2倍伸び・やる気+1', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'multiplex', () => 0.0);
  assert.strictEqual(r.tier, '大成功');
  assert.strictEqual(s.stats.multiplex, 28); // 10 + round(9*2.0*1.0)
  assert.strictEqual(s.fatigue, 14);
  assert.strictEqual(s.injuryRisk, 16); // 10 + 6
  assert.strictEqual(s.motivation, 4);
  assert.strictEqual(s.didTrain, true);
});

test('applyAction: 練習失敗は伸びゼロ・疲労追加・やる気-1', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'multiplex', () => 0.15);
  assert.strictEqual(r.tier, '失敗');
  assert.strictEqual(s.stats.multiplex, 10);
  assert.strictEqual(s.fatigue, 19); // 14 + 5
  assert.strictEqual(s.motivation, 2);
});

test('applyAction: 休養で疲労-35・怪我リスク-12・やる気+1', () => {
  const s = base();
  s.fatigue = 50;
  s.injuryRisk = 30;
  DT.engine.applyAction(s, 'rest');
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.injuryRisk, 18);
  assert.strictEqual(s.motivation, 4);
  assert.strictEqual(s.didTrain, false);
});

test('applyAction: 勉強成功で学力+10', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'study', () => 0.30);
  assert.strictEqual(r.tier, '成功');
  assert.strictEqual(s.study, 50);
  assert.strictEqual(s.fatigue, 4);
  assert.strictEqual(s.didStudy, true);
});

test('turnLabel: 4月始まりの年月表示', () => {
  assert.strictEqual(DT.engine.turnLabel(1), '1年生 4月');
  assert.strictEqual(DT.engine.turnLabel(10), '1年生 1月');
  assert.strictEqual(DT.engine.turnLabel(12), '1年生 3月');
  assert.strictEqual(DT.engine.turnLabel(13), '2年生 4月');
  assert.strictEqual(DT.engine.turnLabel(48), '4年生 3月');
});

test('endTurn: 勉強しなかった月は学力-2、疲労は自然回復-5', () => {
  const s = base();
  s.fatigue = 30;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.study, 38);
  assert.strictEqual(s.fatigue, 25);
  assert.strictEqual(s.turn, 2);
});

test('endTurn: 勉強した月は学力が減衰しない', () => {
  const s = base();
  s.didStudy = true;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.study, 40);
});

test('endTurn: 高疲労で練習すると怪我リスク加算', () => {
  const s = base();
  s.didTrain = true;
  s.fatigue = 70;
  DT.engine.endTurn(s, () => 0.99); // 乱数0.99は怪我しない
  assert.strictEqual(s.injuryRisk, 15); // 10 + 5
});

test('endTurn: 怪我発生で来月療養・リスクリセット', () => {
  const s = base();
  s.didTrain = true;
  s.injuryRisk = 100; // 怪我確率 100/500 = 20%
  const r = DT.engine.endTurn(s, () => 0.0);
  assert.strictEqual(s.injuredTurns, 1);
  assert.strictEqual(s.injuryRisk, 25);
  assert.strictEqual(s.motivation, 2);
  assert.ok(r.events.some(e => e.includes('怪我')));
});

test('endTurn: 療養明けで回復', () => {
  const s = base();
  s.injuredTurns = 1;
  s.fatigue = 60;
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.injuredTurns, 0);
  assert.strictEqual(s.fatigue, 30); // 60 - 25(療養) - 5(自然回復)
  assert.ok(r.events.some(e => e.includes('治った')));
});

test('endTurn: 学力低迷3ヶ月連続で退学', () => {
  const s = base();
  s.study = 10;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 1);
  assert.strictEqual(s.status, 'playing');
  DT.engine.endTurn(s, () => 0.99);
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.status, 'expelled');
  assert.ok(r.events.some(e => e.includes('退学')));
});

test('endTurn: 学力回復で警告カウンタがリセットされる', () => {
  const s = base();
  s.study = 10;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 1);
  s.study = 50;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 0);
});

test('endTurn: 48ターン目終了で卒業', () => {
  const s = base();
  s.turn = 48;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.status, 'graduated');
});

summary();
