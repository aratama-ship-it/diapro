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

function entryPick(turn) {
  const specialistIds = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').map(d => d.id);
  const max = DT.contest.maxEntries(turn);
  return ['overall'].concat(specialistIds.slice(0, max - 1));
}

// 月頭に1回だけ方針を決定する。
// 優先順: 補習中→(study/rest)、試験直前で学力不足→study、怪我→injured、学力不足→study、疲労過多→rest、それ以外→train
function decideMonth(state) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.banTurns > 0) return state.fatigue > 55 ? 'rest' : 'study';
  const nextExam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
  if (nextExam !== undefined && nextExam - state.turn <= 1 && state.study < 45) return 'study';
  if (state.study < 30) return 'study';
  if (state.fatigue > 55) return 'rest';
  return 'train';
}

// 練習な月は4枠 [combo, combo, combo, 'routine']。
// combo = { genre, method } のうち、12マス中もっとも値が低いセルを狙う（argmin cell）
function pickCombo(state) {
  const methodIds = DT.DATA.METHODS.map(m => m.id);
  let worstGenre = DT.DATA.GENRES[0].id;
  let worstMethod = methodIds[0];
  let worstValue = state.skills[worstGenre][worstMethod];
  DT.DATA.GENRES.forEach(g => {
    methodIds.forEach(m => {
      const v = state.skills[g.id][m];
      if (v < worstValue) {
        worstValue = v;
        worstGenre = g.id;
        worstMethod = m;
      }
    });
  });
  return { genre: worstGenre, method: worstMethod };
}

function playThrough(rng, choose) {
  const state = DT.state.newCharacter(rng);
  let guard = 0;
  while (state.status === 'playing' && guard < 100) {
    guard += 1;
    const monthAction = choose(state);
    if (monthAction === 'train') {
      const combo = pickCombo(state);
      DT.engine.applyTraining(state, [combo, combo, combo, 'routine'], rng);
    } else {
      DT.engine.applyAction(state, monthAction, rng);
    }
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      DT.contest.runAll(state, contest, entryPick(state.turn), rng);
    } else {
      const wc = DT.contest.worldsContestForTurn(state.turn);
      if (wc && DT.contest.worldsQualified(state, state.turn)) {
        DT.contest.runAll(state, wc, ['overall'], rng);
      } else if (monthAction !== 'injured') {
        const ev = DT.events.roll(state, rng);
        if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
        else if (ev) DT.events.applyHappening(state, ev.event);
      }
    }
    DT.engine.endTurn(state, rng);
  }
  return state;
}

function chooseSensible(state) {
  return decideMonth(state);
}

function abilityAvg13(state) {
  const cellSum = DT.DATA.GENRES.reduce((a, g) =>
    a + DT.DATA.METHODS.reduce((b, m) => b + state.skills[g.id][m.id], 0), 0);
  const abilitySum = cellSum + state.composition;
  const cellCount = DT.DATA.GENRES.length * DT.DATA.METHODS.length + 1;
  return abilitySum / cellCount;
}

test('まともな方針なら20回全部卒業できる', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    assert.strictEqual(s.status, 'graduated', 'seed=' + seed);
    // 8大会 × エントリー枠(学年+1) = 1年2×2 + 2年3×2 + 3年4×2 + 4年5×2 = 28エントリー（通常大会のみ、総合は常に含む）
    assert.strictEqual(s.results.filter(r => r.type !== 'worlds').length, 28, 'seed=' + seed + ' エントリー数');
    const e = DT.ending.evaluate(s);
    assert.ok('SABCDE'.includes(e.rank), 'seed=' + seed + ' rank=' + e.rank);
  }
});

test('まともな方針なら能力は確実に成長する', () => {
  const s = playThrough(lcg(42), chooseSensible);
  const avg = abilityAvg13(s);
  assert.ok(avg >= 40, '最終能力平均が低すぎる: ' + avg);
});

test('勉強を一切しないと退学になる', () => {
  const s = playThrough(lcg(7), (state) =>
    state.injuredTurns > 0 ? 'injured' : (state.fatigue > 55 ? 'rest' : 'train')
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

test('参考: 4年目AJDC総合のdisplayスコア帯と最終能力を表示（seed=1）', () => {
  const s = playThrough(lcg(1), chooseSensible);
  const year4ajdc = s.results.find(r => r.type === 'ajdc' && r.division === 'overall' && r.turn === 48);
  if (year4ajdc) {
    console.log('  4年AJDC総合 プレイヤーdisplayスコア: ' + year4ajdc.score);
    const lv = DT.contest.LEVELS.ajdc;
    const meanRaw = lv.base + lv.growth * 3; // year=4
    const scale = DT.DATA.SCORING.scale;
    const meanDisplay = Math.round((scale.base + meanRaw * scale.mult) * 10) / 10;
    console.log('  4年AJDC 場のmean相当display: ' + meanDisplay);
  } else {
    console.log('  4年AJDC総合: seed=1では未到達（学業不振等）');
  }
  const avg = abilityAvg13(s);
  console.log('  最終能力平均（13値: 12マス+composition）: ' + avg.toFixed(1));
  assert.ok(true);
});

test('参考: 20シードの赤点回数を表示', () => {
  let redCount = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const rng = lcg(seed);
    const state = DT.state.newCharacter(rng);
    let guard = 0;
    while (state.status === 'playing' && guard < 100) {
      guard += 1;
      const monthAction = chooseSensible(state);
      if (monthAction === 'train') {
        const combo = pickCombo(state);
        DT.engine.applyTraining(state, [combo, combo, combo, 'routine'], rng);
      } else {
        DT.engine.applyAction(state, monthAction, rng);
      }
      const contest = DT.contest.contestForTurn(state.turn);
      if (contest) {
        DT.contest.runAll(state, contest, entryPick(state.turn), rng);
      } else {
        const wc = DT.contest.worldsContestForTurn(state.turn);
        if (wc && DT.contest.worldsQualified(state, state.turn)) {
          DT.contest.runAll(state, wc, ['overall'], rng);
        } else if (monthAction !== 'injured') {
          const ev = DT.events.roll(state, rng);
          if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
          else if (ev) DT.events.applyHappening(state, ev.event);
        }
      }
      const beforeBan = state.banTurns;
      const r = DT.engine.endTurn(state, rng);
      if (beforeBan === 0 && r.events.some(e => e.includes('赤点'))) redCount += 1;
    }
  }
  console.log('  赤点回数(20シード計): ' + redCount);
  assert.ok(true);
});

summary();
