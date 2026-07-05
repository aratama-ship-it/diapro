'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
const DT = globalThis.DT;

test('newCharacter: 競技能力は10〜35でランダム生成', () => {
  const cMax = DT.state.newCharacter(() => 0.999);
  DT.DATA.STATS.forEach(s => assert.strictEqual(cMax.stats[s.id], 35, s.id));
  const cMin = DT.state.newCharacter(() => 0);
  DT.DATA.STATS.forEach(s => assert.strictEqual(cMin.stats[s.id], 10, s.id));
});

test('newCharacter: 初期状態が正しい', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.study, 40); // rng=0.999なら60
  assert.strictEqual(c.turn, 1);
  assert.strictEqual(c.fatigue, 0);
  assert.strictEqual(c.injuryRisk, 10);
  assert.strictEqual(c.motivation, 3);
  assert.strictEqual(c.injuredTurns, 0);
  assert.strictEqual(c.lowStudyMonths, 0);
  assert.deepStrictEqual(c.results, []);
  assert.strictEqual(c.status, 'playing');
});

test('save/load/clear: ラウンドトリップできる', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  const c = DT.state.newCharacter(() => 0.5);
  DT.state.save(c, store);
  assert.deepStrictEqual(DT.state.load(store), c);
  DT.state.clear(store);
  assert.strictEqual(DT.state.load(store), null);
});

test('load: 壊れたセーブデータはnullを返す', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  store.setItem(DT.state.SAVE_KEY, '{broken json');
  assert.strictEqual(DT.state.load(store), null);
});

test('load: 旧バージョンのセーブキーを掃除する', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  store.setItem('diabolo-trainer-save-v1', '{}');
  store.setItem('diabolo-trainer-save-v2', '{}');
  store.setItem('diabolo-trainer-save-v3', '{}');
  DT.state.load(store);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v1'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v2'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v3'), null);
});

test('newCharacter: v2フィールド（名前・イベント進行・ライバル戦績）', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.name, '主人公');
  assert.strictEqual(c.coachEvents, 0);
  assert.strictEqual(c.specialUnlocked, false);
  assert.deepStrictEqual(c.rivalRecord, { shion: { win: 0, lose: 0 }, kaito: { win: 0, lose: 0 } });
});

test('newCharacter: 経歴で初期能力レンジが変わる（学力は共通）', () => {
  const hard = DT.state.newCharacter(() => 0, 'college');
  DT.DATA.STATS.forEach(s => assert.strictEqual(hard.stats[s.id], 5));
  assert.strictEqual(hard.study, 40);
  assert.strictEqual(hard.background, 'college');
  const easyMax = DT.state.newCharacter(() => 0.999, 'childhood');
  DT.DATA.STATS.forEach(s => assert.strictEqual(easyMax.stats[s.id], 55));
  assert.strictEqual(easyMax.study, 60);
  const def = DT.state.newCharacter(() => 0);
  assert.strictEqual(def.background, 'highschool');
  DT.DATA.STATS.forEach(s => assert.strictEqual(def.stats[s.id], 10));
});

summary();
