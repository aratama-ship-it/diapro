'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/contest.js');
require('../js/events.js');
const DT = globalThis.DT;

function base() { return DT.state.newCharacter(() => 0); }

test('roll: r<0.15でキャライベント、r<0.20でハプニング、以上でnull', () => {
  const s = base();
  const seq1 = [0.10, 0.0]; let i1 = 0; // 発生roll, イベント選択roll
  const r1 = DT.events.roll(s, () => seq1[i1++]);
  assert.strictEqual(r1.kind, 'char');
  const seq2 = [0.17, 0.0]; let i2 = 0;
  const r2 = DT.events.roll(s, () => seq2[i2++]);
  assert.strictEqual(r2.kind, 'happening');
  assert.strictEqual(DT.events.roll(s, () => 0.25), null);
});

test('applyChoice: 効果が適用されメッセージが返る', () => {
  const s = base();
  const ev = DT.DATA.EVENTS.charEvents.find(e => e.id === 'yota1');
  const before = s.fatigue = 30;
  const r = DT.events.applyChoice(s, ev, 0); // 付き合う: fatigue-15, motivation+8
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.motivation, 58); // 50 + 8
  assert.ok(r.messages.some(m => m.includes('心が軽く')));
});

test('applyChoice: statとstudyの効果・クランプ', () => {
  const s = base();
  const ev = DT.DATA.EVENTS.charEvents.find(e => e.id === 'mikoto1');
  DT.events.applyChoice(s, ev, 1); // study+8
  assert.strictEqual(s.study, 48);
  const ev2 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach1');
  DT.events.applyChoice(s, ev2, 0); // control+3, fatigue+8（反復練習はcontrolに再配線。全4ジャンルのcontrolに同量適用）
  DT.DATA.GENRES.forEach(g => assert.strictEqual(s.skills[g.id].control, 13, g.id + ' のcontrolが+3されているべき'));
  assert.strictEqual(DT.DATA.GENRES.length, 4, '4ジャンル全てに適用されたことの前提');
});

test('コーチイベント2回で特別指導解放（一度きり）', () => {
  const s = base();
  const c1 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach1');
  const c2 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach2');
  DT.events.applyChoice(s, c1, 1);
  assert.strictEqual(s.specialUnlocked, false);
  const r = DT.events.applyChoice(s, c2, 0);
  assert.strictEqual(s.specialUnlocked, true);
  assert.ok(r.messages.some(m => m.includes('特別指導')));
  assert.strictEqual(s.coachEvents, 2);
});

test('applyHappening: 効果適用', () => {
  const s = base();
  const h = DT.DATA.EVENTS.happenings.find(e => e.id === 'hap2');
  const r = DT.events.applyHappening(s, h); // fatigue+15, motivation-8
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.motivation, 42); // 50 - 8
  assert.ok(r.messages.length >= 1);
});

// 定期イベント（固定・非ランダム）: 新入生歓迎会
test('scheduledEventFor: turn1は新入生歓迎会イベント、他ターンはnull', () => {
  const s = base();
  s.turn = 1;
  const ev = DT.events.scheduledEventFor(s);
  assert.ok(ev && ev.id === 'welcome', 'turn1でwelcomeイベント');
  s.turn = 2;
  assert.strictEqual(DT.events.scheduledEventFor(s), null, 'turn2ではnull');
});

test('applyScheduled(新入生歓迎会): 解禁済みジャンルの全技術+10・未解禁は不変', () => {
  const s = DT.state.newCharacter(() => 0, 'college'); // 技術全0 → h1dのみ解禁
  s.turn = 1;
  const ev = DT.events.scheduledEventFor(s);
  const r = DT.events.applyScheduled(s, ev);
  // h1d(解禁済み)の3技術は+10、v1d/d2/d3(未解禁)は0のまま
  DT.DATA.METHODS.forEach(m => assert.strictEqual(s.skills.h1d[m.id], 10, 'h1d.' + m.id));
  ['v1d', 'd2', 'd3'].forEach(g =>
    DT.DATA.METHODS.forEach(m => assert.strictEqual(s.skills[g][m.id], 0, g + '.' + m.id + 'は未解禁なので不変')));
  assert.strictEqual(s.composition, 3, '演技構成は対象外で不変(college compMin3)');
  assert.ok(r.messages.length >= 1 && r.messages[0].indexOf('+10') >= 0, 'メッセージに+10');
});

test('applyScheduled(新入生歓迎会): +10はclamp(0,100)される', () => {
  const s = DT.state.newCharacter(() => 0, 'college');
  s.turn = 1;
  DT.DATA.METHODS.forEach(m => { s.skills.h1d[m.id] = 95; }); // 95+10=105 → 100にclamp
  const ev = DT.events.scheduledEventFor(s);
  DT.events.applyScheduled(s, ev);
  DT.DATA.METHODS.forEach(m => assert.strictEqual(s.skills.h1d[m.id], 100, 'h1d.' + m.id + 'は100でclamp'));
});

summary();
