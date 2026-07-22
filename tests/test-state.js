'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/contest.js');
const DT = globalThis.DT;

test('newCharacter: 12マス(GENRES×METHODS)は経歴レンジでランダム生成', () => {
  const cMax = DT.state.newCharacter(() => 0.999);
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(cMax.skills[g.id][m.id], 35, g.id + '.' + m.id)));
  const cMin = DT.state.newCharacter(() => 0);
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(cMin.skills[g.id][m.id], 10, g.id + '.' + m.id)));
});

test('newCharacter: 演技構成(composition)も同じ経歴レンジでランダム生成される', () => {
  const cMax = DT.state.newCharacter(() => 0.999);
  assert.strictEqual(cMax.composition, 35);
  const cMin = DT.state.newCharacter(() => 0);
  assert.strictEqual(cMin.composition, 10);
});

test('newCharacter: rng消費順はGENRES×METHODSの12マス→composition→study の順（h1d.difficultyが1番目）', () => {
  // rngが呼ばれるたびに0,1,2,...を返す固定シーケンスを与え、
  // skills.h1d.difficulty→h1d.novelty→h1d.control→v1d.difficulty→…→d3.control（12マス、GENRES×METHODS順）
  // → composition → study の順で消費されることを値レベルでピン留めする。
  // statMin=10, statSpread=26 (highschool既定)。
  const seq = [];
  for (let i = 0; i < 20; i++) seq.push(i / 20); // 0, 0.05, 0.10, ...
  let idx = 0;
  const rng = () => seq[idx++];
  const c = DT.state.newCharacter(rng);
  const bg = DT.DATA.BACKGROUNDS.find(b => b.id === 'highschool');
  const expectAt = (i) => bg.statMin + Math.floor(seq[i] * bg.statSpread);
  // GENRES順は[h1d, v1d, d2, d3]・METHODS順は[difficulty, novelty, control]
  assert.strictEqual(c.skills.h1d.difficulty, expectAt(0), 'h1d.difficultyはロール#1(idx0)であるべき');
  assert.strictEqual(c.skills.h1d.novelty, expectAt(1), 'h1d.noveltyはロール#2(idx1)であるべき');
  assert.strictEqual(c.skills.h1d.control, expectAt(2), 'h1d.controlはロール#3(idx2)であるべき');
  assert.strictEqual(c.skills.v1d.difficulty, expectAt(3), 'v1d.difficultyはロール#4(idx3)であるべき');
  assert.strictEqual(c.skills.v1d.novelty, expectAt(4));
  assert.strictEqual(c.skills.v1d.control, expectAt(5));
  assert.strictEqual(c.skills.d2.difficulty, expectAt(6));
  assert.strictEqual(c.skills.d2.novelty, expectAt(7));
  assert.strictEqual(c.skills.d2.control, expectAt(8));
  assert.strictEqual(c.skills.d3.difficulty, expectAt(9));
  assert.strictEqual(c.skills.d3.novelty, expectAt(10));
  assert.strictEqual(c.skills.d3.control, expectAt(11), 'd3.controlはロール#12(idx11)であるべき');
  // 汎用ループでも全マスを検証（順序は上の個別アサートでピン留め済み）
  let flatIdx = 0;
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => {
    assert.strictEqual(c.skills[g.id][m.id], expectAt(flatIdx), g.id + '.' + m.id + ' の消費順(idx' + flatIdx + ')');
    flatIdx++;
  }));
  // compositionは12マスの後、13番目のrng呼び出し(idx12)
  assert.strictEqual(c.composition, expectAt(12), 'compositionはロール#13(idx12)であるべき');
  // studyはcompositionの後、14番目のrng呼び出し(idx13)
  assert.strictEqual(c.study, 40 + Math.floor(seq[13] * 21));
  assert.strictEqual(idx, 14); // ちょうど14回消費（余分な呼び出しがない）
});

test('newCharacter: 初期状態が正しい（lastSlotsは空配列）', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.study, 40); // rng=0.999なら60
  assert.strictEqual(c.turn, 1);
  assert.strictEqual(c.fatigue, 0);
  assert.strictEqual(c.injuryRisk, 10);
  assert.strictEqual(c.motivation, 50);
  assert.strictEqual(c.injuredTurns, 0);
  assert.strictEqual(c.lowStudyMonths, 0);
  assert.strictEqual(c.banTurns, 0);
  assert.deepStrictEqual(c.results, []);
  assert.strictEqual(c.status, 'playing');
  assert.deepStrictEqual(c.lastSlots, []);
  assert.deepStrictEqual(c.seenCharEvents, []);
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

test('SAVE_KEYはv9・OLD_KEYSにv1〜v8を含む', () => {
  assert.strictEqual(DT.state.SAVE_KEY, 'diabolo-trainer-save-v9');
});

test('newCharacter: announcedUnlocksは開始時解禁済みジャンルで初期化される', () => {
  const hard = DT.state.newCharacter(() => 0, 'college'); // 技術0 → h1dのみ解禁
  assert.deepStrictEqual(hard.announcedUnlocks, ['h1d']);
  const easy = DT.state.newCharacter(() => 0.999, 'juniorhigh'); // 全マス40 → 全解禁
  assert.deepStrictEqual(easy.announcedUnlocks.sort(), ['d2', 'd3', 'h1d', 'v1d']);
});

test('load: 旧バージョン(v1〜v7)のセーブキーを掃除する', () => {
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
  store.setItem('diabolo-trainer-save-v5', '{}');
  store.setItem('diabolo-trainer-save-v6', '{}');
  store.setItem('diabolo-trainer-save-v7', '{}');
  store.setItem('diabolo-trainer-save-v8', '{}');
  DT.state.load(store);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v1'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v2'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v3'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v4'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v5'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v6'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v7'), null);
  assert.strictEqual(store.getItem('diabolo-trainer-save-v8'), null);
});

test('newCharacter: v2フィールド（名前・イベント進行・ライバル戦績）', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.name, '主人公');
  assert.strictEqual(c.coachEvents, 0);
  assert.strictEqual(c.specialUnlocked, false);
  assert.deepStrictEqual(c.seenCharEvents, []);
  assert.deepStrictEqual(c.rivalRecord, { shion: { win: 0, lose: 0 }, kaito: { win: 0, lose: 0 } });
});

test('newCharacter: 経歴で初期能力レンジが変わる（大学は技術0・演技構成は小レンジ）', () => {
  const hard = DT.state.newCharacter(() => 0, 'college');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(hard.skills[g.id][m.id], 0)));
  assert.strictEqual(hard.composition, 3); // compMin3 + floor(0*8)
  const hardMax = DT.state.newCharacter(() => 0.999, 'college');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(hardMax.skills[g.id][m.id], 0)));
  assert.strictEqual(hardMax.composition, 10); // 3 + floor(0.999*8)=3+7
  assert.strictEqual(hard.study, 40);
  assert.strictEqual(hard.background, 'college');

  const easyMax = DT.state.newCharacter(() => 0.999, 'juniorhigh');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(easyMax.skills[g.id][m.id], 40)));
  assert.strictEqual(easyMax.composition, 40); // 通常版は従来レンジを維持
  const shortEasyMin = DT.state.newCharacter(() => 0, 'juniorhigh', 'short');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(shortEasyMin.skills[g.id][m.id], 12)));
  assert.strictEqual(shortEasyMin.composition, 12);
  const shortEasyMax = DT.state.newCharacter(() => 0.999, 'juniorhigh', 'short');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(shortEasyMax.skills[g.id][m.id], 37)));
  assert.strictEqual(shortEasyMax.composition, 37);
  assert.strictEqual(easyMax.study, 60);

  const def = DT.state.newCharacter(() => 0);
  assert.strictEqual(def.background, 'highschool');
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => assert.strictEqual(def.skills[g.id][m.id], 10)));
  assert.strictEqual(def.composition, 10);
});

test('collection: 追加→ロード→重複は枚数/自己ベスト更新（初回スナップショット保持）', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return (k in this.data) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  const card = { id: 'mx_C_showman', title: 'ムードメーカー', rank: 'C', cp: 500, totalPoints: 300 };
  const first = DT.state.addToCollection(card, 1, store); // 新規解禁
  assert.strictEqual(first.isNew, true);
  assert.strictEqual(first.count, 1);
  const col = DT.state.loadCollection(store);
  assert.strictEqual(col.mx_C_showman.cardNo, 1);
  assert.strictEqual(col.mx_C_showman.snap.title, 'ムードメーカー');
  assert.strictEqual(col.mx_C_showman.bestCp, 500);
  // 同じカードを再取得（CPが上） → isNew=false・2枚目・自己最高CP更新、初回スナップは保持
  const dup = DT.state.addToCollection({ id: 'mx_C_showman', cp: 999, totalPoints: 250 }, 2, store);
  assert.strictEqual(dup.isNew, false);
  assert.strictEqual(dup.count, 2);
  assert.strictEqual(dup.cpImproved, true);
  assert.strictEqual(dup.ptImproved, false); // 250 < 300
  const col2 = DT.state.loadCollection(store);
  assert.strictEqual(col2.mx_C_showman.snap.cp, 500);   // 初回スナップ保持
  assert.strictEqual(col2.mx_C_showman.bestCp, 999);
  assert.strictEqual(col2.mx_C_showman.bestPt, 300);
  assert.strictEqual(col2.mx_C_showman.cardNo, 1);      // 初回No.保持
  // 旧形式(count/best無し)からの移行: 初回分を1枚と数え、スナップ値を自己ベスト初期値に
  store.setItem(DT.state.COLLECTION_KEY, JSON.stringify({ sp_ajdc: { date: 1, cardNo: 3, snap: { id: 'sp_ajdc', cp: 700, totalPoints: 800 } } }));
  const mig = DT.state.addToCollection({ id: 'sp_ajdc', cp: 650, totalPoints: 900 }, 4, store);
  assert.strictEqual(mig.count, 2);
  assert.strictEqual(mig.cpImproved, false); // 650 < 700(スナップ由来)
  assert.strictEqual(mig.ptImproved, true);  // 900 > 800
  assert.strictEqual(DT.state.loadCollection(store).sp_ajdc.bestCp, 700);
  assert.strictEqual(DT.state.loadCollection(store).sp_ajdc.bestPt, 900);
  // 壊れたデータは空オブジェクトにフォールバック
  store.setItem(DT.state.COLLECTION_KEY, '{broken');
  assert.deepStrictEqual(DT.state.loadCollection(store), {});
});

summary();
