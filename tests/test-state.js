'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
const DT = globalThis.DT;

test('newCharacter: 種別スタッツは経歴レンジでランダム生成', () => {
  const cMax = DT.state.newCharacter(() => 0.999);
  DT.DATA.STATS.forEach(s => assert.strictEqual(cMax.stats[s.id], 35, s.id));
  const cMin = DT.state.newCharacter(() => 0);
  DT.DATA.STATS.forEach(s => assert.strictEqual(cMin.stats[s.id], 10, s.id));
});

test('newCharacter: ジャンル習熟も同じ経歴レンジでランダム生成される', () => {
  const cMax = DT.state.newCharacter(() => 0.999);
  DT.DATA.GENRES.forEach(g => assert.strictEqual(cMax.genres[g.id], 35, g.id));
  const cMin = DT.state.newCharacter(() => 0);
  DT.DATA.GENRES.forEach(g => assert.strictEqual(cMin.genres[g.id], 10, g.id));
});

test('newCharacter: rng消費順はSTATS(4件)→GENRES(4件)→study の順', () => {
  // rngが呼ばれるたびに0,1,2,...を返す固定シーケンスを与え、
  // stats.difficulty/novelty/control/composition → genres.v1d/h1d/d2/d3 → study の順で
  // 消費されることをピン留めする。statMin=10, statSpread=26 (highschool既定)。
  const seq = [];
  for (let i = 0; i < 20; i++) seq.push(i / 20); // 0, 0.05, 0.10, ...
  let idx = 0;
  const rng = () => seq[idx++];
  const c = DT.state.newCharacter(rng);
  const bg = DT.DATA.BACKGROUNDS.find(b => b.id === 'highschool');
  const expectStat = (i) => bg.statMin + Math.floor(seq[i] * bg.statSpread);
  DT.DATA.STATS.forEach((s, i) => assert.strictEqual(c.stats[s.id], expectStat(i), s.id + ' の消費順'));
  DT.DATA.GENRES.forEach((g, i) => assert.strictEqual(c.genres[g.id], expectStat(DT.DATA.STATS.length + i), g.id + ' の消費順'));
  // studyはSTATS+GENRESの8回の後、9番目のrng呼び出し
  assert.strictEqual(c.study, 40 + Math.floor(seq[8] * 21));
  assert.strictEqual(idx, 9); // ちょうど9回消費（余分な呼び出しがない）
});

test('newCharacter: 初期状態が正しい（lastSlotsは空配列）', () => {
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
  assert.deepStrictEqual(c.lastSlots, []);
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

test('SAVE_KEYはv5・OLD_KEYSにv1〜v4を含む', () => {
  assert.strictEqual(DT.state.SAVE_KEY, 'diabolo-trainer-save-v5');
});

test('load: 旧バージョン(v1〜v4)のセーブキーを掃除する', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  store.setItem('diabolo-trainer-save-v1', '{}');
  store.setItem('diabolo-trainer-save-v2', '{}');
  store.setItem('diabolo-trainer-save-v3', '{}');
  store.setItem('diabolo-trainer-save-v4', '{}');
  DT.state.load(store);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v1'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v2'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v3'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v4'), null);
});

test('newCharacter: v2フィールド（名前・イベント進行・ライバル戦績）', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.name, '主人公');
  assert.strictEqual(c.coachEvents, 0);
  assert.strictEqual(c.specialUnlocked, false);
  assert.deepStrictEqual(c.rivalRecord, { shion: { win: 0, lose: 0 }, kaito: { win: 0, lose: 0 } });
});

test('newCharacter: 経歴で初期能力レンジが変わる（stats/genres共通・学力は共通）', () => {
  const hard = DT.state.newCharacter(() => 0, 'college');
  DT.DATA.STATS.forEach(s => assert.strictEqual(hard.stats[s.id], 5));
  DT.DATA.GENRES.forEach(g => assert.strictEqual(hard.genres[g.id], 5));
  assert.strictEqual(hard.study, 40);
  assert.strictEqual(hard.background, 'college');
  const easyMax = DT.state.newCharacter(() => 0.999, 'childhood');
  DT.DATA.STATS.forEach(s => assert.strictEqual(easyMax.stats[s.id], 55));
  DT.DATA.GENRES.forEach(g => assert.strictEqual(easyMax.genres[g.id], 55));
  assert.strictEqual(easyMax.study, 60);
  const def = DT.state.newCharacter(() => 0);
  assert.strictEqual(def.background, 'highschool');
  DT.DATA.STATS.forEach(s => assert.strictEqual(def.stats[s.id], 10));
  DT.DATA.GENRES.forEach(g => assert.strictEqual(def.genres[g.id], 10));
});

summary();
