'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/short-mode.js');
require('../js/state.js');
require('../js/contest.js');
require('../js/events.js');
require('../js/engine.js');
const DT = globalThis.DT;

function base() {
  return DT.state.newCharacter(() => 0, 'highschool', 'short');
}

function memoryStore() {
  return {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
}

function fixedAlumniEvent(state, alumniId) {
  state.turn = 28;
  state.alumniSchedule = [{ turn: 28, alumniId: alumniId }];
  state.alumniScheduleReady = true;
  return DT.events.alumniEventFor(state);
}

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('初期卒業生3名の名前と得意技が決定どおり定義される', () => {
  assert.deepStrictEqual(
    DT.DATA.DEFAULT_ALUMNI.map(a => [a.name, a.techniqueId, a.rank]),
    [
      ['工藤まさし', 'high_toss', 'B'],
      ['綿貫しゅうすけ', 'fts', 'B'],
      ['深田あきら', 'on_beat', 'B']
    ]
  );
  assert.strictEqual(base().activeAlumni.length, 3);
});

test('卒業生名簿は初期3名を選択済みで読み込む', () => {
  const store = memoryStore();
  const profile = DT.state.loadAlumniProfile(store, 'short');
  assert.strictEqual(profile.pool.length, 3);
  assert.deepStrictEqual(profile.selectedIds, ['kudo_masashi', 'watanuki_shusuke', 'fukada_akira']);
  assert.deepStrictEqual(
    DT.state.loadActiveAlumni(store, 'short').map(entry => entry.id),
    profile.selectedIds
  );
});

test('卒業生名簿は5人未満なら全員、5人以上なら必ず5人を選ぶ', () => {
  const store = memoryStore();
  const ids = DT.state.loadAlumniProfile(store, 'short').selectedIds;
  assert.strictEqual(DT.state.saveAlumniSelection(ids.slice(0, 1), store, 'short').ok, false);
  assert.strictEqual(DT.state.saveAlumniSelection(ids.slice(0, 2), store, 'short').ok, false);
  assert.strictEqual(DT.state.saveAlumniSelection(ids, store, 'short').ok, true);
  assert.deepStrictEqual(DT.state.loadAlumniProfile(store, 'short').selectedIds, ids);

  for (let i = 0; i < 2; i++) {
    const s = base();
    s.status = 'graduated';
    s.name = '追加先輩' + i;
    DT.state.addGraduateAlumni(
      s,
      { rank: 'C', type: 'allround', title: '卒業生', totalPoints: 500 + i, cp: 600 },
      store,
      'short',
      100 + i
    );
  }
  const five = DT.state.loadAlumniProfile(store, 'short').selectedIds;
  assert.strictEqual(five.length, 5);
  assert.strictEqual(DT.state.saveAlumniSelection(five.slice(0, 4), store, 'short').ok, false);
  assert.strictEqual(DT.state.saveAlumniSelection(five, store, 'short').ok, true);
});

test('ショート版を卒業すると育てた選手が名簿へ加わり、5人までは自動選択される', () => {
  const store = memoryStore();
  const s = base();
  s.status = 'graduated';
  s.name = '新堂つばさ';
  s.techniqueCard = 'picture';
  const card = { rank: 'A', type: 'innovator', title: '孤高の発明家', totalPoints: 900, cp: 812 };
  const result = DT.state.addGraduateAlumni(s, card, store, 'short', 1000);
  assert.ok(result && result.activated);
  assert.strictEqual(result.alumni.name, '新堂つばさ');
  assert.strictEqual(result.alumni.techniqueId, 'picture');
  assert.strictEqual(result.alumni.type, 'イノベーター型');
  assert.strictEqual(result.profile.pool.length, 4);
  assert.strictEqual(result.profile.selectedIds.length, 4);
  assert.ok(result.profile.selectedIds.includes(result.alumni.id));
});

test('得意技なしで卒業した選手は育成タイプに対応する得意技を持つ', () => {
  const store = memoryStore();
  const s = base();
  s.status = 'graduated';
  s.name = '万能まこと';
  const result = DT.state.addGraduateAlumni(
    s,
    { rank: 'B', type: 'allround', title: '器用な選手', totalPoints: 600, cp: 650 },
    store,
    'short',
    2000
  );
  assert.strictEqual(result.alumni.techniqueId, 'pirouette');
  assert.strictEqual(result.alumni.type, '万能型');
});

test('登場枠が5人のとき、新しい卒業生は保存されるが自動選択されない', () => {
  const store = memoryStore();
  for (let i = 0; i < 2; i++) {
    const s = base();
    s.status = 'graduated';
    s.name = '先輩' + i;
    DT.state.addGraduateAlumni(
      s,
      { rank: 'B', type: 'technician', title: '堅実な技巧派', totalPoints: 600 + i, cp: 650 },
      store,
      'short',
      3000 + i
    );
  }
  assert.strictEqual(DT.state.loadAlumniProfile(store, 'short').selectedIds.length, 5);
  const sixth = base();
  sixth.status = 'graduated';
  sixth.name = '六人目';
  const result = DT.state.addGraduateAlumni(
    sixth,
    { rank: 'A', type: 'showman', title: '華の演者', totalPoints: 900, cp: 800 },
    store,
    'short',
    4000
  );
  assert.strictEqual(result.activated, false);
  assert.strictEqual(result.profile.pool.length, 6);
  assert.strictEqual(result.profile.selectedIds.length, 5);
  assert.ok(!result.profile.selectedIds.includes(result.alumni.id));
});

test('卒業生は最大50人まで保存し、選択中の先輩と新しい卒業生を優先して残す', () => {
  const store = memoryStore();
  for (let i = 0; i < 55; i++) {
    const s = base();
    s.status = 'graduated';
    s.name = '卒業生' + i;
    DT.state.addGraduateAlumni(
      s,
      { rank: 'B', type: 'technician', title: '堅実な技巧派', totalPoints: 600 + i, cp: 650 },
      store,
      'short',
      7000 + i
    );
  }
  const profile = DT.state.loadAlumniProfile(store, 'short');
  assert.strictEqual(DT.state.ALUMNI_POOL_MAX, 50);
  assert.strictEqual(profile.pool.length, 50);
  profile.selectedIds.forEach(id => assert.ok(profile.pool.some(entry => entry.id === id), id + 'が整理で消えた'));
  assert.ok(profile.pool.some(entry => entry.id === 'graduate_7054'), '最新の卒業生を残す');
  assert.ok(!profile.pool.some(entry => entry.id === 'graduate_7002'), '選択されていない古い卒業生から整理する');
});

test('卒業生名簿は通常版とショート版で分離される', () => {
  const store = memoryStore();
  const s = base();
  s.status = 'graduated';
  DT.state.addGraduateAlumni(
    s,
    { rank: 'C', type: 'power', title: '挑戦者', totalPoints: 400, cp: 500 },
    store,
    'short',
    5000
  );
  assert.strictEqual(DT.state.loadAlumniProfile(store, 'short').pool.length, 4);
  assert.strictEqual(DT.state.loadAlumniProfile(store, 'standard').pool.length, 3);
});

test('選んだ卒業生だけが次周回の先輩抽選に使われる', () => {
  const store = memoryStore();
  const added = [];
  for (let i = 0; i < 3; i++) {
    const graduate = base();
    graduate.status = 'graduated';
    graduate.name = '育成した先輩' + i;
    added.push(DT.state.addGraduateAlumni(
      graduate,
      { rank: 'A', type: 'power', title: '剛技の使い手', totalPoints: 850 + i, cp: 780 },
      store,
      'short',
      6000 + i
    ).alumni);
  }
  const selected = [added[0].id, 'fukada_akira', added[1].id, added[2].id, 'watanuki_shusuke'];
  assert.strictEqual(DT.state.saveAlumniSelection(selected, store, 'short').ok, true);
  const next = base();
  next.activeAlumni = DT.state.loadActiveAlumni(store, 'short');
  next.turn = 28;
  const schedule = DT.events.ensureAlumniState(next, () => 0);
  assert.deepStrictEqual(schedule, [
    { turn: 28, alumniId: added[0].id },
    { turn: 40, alumniId: 'fukada_akira' }
  ]);
  assert.ok(!next.activeAlumni.some(entry => entry.id === 'kudo_masashi'));
});

test('5人名簿では全員が先輩候補になり、1周内では重複しない', () => {
  const active = DT.DATA.DEFAULT_ALUMNI.concat([
    { id: 'graduate_a', name: '育成A', type: 'パワー型', techniqueId: 'integral' },
    { id: 'graduate_b', name: '育成B', type: '万能型', techniqueId: 'pirouette' }
  ]);
  const appeared = {};
  active.forEach(entry => { appeared[entry.id] = 0; });
  for (let seed = 1; seed <= 200; seed++) {
    const s = base();
    s.turn = 28;
    s.activeAlumni = active.map(entry => Object.assign({}, entry));
    const schedule = DT.events.ensureAlumniState(s, seeded(seed));
    assert.strictEqual(schedule.length, 2);
    assert.notStrictEqual(schedule[0].alumniId, schedule[1].alumniId);
    schedule.forEach(row => { appeared[row.alumniId]++; });
  }
  Object.keys(appeared).forEach(id => assert.ok(appeared[id] > 0, id + 'が一度も抽選されていない'));
});

test('卒業生イベントは3年次・4年次に各1回、別の先輩で予定される', () => {
  const s = base();
  s.turn = 28;
  const seq = [0, 0, 0, 0];
  let i = 0;
  const schedule = DT.events.ensureAlumniState(s, () => seq[i++]);
  assert.deepStrictEqual(schedule, [
    { turn: 28, alumniId: 'kudo_masashi' },
    { turn: 40, alumniId: 'watanuki_shusuke' }
  ]);
  assert.notStrictEqual(schedule[0].alumniId, schedule[1].alumniId);
});

test('卒業生イベントはショート版の予定月だけ返り、解決後は同じ月に再発生しない', () => {
  const s = base();
  const ev = fixedAlumniEvent(s, 'kudo_masashi');
  assert.ok(ev && ev.kind === 'alumni');
  DT.events.applyAlumniChoice(s, ev, 1, () => 0);
  assert.strictEqual(DT.events.alumniEventFor(s), null);
  const standard = DT.state.newCharacter(() => 0, 'highschool', 'standard');
  standard.turn = 28;
  assert.strictEqual(DT.events.alumniEventFor(standard), null);
});

test('得意技伝授の成功: 技を書き換え、全ジャンル難易度+1', () => {
  const s = base();
  const ev = fixedAlumniEvent(s, 'kudo_masashi');
  const before = DT.DATA.GENRES.map(g => s.skills[g.id].difficulty);
  const r = DT.events.applyAlumniChoice(s, ev, 0, () => 0.79);
  assert.strictEqual(s.techniqueCard, 'high_toss');
  DT.DATA.GENRES.forEach((g, i) => assert.strictEqual(s.skills[g.id].difficulty, before[i] + 1));
  assert.strictEqual(s.motivation, 54);
  assert.ok(r.messages.some(m => m.includes('ハイトス')));
});

test('得意技伝授の失敗: 技術は変わらず、やる気-8', () => {
  const s = base();
  const ev = fixedAlumniEvent(s, 'watanuki_shusuke');
  DT.events.applyAlumniChoice(s, ev, 0, () => 0.99);
  assert.strictEqual(s.techniqueCard, null);
  assert.strictEqual(s.motivation, 42);
});

test('大会語録は必ず全ジャンル操作安定度+1・ランク分やる気アップ', () => {
  const s = base();
  const ev = fixedAlumniEvent(s, 'fukada_akira');
  DT.events.applyAlumniChoice(s, ev, 1, () => { throw new Error('抽選してはいけない'); });
  DT.DATA.GENRES.forEach(g => assert.strictEqual(s.skills[g.id].control, 11));
  assert.strictEqual(s.motivation, 54);
});

test('練習方法の成功は全新奇性+1・構成+1、失敗はやる気-5', () => {
  const success = base();
  const successEv = fixedAlumniEvent(success, 'fukada_akira');
  DT.events.applyAlumniChoice(success, successEv, 2, () => 0.89);
  DT.DATA.GENRES.forEach(g => assert.strictEqual(success.skills[g.id].novelty, 11));
  assert.strictEqual(success.composition, 11);
  assert.strictEqual(success.motivation, 54);

  const fail = base();
  const failEv = fixedAlumniEvent(fail, 'fukada_akira');
  DT.events.applyAlumniChoice(fail, failEv, 2, () => 0.99);
  assert.strictEqual(fail.motivation, 45);
  assert.strictEqual(fail.composition, 10);
});

test('卒業ランクが高いほど指導成功率と成功時のやる気補正が上がる', () => {
  assert.deepStrictEqual(DT.events.alumniRankBonus({ rank: 'S' }), {
    rank: 'S', chance: 0.10, motivation: 6
  });
  assert.deepStrictEqual(DT.events.alumniRankBonus({ rank: 'E' }), {
    rank: 'E', chance: 0, motivation: 1
  });
  assert.strictEqual(DT.events.alumniSuccessChance(0.8, { rank: 'S' }), 0.9);
  assert.strictEqual(DT.events.alumniSuccessChance(0.9, { rank: 'S' }), 1);
  assert.strictEqual(DT.events.alumniSuccessChance(0.8, { rank: 'E' }), 0.8);

  const s = base();
  s.activeAlumni[0].rank = 'S';
  const ev = fixedAlumniEvent(s, 'kudo_masashi');
  assert.strictEqual(ev.teachChance, 0.9);
  assert.strictEqual(ev.methodChance, 1);
  assert.ok(ev.choices[0].label.includes('成功率90%'));
  assert.ok(ev.choices[2].label.includes('成功率100%'));
});

test('音はめを新しく受け継ぐと演技構成+2、同じ技の再伝授では重複しない', () => {
  const s = base();
  const first = DT.events.activateTechnique(s, 'on_beat');
  assert.strictEqual(s.composition, 12);
  assert.strictEqual(first.changed, true);
  const second = DT.events.activateTechnique(s, 'on_beat');
  assert.strictEqual(s.composition, 12);
  assert.strictEqual(second.changed, false);
});

test('ハイトスは成功した該当枠に安定+6・新奇性-1を各1回だけ加える', () => {
  const plain = base();
  plain.turn = 30;
  const boosted = JSON.parse(JSON.stringify(plain));
  boosted.techniqueCard = 'high_toss';
  boosted.techniqueCardSelectedAt = 28;
  const slots = [
    { genre: 'd2', method: 'control' },
    { genre: 'd2', method: 'control' },
    { genre: 'd2', method: 'novelty' }
  ];
  DT.engine.applyTraining(plain, slots, () => 0.3);
  const result = DT.engine.applyTraining(boosted, slots, () => 0.3);
  assert.strictEqual(boosted.skills.d2.control - plain.skills.d2.control, 6);
  assert.strictEqual(boosted.skills.d2.novelty - plain.skills.d2.novelty, -1);
  assert.strictEqual(result.messages.filter(m => m.includes('得意技「ハイトス」')).length, 2);
});

test('FTSは3D+難易度の成功練習へ1行動につき+10', () => {
  const plain = base();
  plain.turn = 30;
  const boosted = JSON.parse(JSON.stringify(plain));
  boosted.techniqueCard = 'fts';
  boosted.techniqueCardSelectedAt = 28;
  const slots = new Array(3).fill(null).map(() => ({ genre: 'd3', method: 'difficulty' }));
  DT.engine.applyTraining(plain, slots, () => 0.3);
  DT.engine.applyTraining(boosted, slots, () => 0.3);
  assert.strictEqual(boosted.skills.d3.difficulty - plain.skills.d3.difficulty, 10);
});

test('ハプニングは大会の審査ぶれを±3から±5へ広げる', () => {
  const normal = base();
  normal.motivation = 50;
  const happening = JSON.parse(JSON.stringify(normal));
  happening.techniqueCard = 'happening';
  const judgeLow = () => {
    let i = 0;
    return () => (i++ === 0 ? 0 : 0.99);
  };
  assert.strictEqual(DT.contest.playerScore(normal, 'overall', judgeLow()).judgeMod, -3);
  assert.strictEqual(DT.contest.playerScore(happening, 'overall', judgeLow()).judgeMod, -5);
});

test('旧セーブは得意技・卒業生フィールドを補完して読み込める', () => {
  const store = {
    data: {},
    setItem(k, v) { this.data[k] = v; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    removeItem(k) { delete this.data[k]; }
  };
  const old = base();
  delete old.techniqueCard;
  delete old.techniqueCardSelectedAt;
  delete old.activeAlumni;
  delete old.alumniSchedule;
  delete old.alumniScheduleReady;
  delete old.alumniEventsSeen;
  store.setItem(DT.state.SHORT_SAVE_KEY, JSON.stringify(old));
  const loaded = DT.state.load(store, 'short');
  assert.strictEqual(loaded.techniqueCard, null);
  assert.strictEqual(loaded.activeAlumni.length, 3);
  assert.deepStrictEqual(loaded.alumniSchedule, []);
  assert.deepStrictEqual(loaded.alumniEventsSeen, []);
});

summary();
