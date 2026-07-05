'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/engine.js');
require('../js/contest.js');
require('../js/ending.js');
require('../js/events.js');
const DT = globalThis.DT;

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function chooseSensible(state) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.study < 30) return 'study';
  if (state.fatigue > 55) return 'rest';
  let worst = DT.DATA.TRAININGS[0];
  DT.DATA.TRAININGS.forEach(t => {
    if (state.stats[t.stat] < state.stats[worst.stat]) worst = t;
  });
  return worst.id;
}

function specialistPick(turn) {
  const ids = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').map(d => d.id);
  return ids.slice(0, DT.contest.maxSpecialists(turn));
}

function playThrough(rng, choose) {
  const state = DT.state.newCharacter(rng);
  let guard = 0;
  while (state.status === 'playing' && guard < 100) {
    guard += 1;
    const action = choose(state);
    DT.engine.applyAction(state, action, rng);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      DT.contest.runAll(state, contest, specialistPick(state.turn), rng);
    } else {
      const wc = DT.contest.worldsContestForTurn(state.turn);
      if (wc && DT.contest.worldsQualified(state, state.turn)) {
        DT.contest.runAll(state, wc, [], rng);
      } else if (action !== 'injured') {
        const ev = DT.events.roll(state, rng);
        if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
        else if (ev) DT.events.applyHappening(state, ev.event);
      }
    }
    DT.engine.endTurn(state, rng);
  }
  return state;
}

test('まともな方針なら20回全部卒業できる', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    assert.strictEqual(s.status, 'graduated', 'seed=' + seed);
    // 8大会 × (総合1+スペシャ枠) = 1年2+2 + 2年3+3 + 3年4+4 + 4年4+4 = 26エントリー（通常大会のみ）
    assert.strictEqual(s.results.filter(r => r.type !== 'worlds').length, 26, 'seed=' + seed + ' エントリー数');
    const e = DT.ending.evaluate(s);
    assert.ok('SABCDE'.includes(e.rank), 'seed=' + seed + ' rank=' + e.rank);
  }
});

test('まともな方針なら能力は確実に成長する', () => {
  const s = playThrough(lcg(42), chooseSensible);
  const avg = DT.DATA.STATS.reduce((a, st) => a + s.stats[st.id], 0) / DT.DATA.STATS.length;
  assert.ok(avg >= 40, '最終能力平均が低すぎる: ' + avg);
});

test('勉強を一切しないと退学になる', () => {
  const s = playThrough(lcg(7), (state) =>
    state.injuredTurns > 0 ? 'injured' : (state.fatigue > 55 ? 'rest' : 'difficulty')
  );
  assert.strictEqual(s.status, 'expelled');
  // 初期学力は最大60。減衰-2/月で20を割るまで最長約21ヶ月＋警告3ヶ月
  assert.ok(s.turn < 30, '退学が遅すぎる: turn=' + s.turn);
});

test('まともな方針なら4年間でどこかの大会で3位以内に入れる', () => {
  let bestRank = 99;
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    s.results.forEach(r => { if (r.rank < bestRank) bestRank = r.rank; });
  }
  assert.ok(bestRank <= 3, '20シードの最高順位が' + bestRank + '位（勝機がなさすぎる）');
});

test('イベントは4年間で複数回発生し、特別指導も到達可能', () => {
  let unlockedCount = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    if (s.specialUnlocked) unlockedCount += 1;
  }
  assert.ok(unlockedCount >= 5, '特別指導解放が少なすぎる: ' + unlockedCount + '/20');
});

test('ライバル戦績が記録される', () => {
  const s = playThrough(lcg(3), chooseSensible);
  const shion = s.rivalRecord.shion;
  assert.strictEqual(shion.win + shion.lose, 8); // 志音は全8大会に出る
  const kaito = s.rivalRecord.kaito;
  const worldsCount = s.results.filter(r => r.type === 'worlds').length;
  assert.strictEqual(kaito.win + kaito.lose, 4 + worldsCount); // 魁人はAJDC + 世界大会
});

test('世界大会は出場権があるときだけ結果に現れる', () => {
  let worldsAppearances = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    const wins = (t) => s.results.some(r => r.rank === 1 && (r.type === 'oidc' || r.type === 'ajdc') && r.turn > t - 12 && r.turn < t);
    s.results.filter(r => r.type === 'worlds').forEach(r => {
      assert.ok(wins(r.turn), 'seed=' + seed + ' 無資格出場 turn=' + r.turn);
      worldsAppearances += 1;
    });
  }
  console.log('  世界大会出場回数(20シード計): ' + worldsAppearances);
  assert.ok(worldsAppearances >= 1, '20シードで一度も世界大会に出られていない');
});

test('参考: 20シードの卒業ランク分布を表示', () => {
  const dist = {};
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    const r = DT.ending.evaluate(s).rank;
    dist[r] = (dist[r] || 0) + 1;
  }
  console.log('  ランク分布: ' + JSON.stringify(dist));
  assert.ok(true);
});

summary();
