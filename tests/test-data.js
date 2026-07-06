'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/engine.js');
const DT = globalThis.DT;

test('DATA: 練習の技術軸はMETHODS3項目・演技構成はCOMPOSITIONへ分離', () => {
  assert.strictEqual(DT.DATA.METHODS.length, 3);
  const ids = DT.DATA.METHODS.map(s => s.id);
  assert.deepStrictEqual(ids, ['difficulty', 'novelty', 'control']);
  assert.strictEqual(DT.DATA.COMPOSITION.id, 'composition');
  assert.strictEqual(DT.DATA.STATS, undefined, '旧STATSは削除されている');
});

test('DATA: GENRESはジャンル習熟4項目で表示順は1D水平→1D垂直→2D→3D以上・DIVISIONSのid(v1d/h1d/d2/d3)と一致', () => {
  assert.strictEqual(DT.DATA.GENRES.length, 4);
  const ids = DT.DATA.GENRES.map(g => g.id);
  assert.deepStrictEqual(ids, ['h1d', 'v1d', 'd2', 'd3']);
  ['v1d', 'h1d', 'd2', 'd3'].forEach(id => {
    assert.ok(DT.DATA.DIVISIONS.some(d => d.id === id), id + ' がDIVISIONSに存在しない');
  });
});

test('DATA: SLOTSは毎月4枠でゲイン/疲労/リスクを定義（v4: methodGain/genreGain→gridGainに統合）', () => {
  const slots = DT.DATA.SLOTS;
  assert.strictEqual(slots.perMonth, 4);
  assert.strictEqual(slots.gridGain, 2);
  assert.strictEqual(slots.methodGain, undefined, '旧methodGainは削除されている');
  assert.strictEqual(slots.genreGain, undefined, '旧genreGainは削除されている');
  assert.strictEqual(slots.routineGain, 1);
  // バランス調整（スロット別疲労・怪我リスク改定）: ルーチン構成を回復枠に、高難度技のリスクを引き上げ
  assert.deepStrictEqual(slots.fatigue, { difficulty: 5, novelty: 4, control: 3, routine: -2 });
  assert.deepStrictEqual(slots.risk, { difficulty: 3, novelty: 1, control: 1, routine: -1 });
  // fatigue/riskのキーはmethod id(3つ)+routineのみ
  const methodIds = DT.DATA.METHODS.map(s => s.id);
  assert.deepStrictEqual(Object.keys(slots.fatigue).sort(), methodIds.concat('routine').sort());
  assert.deepStrictEqual(Object.keys(slots.risk).sort(), methodIds.concat('routine').sort());
});

test('DATA: SLOTS新セマンティクス（ルーチン構成=回復枠、高難度技=最高リスク）', () => {
  const slots = DT.DATA.SLOTS;
  assert.ok(slots.fatigue.routine < 0, 'routineの疲労は回復（負値）であるべき');
  assert.ok(slots.risk.routine < 0, 'routineのリスクは回復（負値）であるべき');
  const riskValues = [slots.risk.difficulty, slots.risk.novelty, slots.risk.control, slots.risk.routine];
  assert.strictEqual(slots.risk.difficulty, Math.max(...riskValues), 'difficultyのリスクが4項目中最大であるべき');
});

// バランス調整（ジャンル別怪我リスク補正）: 1D垂直軸は落下リスクが高いため最大(+1)、1D水平軸は
// 最も安全なため最小(-1)、2D/3Dは中間で補正なし(0)。GENRESの全idにgenreRiskエントリが存在すること。
test('DATA: SLOTS.genreRiskはv1dが最大・h1dが最小(負値)・d2/d3は0・GENRES全idに定義済み', () => {
  const genreRisk = DT.DATA.SLOTS.genreRisk;
  assert.ok(genreRisk, 'genreRiskが未定義');
  DT.DATA.GENRES.forEach(g => {
    assert.ok(Object.prototype.hasOwnProperty.call(genreRisk, g.id), g.id + ' のgenreRiskが未定義');
  });
  const values = DT.DATA.GENRES.map(g => genreRisk[g.id]);
  assert.strictEqual(genreRisk.v1d, Math.max(...values), 'v1dのgenreRiskが最大であるべき');
  assert.strictEqual(genreRisk.h1d, Math.min(...values), 'h1dのgenreRiskが最小であるべき');
  assert.ok(genreRisk.h1d < 0, 'h1dのgenreRiskは負値であるべき');
  assert.strictEqual(genreRisk.d2, 0, 'd2は補正なし(0)であるべき');
  assert.strictEqual(genreRisk.d3, 0, 'd3は補正なし(0)であるべき');
});

test('DATA: SCORINGは総合とスペシャリストの2方式・base/gate/scale追加（合計配点100維持）', () => {
  const o = DT.DATA.SCORING.overall;
  assert.deepStrictEqual(o.weights, { difficulty: 30, variety: 10, control: 10, novelty: 10, composition: 20 });
  assert.strictEqual(Object.values(o.weights).reduce((a, v) => a + v, 0), 80); // 基礎点20を足して100

  const s = DT.DATA.SCORING.specialist;
  assert.deepStrictEqual(s.weights, { difficulty: 45, control: 15, novelty: 30, composition: 10 });
  assert.strictEqual(Object.values(s.weights).reduce((a, v) => a + v, 0), 100);

  const base = DT.DATA.SCORING.base;
  assert.strictEqual(base.elements, 4);
  assert.strictEqual(base.perElement, 5);
  assert.strictEqual(base.threshold, 25);
  assert.strictEqual(base.stat, undefined, 'baseはジャンル閾値化されstat参照を持たない');
  assert.strictEqual(Object.values(o.weights).reduce((a, v) => a + v, 0) + base.elements * base.perElement, 100);

  const gate = DT.DATA.SCORING.gate;
  assert.strictEqual(gate.min, 0.4);
  assert.strictEqual(gate.span, 0.6);
  assert.strictEqual(gate.min + gate.span, 1); // 満習熟でゲート1.0

  const scale = DT.DATA.SCORING.scale;
  assert.strictEqual(scale.base, 30);
  assert.strictEqual(scale.mult, 0.7);
});

test('DATA: TRAININGSは削除されている（スロット制に置換）', () => {
  assert.strictEqual(DT.DATA.TRAININGS, undefined);
});

test('DATA: DIVISIONSは総合1＋スペシャリスト4', () => {
  assert.strictEqual(DT.DATA.DIVISIONS.length, 5);
  assert.strictEqual(DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').length, 4);
  assert.strictEqual(DT.DATA.DIVISIONS[0].id, 'overall');
});

test('DATA: 大会はOIDC(8月)×4とAJDC(3月)×4', () => {
  assert.strictEqual(DT.DATA.CONTESTS.length, 8);
  assert.deepStrictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'oidc').map(c => c.turn), [5, 17, 29, 41]);
  assert.deepStrictEqual(DT.DATA.CONTESTS.filter(c => c.type === 'ajdc').map(c => c.turn), [12, 24, 36, 48]);
});

test('DATA: 経歴は4種で初期値レンジが昇順', () => {
  assert.strictEqual(DT.DATA.BACKGROUNDS.length, 4);
  assert.ok(DT.DATA.BACKGROUNDS.some(b => b.id === 'highschool'));
  for (let i = 1; i < DT.DATA.BACKGROUNDS.length; i++) {
    assert.ok(DT.DATA.BACKGROUNDS[i].statMin > DT.DATA.BACKGROUNDS[i - 1].statMin);
  }
});

test('DATA: キャラ5人とライバル2人が定義されている', () => {
  assert.strictEqual(DT.DATA.CHARACTERS.length, 5);
  assert.strictEqual(DT.DATA.RIVALS.length, 2);
  assert.deepStrictEqual(DT.DATA.RIVALS.map(r => r.id), ['shion', 'kaito']);
  assert.deepStrictEqual(DT.DATA.RIVALS[0].contests, ['oidc', 'ajdc']);
  assert.deepStrictEqual(DT.DATA.RIVALS[1].contests, ['ajdc', 'worlds']);
});

test('DATA: イベント定義の整合性（stat参照はMETHODS∪{composition}のみ、variety/fundamentals不在）', () => {
  const ev = DT.DATA.EVENTS;
  assert.ok(ev.charEvents.length >= 10);
  assert.ok(ev.happenings.length >= 5);
  const charIds = DT.DATA.CHARACTERS.map(c => c.id);
  const validStatIds = DT.DATA.METHODS.map(s => s.id).concat(DT.DATA.COMPOSITION.id);
  ev.charEvents.forEach(e => {
    assert.ok(charIds.includes(e.char), e.id + ' のcharが未定義');
    assert.strictEqual(e.choices.length, 2, e.id);
    e.choices.forEach(c => {
      assert.ok(c.label && c.result, e.id);
      if (c.effects.stat) {
        assert.ok(validStatIds.includes(c.effects.stat.id), e.id + ' の stat.id が未定義: ' + c.effects.stat.id);
        assert.ok(!['variety', 'fundamentals'].includes(c.effects.stat.id), e.id + ' が廃止statを参照している');
      }
    });
  });
  ev.happenings.forEach(h => {
    assert.ok(h.text && h.effects, h.id);
    if (h.effects.stat) {
      assert.ok(validStatIds.includes(h.effects.stat.id), h.id + ' の stat.id が未定義: ' + h.effects.stat.id);
    }
  });
});

test('DATA: 世界大会は毎年11月・魁人も出場', () => {
  assert.deepStrictEqual(DT.DATA.WORLDS_TURNS, [8, 20, 32, 44]);
  DT.DATA.WORLDS_TURNS.forEach(t => {
    assert.ok(!DT.DATA.CONTESTS.some(c => c.turn === t), 'CONTESTS衝突: ' + t);
  });
  const kaito = DT.DATA.RIVALS.find(r => r.id === 'kaito');
  assert.deepStrictEqual(kaito.contests, ['ajdc', 'worlds']);
});

test('DATA: TIMING補正のキーはmethod id(difficulty/control)とroutine', () => {
  const cm = DT.DATA.TIMING.contestMonth;
  assert.ok(cm.routine, 'routine');
  assert.strictEqual(cm.routine.gainMult, 1.5);
  assert.ok(cm.difficulty, 'difficulty');
  assert.strictEqual(cm.difficulty.gainMult, 0.5);
  assert.ok(cm.difficulty.extraFatiguePerSlot > 0);
  assert.ok(cm.control, 'control');
  assert.strictEqual(cm.control.gainMult, 2.0);
  assert.strictEqual(cm.novelty, undefined, 'noveltyは大会月補正の対象外');
  assert.ok(cm.restExtra > 0 && DT.DATA.TIMING.afterContest.restExtra > cm.restExtra);
});

test('DATA: 練習会は大会・世界大会と衝突せず、boostsはroutine/noveltyのみ', () => {
  const mu = DT.DATA.MEETUP;
  for (let t = 1; t <= DT.DATA.TOTAL_TURNS; t++) {
    if (t % mu.interval !== mu.offset) continue;
    assert.ok(!DT.DATA.CONTESTS.some(c => c.turn === t), '大会衝突: ' + t);
    assert.ok(!DT.DATA.WORLDS_TURNS.includes(t), '世界大会衝突: ' + t);
  }
  assert.deepStrictEqual(mu.boosts, { routine: 1.5, novelty: 1.5 });
});

test('DATA: 定期テストは6月/12月の8回、赤点ライン40・補習2ヶ月、CONTESTS/WORLDS_TURNSと非衝突', () => {
  const exams = DT.DATA.EXAMS;
  assert.strictEqual(exams.turns.length, 8);
  assert.deepStrictEqual(exams.turns, [3, 9, 15, 21, 27, 33, 39, 45]);
  exams.turns.forEach(t => {
    const label = DT.engine.turnLabel(t);
    assert.ok(label.endsWith('6月') || label.endsWith('12月'), 'turn=' + t + ' は6月/12月ではない: ' + label);
  });
  assert.strictEqual(exams.passLine, 40);
  assert.strictEqual(exams.banMonths, 2);
  exams.turns.forEach(t => {
    assert.ok(!DT.DATA.CONTESTS.some(c => c.turn === t), 'CONTESTS衝突: ' + t);
    assert.ok(!DT.DATA.WORLDS_TURNS.includes(t), 'WORLDS_TURNS衝突: ' + t);
  });
});

summary();
