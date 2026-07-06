'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
const DT = globalThis.DT;

function base() {
  return DT.state.newCharacter(() => 0); // stats全10, genres全10, study40, fatigue0, motivation3
}

function mk(turn) {
  const s = base();
  s.turn = turn;
  return s;
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

test('turnLabel: 4月始まりの年月表示', () => {
  assert.strictEqual(DT.engine.turnLabel(1), '1年生 4月');
  assert.strictEqual(DT.engine.turnLabel(10), '1年生 1月');
  assert.strictEqual(DT.engine.turnLabel(12), '1年生 3月');
  assert.strictEqual(DT.engine.turnLabel(13), '2年生 4月');
  assert.strictEqual(DT.engine.turnLabel(48), '4年生 3月');
});

// ---- applyTraining: 検算基準（プラン固定値） ----
// v3バランス調整（Task4）: SLOTS.methodGain/genreGain/routineGainを3/2/3→1/1/1に縮小した（詳細は
// .superpowers/sdd/v3-task-4-report.md）。以下のpinned値は全てこの新ゲインで再計算済み。
// 全能力10・turn1・rng固定0.3（全枠成功）: [{v1d,difficulty}]×4
// → difficulty 10+1×4=14, genres.v1d 10+1×4=14, fatigue 5×4=20, injuryRisk 10+2×4=18
test('applyTraining: 検算基準 全枠{v1d,difficulty}・rng0.3固定', () => {
  const s = base();
  const slots = [
    { genre: 'v1d', method: 'difficulty' },
    { genre: 'v1d', method: 'difficulty' },
    { genre: 'v1d', method: 'difficulty' },
    { genre: 'v1d', method: 'difficulty' }
  ];
  const r = DT.engine.applyTraining(s, slots, () => 0.3);
  assert.strictEqual(s.stats.difficulty, 14);
  assert.strictEqual(s.genres.v1d, 14);
  assert.strictEqual(s.fatigue, 20);
  assert.strictEqual(s.injuryRisk, 18);
  assert.strictEqual(s.didTrain, true);
  assert.strictEqual(r.results.length, 4);
  r.results.forEach(res => {
    assert.strictEqual(res.tier, '成功');
    assert.strictEqual(res.methodGain, 1);
    assert.strictEqual(res.genreGain, 1);
  });
});

test('applyTraining: 基本ゲイン（単枠・成功）', () => {
  const s = base();
  const r = DT.engine.applyTraining(s, [{ genre: 'h1d', method: 'control' }], () => 0.3);
  assert.strictEqual(s.stats.control, 11); // 10 + round(1*1*1)
  assert.strictEqual(s.genres.h1d, 11); // 10 + round(1*1*1)
  assert.strictEqual(s.fatigue, 3); // SLOTS.fatigue.control
  assert.strictEqual(s.injuryRisk, 11); // 10 + SLOTS.risk.control(1)
  assert.strictEqual(r.results[0].tier, '成功');
  assert.ok(r.messages[0].includes('操作安定度 +1'));
  assert.ok(r.messages[0].includes('習熟 +1'));
});

test('applyTraining: 失敗枠はゲインゼロ・疲労とリスクは通常通り加算', () => {
  const s = base(); // fatigue0,motivation3 → fail帯は r∈[0.10,0.20)
  const r = DT.engine.applyTraining(s, [{ genre: 'd2', method: 'novelty' }], () => 0.15);
  assert.strictEqual(r.results[0].tier, '失敗');
  assert.strictEqual(r.results[0].methodGain, 0);
  assert.strictEqual(r.results[0].genreGain, 0);
  assert.strictEqual(s.stats.novelty, 10);
  assert.strictEqual(s.genres.d2, 10);
  assert.strictEqual(s.fatigue, 4); // SLOTS.fatigue.novelty
  assert.strictEqual(s.injuryRisk, 12); // 10 + SLOTS.risk.novelty(2)
  assert.ok(r.messages[0].includes('失敗'));
});

test('applyTraining: routine枠はcomposition+のみ・ジャンル不変', () => {
  const s = base();
  const r = DT.engine.applyTraining(s, ['routine'], () => 0.3);
  assert.strictEqual(s.stats.composition, 11); // 10 + round(1*1*1)
  assert.deepStrictEqual(s.genres, { v1d: 10, h1d: 10, d2: 10, d3: 10 });
  assert.strictEqual(s.fatigue, 2); // SLOTS.fatigue.routine
  assert.strictEqual(s.injuryRisk, 11); // 10 + SLOTS.risk.routine(1)
  assert.strictEqual(r.results[0].tier, '成功');
  assert.strictEqual(r.results[0].genreGain, undefined);
  assert.ok(r.messages[0].startsWith('ルーチン構成（成功）'));
  assert.ok(r.messages[0].includes('演技構成 +1'));
});

test('applyTraining: 疲労は枠ごとに逐次加算される（次枠のrollTierは前枠の疲労を反映）', () => {
  const s = base();
  s.fatigue = 48; // 1枠目で+5→53、outcomeProbsが変化する境目をまたぐ
  const seenFatigue = [];
  const rng = () => { seenFatigue.push(s.fatigue); return 0.3; };
  DT.engine.applyTraining(s, [
    { genre: 'v1d', method: 'difficulty' },
    { genre: 'v1d', method: 'difficulty' }
  ], rng);
  assert.strictEqual(seenFatigue[0], 48); // 1枠目: 開始時点の疲労
  assert.strictEqual(seenFatigue[1], 53); // 2枠目: 1枠目の+5疲労が反映済み
});

test('applyTraining: 疲労逐次加算でoutcomeProbsが低下する(大成功率↓・失敗率↑)', () => {
  const s = base();
  s.fatigue = 48;
  const before = DT.engine.outcomeProbs(s);
  DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  const after = DT.engine.outcomeProbs(s);
  assert.ok(after.great < before.great);
  assert.ok(after.fail > before.fail);
});

test('applyTraining: rng消費は1枠につき1回（tier roll分のみ）', () => {
  const s = base();
  let calls = 0;
  const rng = () => { calls += 1; return 0.3; };
  DT.engine.applyTraining(s, [
    { genre: 'v1d', method: 'difficulty' },
    { genre: 'h1d', method: 'control' },
    'routine',
    { genre: 'd2', method: 'novelty' }
  ], rng);
  assert.strictEqual(calls, 4);
});

test('applyTraining: lastSlotsを保存する（参照ではなくコピー）', () => {
  const s = base();
  const slots = [
    { genre: 'v1d', method: 'difficulty' },
    'routine',
    { genre: 'h1d', method: 'control' },
    { genre: 'd2', method: 'novelty' }
  ];
  DT.engine.applyTraining(s, slots, () => 0.3);
  assert.deepStrictEqual(s.lastSlots, slots);
  assert.notStrictEqual(s.lastSlots, slots); // 配列自体は別物
  slots[0].method = 'control'; // 元配列を書き換えても影響しない
  assert.strictEqual(s.lastSlots[0].method, 'difficulty');
});

test('applyTraining: 大会月のroutineはブースト、difficultyはペナルティ+追加疲労、controlは倍化', () => {
  const sR = mk(5); // 1年OIDC月
  DT.engine.applyTraining(sR, ['routine'], () => 0.3);
  assert.strictEqual(sR.stats.composition, 12); // round(1*1*1)=1 → ×1.5 → round(1.5)=2 → 10+2
  const sD = mk(5);
  DT.engine.applyTraining(sD, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(sD.stats.difficulty, 11); // round(1*1*1)=1 → ×0.5 → round(0.5)=1 → 10+1
  assert.strictEqual(sD.genres.v1d, 11); // genreGainはタイミング補正なし: 10+1
  assert.strictEqual(sD.fatigue, 6); // SLOTS.fatigue.difficulty(5) + extraFatiguePerSlot(1)
  const sC = mk(5);
  DT.engine.applyTraining(sC, [{ genre: 'v1d', method: 'control' }], () => 0.3);
  assert.strictEqual(sC.stats.control, 12); // round(1*1*1)=1 → ×2 → 2 → 10+2
});

test('applyTraining: 大会月でも失敗枠のタイミング補正はゲインに影響しない（追加疲労は乗る）', () => {
  const s = mk(5);
  const r = DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.15); // 失敗
  assert.strictEqual(r.results[0].tier, '失敗');
  assert.strictEqual(s.stats.difficulty, 10);
  assert.strictEqual(s.fatigue, 6); // 5 + extraFatiguePerSlot(1) は失敗でも加算
});

test('applyTraining: 練習会月はroutine/noveltyの伸びが1.5倍、他は不変', () => {
  const sR = mk(3); // 練習会月
  DT.engine.applyTraining(sR, ['routine'], () => 0.3);
  assert.strictEqual(sR.stats.composition, 12); // 1 → ×1.5 → round(1.5)=2 → 10+2
  const sN = mk(3);
  DT.engine.applyTraining(sN, [{ genre: 'v1d', method: 'novelty' }], () => 0.3);
  assert.strictEqual(sN.stats.novelty, 12); // 1 → ×1.5 → 2 → 10+2
  assert.strictEqual(sN.genres.v1d, 11); // genreGainは補正なし
  const sD = mk(3);
  DT.engine.applyTraining(sD, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(sD.stats.difficulty, 11); // 対象外: round(1*1*1)=1のまま
});

test('applyTraining: 特別指導解放で成功枠ごとに+1（タイミング補正の後・フラット加算）', () => {
  const s = base();
  s.specialUnlocked = true;
  DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(s.stats.difficulty, 12); // round(1*1*1)=1 +1 = 2 → 10+2
  const sFail = base();
  sFail.specialUnlocked = true;
  DT.engine.applyTraining(sFail, [{ genre: 'v1d', method: 'difficulty' }], () => 0.15); // 失敗
  assert.strictEqual(sFail.stats.difficulty, 10); // +1は乗らない

  const sMeetup = mk(3);
  sMeetup.specialUnlocked = true;
  DT.engine.applyTraining(sMeetup, [{ genre: 'v1d', method: 'novelty' }], () => 0.3);
  assert.strictEqual(sMeetup.stats.novelty, 13); // round(1*1.5)=2 +1 = 3 → 10+3
});

test('applyTraining: 大成功でやる気+1、通常成功以下は不変', () => {
  const s = base();
  DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.0); // 大成功
  assert.strictEqual(s.motivation, 4);
});

// ---- applyAction: study/rest/injuredのみに縮小 ----
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

test('applyAction: 療養に専念', () => {
  const s = base();
  const r = DT.engine.applyAction(s, 'injured');
  assert.ok(r.messages.some(m => m.includes('療養')));
  assert.strictEqual(r.tier, null);
});

test('applyAction: 大会月は休養の回復量アップ(-45)', () => {
  const s = mk(5);
  s.fatigue = 60;
  DT.engine.applyAction(s, 'rest');
  assert.strictEqual(s.fatigue, 15);
});

test('applyAction: 大会翌月は休養が大幅回復(-55/リスク-20)', () => {
  const s = mk(6);
  s.fatigue = 80; s.injuryRisk = 40;
  s.results.push({ name: '1年 OIDC', type: 'oidc', division: 'overall', rank: 5, points: 8, turn: 5 });
  DT.engine.applyAction(s, 'rest');
  assert.strictEqual(s.fatigue, 25);
  assert.strictEqual(s.injuryRisk, 20);
});

test('applyAction: 通常月の休養は補正なし(-35/リスク-12)', () => {
  const s = mk(7);
  s.fatigue = 60; s.injuryRisk = 40;
  DT.engine.applyAction(s, 'rest');
  assert.strictEqual(s.fatigue, 25);
  assert.strictEqual(s.injuryRisk, 28);
});

// ---- endTurn: 既存挙動維持 ----
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

test('練習月はdidStudyがリセットされ学力減衰が復活する', () => {
  const s = DT.state.newCharacter(() => 0);
  DT.engine.applyAction(s, 'study', () => 0.3); // didStudy = true
  const studyAfter = s.study;
  DT.engine.applyTraining(s, ['routine', 'routine', 'routine', 'routine'], () => 0.3);
  assert.strictEqual(s.didStudy, false);
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.study, studyAfter - 2);
});

summary();
