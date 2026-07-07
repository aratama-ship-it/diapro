'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
const DT = globalThis.DT;

function base() {
  return DT.state.newCharacter(() => 0); // skills全マス10, composition10, study40, fatigue0, motivation3
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

// やる気0-100化: motivation=100（絶好調上限）でgreat=0.25・fail=0.03（fail側はmin0.03でクランプ）
test('outcomeProbs: motivation100で大成功25%・失敗3%（fail側はmin0.03でクランプ）', () => {
  const s = base();
  s.motivation = 100;
  const p = DT.engine.outcomeProbs(s);
  assert.ok(Math.abs(p.great - 0.25) < 1e-9);
  assert.ok(Math.abs(p.fail - 0.03) < 1e-9);
});

// motivation=0（絶不調下限）でgreat=0.02（clampのmin）・fail=0.175
test('outcomeProbs: motivation0で大成功2%（クランプ）・失敗17.5%', () => {
  const s = base();
  s.motivation = 0;
  const p = DT.engine.outcomeProbs(s);
  assert.ok(Math.abs(p.great - 0.02) < 1e-9);
  assert.ok(Math.abs(p.fail - 0.175) < 1e-9);
});

test('motivationLabel: 帯の境界値（80/60/40/20/0）で正しいラベルを返す', () => {
  assert.strictEqual(DT.engine.motivationLabel(100), '絶好調');
  assert.strictEqual(DT.engine.motivationLabel(80), '絶好調');
  assert.strictEqual(DT.engine.motivationLabel(79), '好調');
  assert.strictEqual(DT.engine.motivationLabel(60), '好調');
  assert.strictEqual(DT.engine.motivationLabel(59), '普通');
  assert.strictEqual(DT.engine.motivationLabel(40), '普通');
  assert.strictEqual(DT.engine.motivationLabel(39), '不調');
  assert.strictEqual(DT.engine.motivationLabel(20), '不調');
  assert.strictEqual(DT.engine.motivationLabel(19), '絶不調');
  assert.strictEqual(DT.engine.motivationLabel(0), '絶不調');
});

// 絶好調ボーナス: motivation>=hotLine(80)のとき成功枠(失敗以外)のゲインに+1
// motivation80時点のoutcomeProbsはgreat0.19/fail0.055（great側のブースト込み）。
// rng0.3は成功帯(0.19〜0.19+0.055+((1-0.19-0.055)*0.6)=0.658)に入り「成功」。rng0.2は失敗帯[0.19,0.245)に入り「失敗」。
test('computeSlotGain経由: motivation80以上（絶好調）で成功枠ゲインに+1、失敗枠には乗らない', () => {
  const s = base();
  s.motivation = 80;
  const r = DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3); // 成功
  assert.strictEqual(r.results[0].tier, '成功');
  assert.strictEqual(r.results[0].gain, 3); // round(2*1*1)=2 +hotBonus(1) = 3
  assert.strictEqual(s.skills.v1d.difficulty, 13);

  const sFail = base();
  sFail.motivation = 80;
  const rFail = DT.engine.applyTraining(sFail, [{ genre: 'v1d', method: 'difficulty' }], () => 0.2); // 失敗
  assert.strictEqual(rFail.results[0].tier, '失敗');
  assert.strictEqual(sFail.skills.v1d.difficulty, 10); // 失敗はゲイン0のまま、hotBonusも乗らない

  const sBelow = base();
  sBelow.motivation = 79;
  const rBelow = DT.engine.applyTraining(sBelow, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(rBelow.results[0].gain, 2); // hotLine未満なのでボーナスなし
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

// ---- applyTraining: 検算ピン（プラン固定値） ----
// v4スキルグリッド化: comboスロットは単一マスskills[genre][method]にgridGain(2)を適用する
// （旧methodGain/genreGainの二重加算は廃止）。
// 全マス10・turn1・rng固定0.3（全枠成功）: [{h1d,control}]×4
// 各枠: gain=round(2×1.0×growthMult(現在値))。growthMultは10→12→14→16はいずれも<40なので常に1.0。
// → skills.h1d.control = 10 + 2×4 = 18
// fatigue = SLOTS.fatigue.control(3) × 4 = 12
// injuryRisk delta = (risk.control(1) + genreRisk.h1d(-1)) × 4 = 0 → 10のまま
test('applyTraining: 検算ピン 全枠{h1d,control}・rng0.3固定', () => {
  const s = base();
  const combo = { genre: 'h1d', method: 'control' };
  const r = DT.engine.applyTraining(s, [combo, combo, combo, combo], () => 0.3);
  assert.strictEqual(s.skills.h1d.control, 18);
  assert.strictEqual(s.fatigue, 12);
  assert.strictEqual(s.injuryRisk, 10);
  assert.strictEqual(s.didTrain, true);
  assert.strictEqual(r.results.length, 4);
  r.results.forEach(res => {
    assert.strictEqual(res.tier, '成功');
    assert.strictEqual(res.gain, 2);
  });
});

test('applyTraining: 基本ゲイン（単枠・成功、マス以外のジャンル/methodは不変）', () => {
  const s = base();
  const r = DT.engine.applyTraining(s, [{ genre: 'h1d', method: 'control' }], () => 0.3);
  assert.strictEqual(s.skills.h1d.control, 12); // 10 + round(2*1*1)
  assert.strictEqual(s.skills.h1d.difficulty, 10);
  assert.strictEqual(s.skills.v1d.control, 10);
  assert.strictEqual(s.composition, 10);
  assert.strictEqual(s.fatigue, 3); // SLOTS.fatigue.control
  assert.strictEqual(s.injuryRisk, 10); // 10 + risk.control(1) + genreRisk.h1d(-1) = 10+0=10
  assert.strictEqual(r.results[0].tier, '成功');
  assert.strictEqual(r.results[0].gain, 2);
  assert.ok(r.messages[0].includes('1ディアボロ水平軸'));
  assert.ok(r.messages[0].includes('操作安定度 +2') || r.messages[0].includes('+2'));
});

test('applyTraining: 失敗枠はゲインゼロ・疲労とリスクは通常通り加算', () => {
  const s = base(); // fatigue0,motivation3 → fail帯は r∈[0.10,0.20)
  const r = DT.engine.applyTraining(s, [{ genre: 'd2', method: 'novelty' }], () => 0.15);
  assert.strictEqual(r.results[0].tier, '失敗');
  assert.strictEqual(r.results[0].gain, 0);
  assert.strictEqual(s.skills.d2.novelty, 10);
  assert.strictEqual(s.fatigue, 4); // SLOTS.fatigue.novelty
  assert.strictEqual(s.injuryRisk, 11); // 10 + risk.novelty(1) + genreRisk.d2(0) = 11（d2は補正なし）
  assert.ok(r.messages[0].includes('失敗'));
});

test('applyTraining: routine枠はcompositionのみ加算・skillsは不変', () => {
  const s = base();
  const r = DT.engine.applyTraining(s, ['routine'], () => 0.3);
  assert.strictEqual(s.composition, 11); // 10 + round(1*1*1)
  DT.DATA.GENRES.forEach(g => {
    DT.DATA.METHODS.forEach(m => assert.strictEqual(s.skills[g.id][m.id], 10));
  });
  assert.strictEqual(s.fatigue, 0); // clamp(0 + SLOTS.fatigue.routine(-2), 0, 100)
  assert.strictEqual(s.injuryRisk, 9); // 10 + SLOTS.risk.routine(-1)
  assert.strictEqual(r.results[0].tier, '成功');
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

test('applyTraining: 疲労逐次加算でoutcomeProbsが低下する（大成功率↓・失敗率↑）', () => {
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
  assert.strictEqual(sR.composition, 12); // round(1*1*1)=1 → ×1.5 → round(1.5)=2 → 10+2
  const sD = mk(5);
  DT.engine.applyTraining(sD, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(sD.skills.v1d.difficulty, 11); // round(2*1*1)=2 → ×0.5 → round(1)=1 → 10+1
  assert.strictEqual(sD.fatigue, 6); // SLOTS.fatigue.difficulty(5) + extraFatiguePerSlot(1)
  const sC = mk(5);
  DT.engine.applyTraining(sC, [{ genre: 'v1d', method: 'control' }], () => 0.3);
  assert.strictEqual(sC.skills.v1d.control, 14); // round(2*1*1)=2 → ×2.0 → 4 → 10+4
});

test('applyTraining: 大会月でも失敗枠のタイミング補正はゲインに影響しない（追加疲労は乗る）', () => {
  const s = mk(5);
  const r = DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.15); // 失敗
  assert.strictEqual(r.results[0].tier, '失敗');
  assert.strictEqual(s.skills.v1d.difficulty, 10);
  assert.strictEqual(s.fatigue, 6); // 5 + extraFatiguePerSlot(1) は失敗でも加算
});

test('applyTraining: 練習会月はroutine/noveltyの伸びが1.5倍、他は不変', () => {
  const sR = mk(3); // 練習会月
  DT.engine.applyTraining(sR, ['routine'], () => 0.3);
  assert.strictEqual(sR.composition, 12); // 1 → ×1.5 → round(1.5)=2 → 10+2
  const sN = mk(3);
  DT.engine.applyTraining(sN, [{ genre: 'v1d', method: 'novelty' }], () => 0.3);
  assert.strictEqual(sN.skills.v1d.novelty, 13); // round(2*1*1)=2 → ×1.5 → round(3)=3 → 10+3
  const sD = mk(3);
  DT.engine.applyTraining(sD, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(sD.skills.v1d.difficulty, 12); // 対象外: round(2*1*1)=2のまま
});

// 二重丸めバグ回帰テスト（2026-07-07 実プレイ報告）: 練習会でroutineの成功と普通が
// どちらも+2に潰れていた。倍率を掛けてから最後に1回だけ丸めることでtierの差を保つ。
// 成功: round(1×1.0×1.0×1.5)=round(1.5)=2 / 普通: round(1×0.5×1.0×1.5)=round(0.75)=1
test('applyTraining: 練習会月でもroutineの成功(+2)と普通(+1)は区別される（二重丸め回帰）', () => {
  const sSuccess = mk(3); // 練習会月・rng0.3=成功
  DT.engine.applyTraining(sSuccess, ['routine'], () => 0.3);
  assert.strictEqual(sSuccess.composition, 12); // 10 + 2

  const sNormal = mk(3); // 練習会月・rng0.7=普通
  DT.engine.applyTraining(sNormal, ['routine'], () => 0.7);
  assert.strictEqual(sNormal.composition, 11); // 10 + 1（普通は成功より少ない）
});

test('applyTraining: 特別指導解放で成功枠ごとに+1（タイミング補正の後・フラット加算）', () => {
  const s = base();
  s.specialUnlocked = true;
  DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.3);
  assert.strictEqual(s.skills.v1d.difficulty, 13); // round(2*1*1)=2 +1 = 3 → 10+3
  const sFail = base();
  sFail.specialUnlocked = true;
  DT.engine.applyTraining(sFail, [{ genre: 'v1d', method: 'difficulty' }], () => 0.15); // 失敗
  assert.strictEqual(sFail.skills.v1d.difficulty, 10); // +1は乗らない

  const sMeetup = mk(3);
  sMeetup.specialUnlocked = true;
  DT.engine.applyTraining(sMeetup, [{ genre: 'v1d', method: 'novelty' }], () => 0.3);
  assert.strictEqual(sMeetup.skills.v1d.novelty, 14); // round(2*1.5)=3 +1 = 4 → 10+4
});

// バランス調整（スロット別疲労・怪我リスク改定）: routineは回復枠になったため、routineのみの月は
// 疲労・怪我リスクが下がる。fatigue/riskの加算はtier（成否）に関係なく一律に適用される（tier非依存）ことも
// 併せて検証する（1枠だけ失敗させても結果は同じ）。
// fatigue 30, injuryRisk 20 から routine×4: 各枠 fatigue-2 / risk-1 → 30-8=22, 20-4=16
test('applyTraining: routineのみの月は疲労・怪我リスクが回復する（tier非依存）', () => {
  const s = base();
  s.fatigue = 30;
  s.injuryRisk = 20;
  const r = DT.engine.applyTraining(s, ['routine', 'routine', 'routine', 'routine'], () => 0.3);
  assert.strictEqual(s.fatigue, 22); // 30 + (-2)*4 = 22
  assert.strictEqual(s.injuryRisk, 16); // 20 + (-1)*4 = 16
  assert.strictEqual(r.results.length, 4);

  // tier非依存の確認: 1枠目だけ失敗させても、fatigue/riskの最終値は変わらない
  const s2 = base();
  s2.fatigue = 30;
  s2.injuryRisk = 20;
  const seq = [0.15, 0.3, 0.3, 0.3]; // 1枠目のみ失敗(fail帯[0.10,0.20))、残り成功
  let i = 0;
  const rng = () => seq[i++];
  const r2 = DT.engine.applyTraining(s2, ['routine', 'routine', 'routine', 'routine'], rng);
  assert.strictEqual(r2.results[0].tier, '失敗');
  assert.strictEqual(s2.fatigue, 22);
  assert.strictEqual(s2.injuryRisk, 16);
});

// ジャンル別怪我リスク補正（ユーザー設計）: 1D垂直軸は+1、1D水平軸は-1。同じmethod(control)でジャンルだけ
// 変えると、v1dの方がh1dよりinjuryRiskが大きく積み上がることを確認する。
// v1d×4: 10 + 4×(risk.control(1)+genreRisk.v1d(1)) = 10+4×2=18
// h1d×4: 10 + 4×(risk.control(1)+genreRisk.h1d(-1)) = 10+4×0=10
test('applyTraining: ジャンル別怪我リスク補正でv1dはh1dよりリスクが積み上がる', () => {
  const sV = base();
  const comboV = { genre: 'v1d', method: 'control' };
  DT.engine.applyTraining(sV, [comboV, comboV, comboV, comboV], () => 0.3);
  assert.strictEqual(sV.injuryRisk, 18);

  const sH = base();
  const comboH = { genre: 'h1d', method: 'control' };
  DT.engine.applyTraining(sH, [comboH, comboH, comboH, comboH], () => 0.3);
  assert.strictEqual(sH.injuryRisk, 10);

  assert.ok(sV.injuryRisk > sH.injuryRisk, 'v1dの方がh1dよりリスクが高いはず');
});

test('applyTraining: 大成功でやる気+3、通常成功以下は不変', () => {
  const s = base();
  DT.engine.applyTraining(s, [{ genre: 'v1d', method: 'difficulty' }], () => 0.0); // 大成功
  assert.strictEqual(s.motivation, 53); // 50 + 3（振れ幅減衰: 二極化対策で±5→±3）
});

test('applyTraining: routineスロットのメッセージは「ルーチン構成（成功）: 演技構成 +N」形式', () => {
  const s = base();
  const r = DT.engine.applyTraining(s, ['routine'], () => 0.3);
  assert.strictEqual(r.messages[0], 'ルーチン構成（成功）: 演技構成 +1');
});

// ---- applyAction: study/rest/injuredのみに縮小 ----
test('applyAction: 休養で疲労-35・怪我リスク-12・やる気+8', () => {
  const s = base();
  s.fatigue = 50;
  s.injuryRisk = 30;
  DT.engine.applyAction(s, 'rest');
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.injuryRisk, 18);
  assert.strictEqual(s.motivation, 58); // 50 + 8
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
  assert.strictEqual(s.motivation, 42); // 平均回帰は50で±0、その後怪我で50-8
  assert.ok(r.events.some(e => e.includes('怪我')));
});

// やる気の平均回帰: endTurn冒頭でround((50-motivation)*reversion)だけ50へ引き戻される
test('endTurn: やる気の平均回帰（0→5、100→95、50は不変）', () => {
  const s0 = base();
  s0.motivation = 0;
  DT.engine.endTurn(s0, () => 0.99); // didTrain=falseなので怪我判定なし
  assert.strictEqual(s0.motivation, 5); // 0 + round(50*0.1) = 5

  const s100 = base();
  s100.motivation = 100;
  DT.engine.endTurn(s100, () => 0.99);
  assert.strictEqual(s100.motivation, 95); // 100 + round(-50*0.1) = 95

  const s50 = base();
  s50.motivation = 50;
  DT.engine.endTurn(s50, () => 0.99);
  assert.strictEqual(s50.motivation, 50); // round(0*0.1) = 0で不変
});

// 二極化ガード: 他のmotivation変動なしで0から10ヶ月endTurnを回せば、平均回帰だけで30以上へ復帰する
test('endTurn: 平均回帰の累積で0から10ヶ月後にやる気30以上へ復帰する（二極化ガード）', () => {
  const s = base();
  s.motivation = 0;
  s.study = 100; // 学業系の副作用（退学・赤点）を避ける。didTrain=falseなので怪我判定もなし
  for (let i = 0; i < 10; i++) {
    s.didStudy = true; // 学力減衰を無効化
    DT.engine.endTurn(s, () => 0.99);
  }
  assert.ok(s.motivation >= 30, '10ヶ月の平均回帰後は30以上のはず: ' + s.motivation);
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

// ---- 定期テスト（EXAMS） ----
test('endTurn: 定期テスト月に学力40未満なら赤点・2ヶ月補習', () => {
  const s = base();
  s.turn = 3;
  s.study = 30;
  s.didStudy = true; // 学力減衰を無効化してピン留め
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.banTurns, 2);
  assert.ok(r.events.some(e => e.includes('赤点')), JSON.stringify(r.events));
});

test('endTurn: 定期テスト月に学力40以上なら合格・補習なし', () => {
  const s = base();
  s.turn = 3;
  s.study = 50;
  s.didStudy = true;
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.banTurns, 0);
  assert.ok(r.events.some(e => e.includes('合格')), JSON.stringify(r.events));
});

test('endTurn: 非テスト月は定期テスト判定なし', () => {
  const s = base();
  s.turn = 4;
  s.study = 10;
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.ok(!r.events.some(e => e.includes('赤点') || e.includes('合格')), JSON.stringify(r.events));
});

test('endTurn: banTurnsは毎ターン1ずつ減り、0になった月に終了イベントが出る', () => {
  const s = base();
  s.banTurns = 2;
  const r1 = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.banTurns, 1);
  assert.ok(!r1.events.some(e => e.includes('補習期間が終わった')));
  const r2 = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.banTurns, 0);
  assert.ok(r2.events.some(e => e.includes('補習期間が終わった')));
});

test('endTurn: 補習中でも学力減衰・退学カウントは通常どおり進む', () => {
  const s = base();
  s.banTurns = 2;
  s.study = 10;
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 1);
  DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.lowStudyMonths, 2);
  const r = DT.engine.endTurn(s, () => 0.99);
  assert.strictEqual(s.status, 'expelled');
  assert.ok(r.events.some(e => e.includes('退学')));
});

summary();
