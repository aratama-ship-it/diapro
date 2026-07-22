'use strict';
require('../js/data.js');
require('../js/short-mode.js');
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
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function unlockedEntries(turn, state) {
  const contest = DT.contest.contestForTurn(turn);
  if (contest && contest.type === 'shizuoka') return ['technical', 'performance'];
  const ids = DT.DATA.DIVISIONS
    .filter(d => d.scoring === 'specialist' && DT.contest.isGenreUnlocked(state, d.id))
    .map(d => d.id);
  return ['overall'].concat(ids.slice(0, DT.contest.maxEntries(turn) - 1));
}

function lowestCell(state) {
  let best = null;
  DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked(state, g.id)).forEach(g => {
    DT.DATA.METHODS.forEach(m => {
      const value = state.skills[g.id][m.id];
      if (!best || value < best.value) best = { genre: g.id, method: m.id, value };
    });
  });
  return { genre: best.genre, method: best.method };
}

function decide(state, lookahead) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.banTurns > 0) return state.fatigue > 55 ? 'rest' : 'study';
  const exam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
  if (exam !== undefined && exam - state.turn <= lookahead && state.study < 45) return 'study';
  if (state.study < 30) return 'study';
  if (state.fatigue > 55) return 'rest';
  return 'training';
}

function runPreEvent(state, rng) {
  if (DT.events.isOmikujiTurn(state.turn)) { DT.events.drawOmikuji(state, rng); return false; }
  const cond = DT.events.conditionalEventFor(state);
  if (cond) {
    if (cond.awakenTrigger) {
      if (rng() < 0.5) DT.events.startAwakening(state, rng);
      else state.motivation = clamp(state.motivation - 20, 0, 100);
    } else if (cond.choices) DT.events.applyChoice(state, cond, 0);
    else DT.events.applyConditional(state, cond);
    return cond.id === 'collapse';
  }
  const ev = DT.events.roll(state, rng);
  if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
  else if (ev) DT.events.applyHappening(state, ev.event);
  return false;
}

function runAction(state, rng, metrics, lookahead) {
  const action = decide(state, lookahead);
  metrics.actions += 1;
  metrics[action] = (metrics[action] || 0) + 1;
  if (action === 'training') {
    const cell = lowestCell(state);
    DT.engine.applyTraining(state, [cell, cell, 'routine'], rng);
    const injury = DT.engine.rollInjury(state, rng);
    if (injury.injured) metrics.injuries += 1;
  } else DT.engine.applyAction(state, action, rng);
}

function runPostEvent(state, rng) {
  const contest = DT.contest.contestForTurn(state.turn);
  const worlds = DT.contest.worldsContestForTurn(state.turn);
  const jq = DT.contest.jjfQualifierForTurn(state.turn);
  const jf = DT.contest.jjfFinalForTurn(state.turn);
  if (contest) DT.contest.runAll(state, contest, unlockedEntries(state.turn, state), rng, 'normal');
  else if (worlds && DT.contest.worldsQualified(state, state.turn)) DT.contest.runAll(state, worlds, ['overall'], rng, 'normal');
  else if (jq) {
    const q = DT.contest.jjfQualify(state, rng);
    if (q.passed) {
      state.motivation = clamp(state.motivation + DT.DATA.JJF.passMotivation, 0, 100);
      state.jjfFinalist = 1;
      state.results.push({
        name: jq.name, type: 'jjf', division: 'qualifier', divisionLabel: 'JJF予選突破',
        rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn,
        standings: [], rivalMessages: []
      });
    } else {
      state.motivation = clamp(state.motivation - 8, 0, 100);
    }
  } else if (jf && state.jjfFinalist) {
    state.jjfFinalist = 0;
    DT.contest.runJjfFinal(state, jf, rng);
  } else {
    const scheduled = DT.events.scheduledEventFor(state);
    if (scheduled) {
      if (scheduled.choices) DT.events.applyChoice(state, scheduled, 0);
      else DT.events.applyScheduled(state, scheduled);
    }
  }
}

function abilityAvg(state) {
  let sum = state.composition;
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => { sum += state.skills[g.id][m.id]; }));
  return sum / 13;
}

function play(seed, mode) {
  const rng = lcg(seed);
  const state = DT.state.newCharacter(rng, 'highschool', mode);
  const metrics = { actions: 0, training: 0, study: 0, rest: 0, injured: 0, injuries: 0 };
  let guard = 0;
  while (state.status === 'playing' && guard++ < 100) {
    const short = mode === 'short';
    const practiceMonth = !short || DT.shortMode.isPracticeMonth(state.turn);
    const skipAction = (!short || !practiceMonth) ? runPreEvent(state, rng) : false;
    if (practiceMonth && !skipAction) runAction(state, rng, metrics, short ? 2 : 1);
    else if (practiceMonth) { state.didTrain = false; state.didStudy = false; }
    runPostEvent(state, rng);
    DT.engine.endTurn(state, rng);
  }
  const evaluation = DT.ending.evaluate(state);
  return {
    status: state.status,
    actions: metrics.actions,
    training: metrics.training,
    study: metrics.study,
    rest: metrics.rest,
    treatment: metrics.injured,
    injuries: metrics.injuries,
    ability: abilityAvg(state),
    points: evaluation.totalPoints,
    rank: evaluation.rank,
    seenEvents: state.seenCharEvents.length,
    wins: state.results.filter(r => r.rank === 1 && r.division !== 'qualifier').length,
    worlds: state.results.filter(r => r.type === 'worlds').length
  };
}

function summarize(rows) {
  const avg = key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  const ranks = rows.reduce((out, row) => { out[row.rank] = (out[row.rank] || 0) + 1; return out; }, {});
  return {
    graduationRate: rows.filter(r => r.status === 'graduated').length / rows.length,
    actions: avg('actions'), training: avg('training'), study: avg('study'), rest: avg('rest'), treatment: avg('treatment'),
    ability: avg('ability'), points: avg('points'), wins: avg('wins'), injuries: avg('injuries'),
    seenEvents: avg('seenEvents'), worlds: avg('worlds'), ranks
  };
}

const N = Number.parseInt(process.argv[2], 10) || 500;
const modes = ['standard', 'short'];
const report = {};
modes.forEach(mode => {
  const rows = [];
  for (let seed = 1; seed <= N; seed++) rows.push(play(seed * 7919, mode));
  report[mode] = summarize(rows);
});

console.log('=== 通常版 vs ショート版（練習・勉強2倍、高校経験者・各' + N + 'シード） ===');
modes.forEach(mode => {
  const r = report[mode];
  console.log('\n' + (mode === 'standard' ? '通常版' : 'ショート版（練習・勉強2倍）'));
  console.log('  卒業率 ' + (r.graduationRate * 100).toFixed(1) + '% / 行動 ' + r.actions.toFixed(1) + '回（練習' + r.training.toFixed(1) + '・勉強' + r.study.toFixed(1) + '・休養' + r.rest.toFixed(1) + '・療養' + r.treatment.toFixed(1) + '）');
  console.log('  能力平均 ' + r.ability.toFixed(1) + ' / pt ' + r.points.toFixed(1) + ' / 優勝 ' + r.wins.toFixed(2) + ' / 世界大会 ' + r.worlds.toFixed(2));
  console.log('  怪我 ' + r.injuries.toFixed(2) + ' / 既読イベント ' + r.seenEvents.toFixed(2) + ' / ランク ' + JSON.stringify(r.ranks));
});

console.log('\nJSON ' + JSON.stringify(report));
