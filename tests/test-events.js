'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/events.js');
const DT = globalThis.DT;

function base() { return DT.state.newCharacter(() => 0); }

test('roll: r<0.20でキャライベント、r<0.28でハプニング、以上でnull', () => {
  const s = base();
  const seq1 = [0.1, 0.0]; let i1 = 0; // 発生roll, イベント選択roll
  const r1 = DT.events.roll(s, () => seq1[i1++]);
  assert.strictEqual(r1.kind, 'char');
  const seq2 = [0.25, 0.0]; let i2 = 0;
  const r2 = DT.events.roll(s, () => seq2[i2++]);
  assert.strictEqual(r2.kind, 'happening');
  assert.strictEqual(DT.events.roll(s, () => 0.5), null);
});

test('applyChoice: 効果が適用されメッセージが返る', () => {
  const s = base();
  const ev = DT.DATA.EVENTS.charEvents.find(e => e.id === 'yota1');
  const before = s.fatigue = 30;
  const r = DT.events.applyChoice(s, ev, 0); // 付き合う: fatigue-15, motivation+1
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.motivation, 4);
  assert.ok(r.messages.some(m => m.includes('心が軽く')));
});

test('applyChoice: statとstudyの効果・クランプ', () => {
  const s = base();
  const ev = DT.DATA.EVENTS.charEvents.find(e => e.id === 'mikoto1');
  DT.events.applyChoice(s, ev, 1); // study+8
  assert.strictEqual(s.study, 48);
  const ev2 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach1');
  DT.events.applyChoice(s, ev2, 0); // control+3, fatigue+8（反復練習はcontrolに再配線）
  assert.strictEqual(s.stats.control, 13);
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
  const r = DT.events.applyHappening(s, h); // fatigue+15, motivation-1
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.motivation, 2);
  assert.ok(r.messages.length >= 1);
});

summary();
