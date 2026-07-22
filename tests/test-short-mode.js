'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/short-mode.js');
require('../js/state.js');
require('../js/engine.js');
require('../js/contest.js');
const DT = globalThis.DT;

function memoryStore() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

test('ショート版は4月の練習月と5月のイベント月を1組にして全24ターン', () => {
  assert.strictEqual(DT.shortMode.PLAYER_TURNS, 24);
  for (let turn = 1; turn <= 48; turn += 2) {
    assert.strictEqual(DT.shortMode.isPracticeMonth(turn), true, 'turn=' + turn);
    assert.strictEqual(DT.shortMode.isEventMonth(turn + 1), true, 'turn=' + (turn + 1));
    assert.strictEqual(DT.shortMode.playerTurn(turn), (turn + 1) / 2);
  }
  assert.strictEqual(DT.shortMode.periodLabel(1, DT.engine.turnLabel), '1年生 4月 → 5月');
  assert.strictEqual(DT.shortMode.periodLabel(47, DT.engine.turnLabel), '4年生 2月 → 3月');
});

test('ショート版の練習ゲインは通常版の最終ゲインの正確に2倍', () => {
  const normal = DT.state.newCharacter(() => 0, 'highschool', 'standard');
  const short = DT.state.newCharacter(() => 0, 'highschool', 'short');
  normal.turn = short.turn = 13; // 1年目ボーナス外で比較
  const slots = [{ genre: 'h1d', method: 'difficulty' }, { genre: 'h1d', method: 'novelty' }, 'routine'];
  const n = DT.engine.applyTraining(normal, slots, () => 0.3);
  const s = DT.engine.applyTraining(short, slots, () => 0.3);
  n.results.forEach((r, i) => assert.strictEqual(s.results[i].gain, r.gain * 2, 'slot=' + i));
});

test('ショート版の勉強ゲインは通常版の正確に2倍で疲労は増やさない', () => {
  const normal = DT.state.newCharacter(() => 0, 'highschool', 'standard');
  const short = DT.state.newCharacter(() => 0, 'highschool', 'short');
  const normalStudy = normal.study;
  const shortStudy = short.study;
  const normalFatigue = normal.fatigue;
  const shortFatigue = short.fatigue;
  const n = DT.engine.applyAction(normal, 'study', () => 0.3);
  const s = DT.engine.applyAction(short, 'study', () => 0.3);
  assert.strictEqual(s.tier, n.tier);
  assert.strictEqual(short.study - shortStudy, (normal.study - normalStudy) * 2);
  assert.strictEqual(short.fatigue - shortFatigue, normal.fatigue - normalFatigue);
});

test('通常版とショート版は別のセーブ領域を使う', () => {
  const store = memoryStore();
  const normal = DT.state.newCharacter(() => 0, 'highschool', 'standard');
  const short = DT.state.newCharacter(() => 0, 'highschool', 'short');
  normal.name = '通常';
  short.name = '短縮';
  DT.state.save(normal, store);
  DT.state.save(short, store);
  assert.strictEqual(DT.state.load(store, 'standard').name, '通常');
  assert.strictEqual(DT.state.load(store, 'short').name, '短縮');
  DT.state.clear(store, 'short');
  assert.strictEqual(DT.state.load(store, 'short'), null);
  assert.strictEqual(DT.state.load(store, 'standard').name, '通常');
});

test('通常版とショート版は記録・カード図鑑も分離する', () => {
  const store = memoryStore();
  DT.state.addRecord({ name: '通常', totalPoints: 100 }, store, 'standard');
  DT.state.addRecord({ name: '短縮', totalPoints: 50 }, store, 'short');
  DT.state.addToCollection({ id: 'normal-card', cp: 10, totalPoints: 100 }, 1, store, 'standard');
  DT.state.addToCollection({ id: 'short-card', cp: 5, totalPoints: 50 }, 1, store, 'short');
  assert.deepStrictEqual(DT.state.loadRecords(store, 'standard').map(r => r.name), ['通常']);
  assert.deepStrictEqual(DT.state.loadRecords(store, 'short').map(r => r.name), ['短縮']);
  assert.deepStrictEqual(Object.keys(DT.state.loadCollection(store, 'standard')), ['normal-card']);
  assert.deepStrictEqual(Object.keys(DT.state.loadCollection(store, 'short')), ['short-card']);
});

test('通常版キャラクターの練習ゲインは従来値のまま', () => {
  const legacy = DT.state.newCharacter(() => 0, 'highschool');
  const standard = DT.state.newCharacter(() => 0, 'highschool', 'standard');
  legacy.turn = standard.turn = 13;
  const slot = [{ genre: 'h1d', method: 'control' }];
  const a = DT.engine.applyTraining(legacy, slot, () => 0.3);
  const b = DT.engine.applyTraining(standard, slot, () => 0.3);
  assert.strictEqual(legacy.gameMode, 'standard');
  assert.strictEqual(a.results[0].gain, b.results[0].gain);
});

summary();
