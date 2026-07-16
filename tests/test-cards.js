'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/contest.js');
require('../js/state.js');
require('../js/engine.js');
require('../js/ending.js');
require('../js/events.js');
require('../js/cards.js');
const DT = globalThis.DT;

function base(over) {
  const s = DT.state.newCharacter(() => 0.5, 'highschool');
  s.status = 'graduated';
  return Object.assign(s, over || {});
}
const res = (over) => Object.assign({ name: 'x', type: 'oidc', division: 'overall', divisionLabel: '', rank: 5,
  entrants: 16, score: 60, points: 10, turn: 5, standings: [], rivalMessages: [] }, over || {});

test('catalog: 全50種（特別15＋職人5＋マトリクス30）', () => {
  const list = DT.cards.catalog();
  assert.strictEqual(list.length, 50);
  assert.strictEqual(list.filter(c => c.layer === 'special').length, 15);
  assert.strictEqual(list.filter(c => c.layer === 'craft').length, 5);
  assert.strictEqual(list.filter(c => c.layer === 'matrix').length, 30);
  // idはユニーク
  assert.strictEqual(new Set(list.map(c => c.id)).size, 50);
});

test('pickCard: 世界大会優勝は「伝説のディアボリスト」最優先（退学を除く）', () => {
  const s = base();
  s.results = [res({ type: 'worlds', rank: 1, points: 150, turn: 44 })];
  assert.strictEqual(DT.cards.pickCard(s).id, 'sp_worlds');
});

test('pickCard: 退学はすべてに優先して「未完の大器」', () => {
  const s = base({ status: 'expelled' });
  s.results = [res({ type: 'worlds', rank: 1, points: 150, turn: 44 })];
  const c = DT.cards.pickCard(s);
  assert.strictEqual(c.id, 'sp_expelled');
  assert.strictEqual(c.expelled, true);
});

test('pickCard: 該当なしはランク×属性マトリクスに落ちる（受け皿）', () => {
  const s = base();
  s.results = [res({ rank: 10, points: 5 })];
  s.injuryCount = 1; // 無傷の四年間を回避
  const c = DT.cards.pickCard(s);
  assert.ok(c.id.indexOf('mx_') === 0, c.id);
  assert.strictEqual(c.layer, 'matrix');
});

test('pickCard: ハードSは「雑草の大器」', () => {
  const s = base({ background: 'college' });
  // S相当のポイント（1000pt）を積む
  s.results = [res({ points: 1000, rank: 2 })];
  s.injuryCount = 1;
  assert.strictEqual(DT.cards.pickCard(s).id, 'sp_weed');
});

test('pickCard: AJDC総合の連覇（12ターン差）で「絶対王者」、単発は「日本の頂点」', () => {
  const s1 = base(); s1.injuryCount = 1;
  s1.results = [res({ type: 'ajdc', rank: 1, turn: 24 }), res({ type: 'ajdc', rank: 1, turn: 36 })];
  assert.strictEqual(DT.cards.pickCard(s1).id, 'sp_dynasty');
  const s2 = base(); s2.injuryCount = 1;
  s2.results = [res({ type: 'ajdc', rank: 1, turn: 24 })];
  assert.strictEqual(DT.cards.pickCard(s2).id, 'sp_ajdc');
});

test('pickCard: マトリクスの全30組合せがタイトルを持つ', () => {
  DT.cards.catalog().filter(c => c.layer === 'matrix').forEach(c => {
    assert.ok(c.title && c.title.length > 0, c.id);
  });
});

test('features: Type判定は構成を係数補正して比較（バランス型は万能に寄る）', () => {
  const s = base(); s.injuryCount = 1;
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => { s.skills[g.id][m.id] = 70; }));
  s.composition = 88; // 88*0.85=74.8 → 70..74.8 spread≤8 → 万能
  const f = DT.cards.features(s);
  assert.strictEqual(f.type, 'allround');
});

// ---- pickCandidates（改善プラン#3・2026-07-16）----

test('pickCandidates: 複数条件達成を優先度順に列挙し、先頭=pickCard・末尾=マトリクス受け皿', () => {
  const s = base();
  // 世界優勝＋AJDC総合優勝（伝説と日本の頂点を同時達成）
  s.results = [
    res({ type: 'worlds', rank: 1, points: 150, turn: 44 }),
    res({ type: 'ajdc', rank: 1, points: 100, turn: 48 })
  ];
  const cands = DT.cards.pickCandidates(s);
  assert.strictEqual(cands[0].id, DT.cards.pickCard(s).id); // 先頭=従来の排出
  assert.strictEqual(cands[0].id, 'sp_worlds');
  assert.ok(cands.some(c => c.id === 'sp_ajdc'), '日本の頂点も候補に載る');
  const last = cands[cands.length - 1];
  assert.strictEqual(last.layer, 'matrix'); // 受け皿は必ず末尾
  assert.strictEqual(new Set(cands.map(c => c.id)).size, cands.length); // 重複なし
  // 各候補はこの周の選手データを共有する（rank/cp/statsが同一）
  cands.forEach(c => { assert.strictEqual(c.cp, cands[0].cp); assert.strictEqual(c.rank, cands[0].rank); });
});

test('pickCandidates: 退学は「未完の大器」単独（他の物語は選ばせない）', () => {
  const s = base({ status: 'expelled' });
  s.results = [res({ type: 'worlds', rank: 1, points: 150, turn: 44 })];
  const cands = DT.cards.pickCandidates(s);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].id, 'sp_expelled');
});

test('pickCandidates: 該当なしはマトリクス1枚のみ', () => {
  const s = base();
  s.results = [];
  const cands = DT.cards.pickCandidates(s);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].layer, 'matrix');
});

summary();
