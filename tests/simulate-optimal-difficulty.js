'use strict';

// 現行ゲームの難易度別「強いプレイ」探索・評価シミュレーション。
// 未来の乱数を読む完全情報プレイではなく、合法的な固定ヒューリスティック候補を
// 選定用シードで比較し、別シードで最良候補を決め、さらに未使用シードで結果比率を測る。
//
// Usage:
//   node tests/simulate-optimal-difficulty.js [selectionN] [validationN] [evaluationN] [outputJson] [mode] [background] [statMin] [statSpread]

const fs = require('node:fs');
const path = require('node:path');
require('../js/data.js');
require('../js/short-mode.js');
require('../js/contest.js');
require('../js/state.js');
require('../js/engine.js');
require('../js/ending.js');
require('../js/events.js');
const DT = globalThis.DT;

function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mean = (rows, fn) => rows.reduce((sum, row) => sum + fn(row), 0) / rows.length;
const RANKS = ['S', 'A', 'B', 'C', 'D', 'E', '退学'];

function abilityAvg(state) {
  let sum = state.composition;
  DT.DATA.GENRES.forEach(g => DT.DATA.METHODS.forEach(m => { sum += state.skills[g.id][m.id]; }));
  return sum / 13;
}

function unlockedCells(state, methods) {
  const allowed = methods || DT.DATA.METHODS.map(m => m.id);
  const cells = [];
  DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked(state, g.id)).forEach(g => {
    allowed.forEach(method => cells.push({ genre: g.id, method, value: state.skills[g.id][method] }));
  });
  return cells.sort((a, b) => a.value - b.value || a.genre.localeCompare(b.genre) || a.method.localeCompare(b.method));
}

function slot(cell) {
  return cell ? { genre: cell.genre, method: cell.method } : null;
}

function fill3(entries) {
  const out = [];
  const same = (a, b) => a === 'routine' || b === 'routine'
    ? a === b
    : a.genre === b.genre && a.method === b.method;
  for (const entry of entries) {
    if (!entry || out.length >= 3) continue;
    if (out.filter(x => same(x, entry)).length < 2) out.push(entry);
  }
  while (out.length < 3) out.push('routine');
  return out.slice(0, 3);
}

const TRAIN_PLANS = {
  balance: {
    label: '弱点補強',
    slots(state) {
      const c = unlockedCells(state);
      return fill3([slot(c[0]), slot(c[0]), state.composition < 85 ? 'routine' : slot(c[1])]);
    }
  },
  spread: {
    label: '幅広く弱点補強',
    slots(state) {
      const c = unlockedCells(state);
      return fill3([slot(c[0]), slot(c[1]), state.composition < 85 ? 'routine' : slot(c[2])]);
    }
  },
  adaptive: {
    label: '大会・練習会適応',
    slots(state) {
      if (DT.DATA.CONTESTS.some(contest => contest.turn === state.turn)) {
        const c = unlockedCells(state, ['control']);
        return fill3([slot(c[0]), slot(c[1] || c[0]), state.composition < 85 ? 'routine' : slot(c[2])]);
      }
      if (DT.engine.isMeetupMonth(state.turn)) {
        const c = unlockedCells(state, ['novelty']);
        return fill3([slot(c[0]), slot(c[1] || c[0]), state.composition < 85 ? 'routine' : slot(c[2])]);
      }
      const c = unlockedCells(state);
      return fill3([slot(c[0]), slot(c[1]), state.composition < 85 ? 'routine' : slot(c[2])]);
    }
  },
  overall: {
    label: '難易度・構成特化',
    slots(state) {
      const c = unlockedCells(state, ['difficulty']);
      return fill3([slot(c[0]), slot(c[0]), state.composition < 85 ? 'routine' : slot(c[1])]);
    }
  },
  diffControl: {
    label: '難易度・操作特化',
    slots(state) {
      const d = unlockedCells(state, ['difficulty']);
      const c = unlockedCells(state, ['control']);
      return fill3([slot(d[0]), slot(c[0]), state.composition < 85 ? 'routine' : slot(d[1])]);
    }
  },
  control: {
    label: '操作安定特化',
    slots(state) {
      const c = unlockedCells(state, ['control']);
      return fill3([slot(c[0]), slot(c[0]), state.composition < 85 ? 'routine' : slot(c[1])]);
    }
  },
  h1d: {
    label: '1DH一点特化',
    slots() {
      return [
        { genre: 'h1d', method: 'difficulty' },
        { genre: 'h1d', method: 'novelty' },
        { genre: 'h1d', method: 'control' }
      ];
    }
  },
  showman: {
    label: '構成・新奇性特化',
    slots(state) {
      const c = unlockedCells(state, ['novelty']);
      return fill3(['routine', 'routine', slot(c[0])]);
    }
  }
};

const ACADEMICS = {
  lean: { label: '学業最小限', examTarget: 42, floor: 24 },
  safe: { label: '学業安定', examTarget: 46, floor: 30 }
};

function entryAll(turn, state) {
  const contest = DT.contest.contestForTurn(turn);
  if (contest && contest.type === 'shizuoka') return ['technical', 'performance'];
  const specialists = DT.DATA.DIVISIONS
    .filter(d => d.scoring === 'specialist' && DT.contest.isGenreUnlocked(state, d.id))
    .map(d => d.id);
  return ['overall'].concat(specialists.slice(0, DT.contest.maxEntries(turn) - 1));
}

function decideAction(state, candidate) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.banTurns > 0) return state.study < 58 ? 'study' : (state.fatigue > candidate.restLine ? 'rest' : 'study');
  const academic = ACADEMICS[candidate.academic];
  const nextExam = DT.DATA.EXAMS.turns.find(turn => turn >= state.turn);
  const lookahead = state.gameMode === 'short' ? 2 : 1;
  if (nextExam !== undefined && nextExam - state.turn <= lookahead && state.study < academic.examTarget) return 'study';
  if (state.study < academic.floor) return 'study';
  if (state.fatigue > candidate.restLine) return 'rest';
  return 'training';
}

function scoreEffects(state, effects) {
  if (!effects) return 0;
  let value = 0;
  const statValue = item => (item.id === 'composition' ? 1 : 4) * item.amount;
  if (effects.stat) value += statValue(effects.stat);
  if (effects.stats) effects.stats.forEach(item => { value += statValue(item); });
  if (effects.genreStat) value += effects.genreStat.amount;
  if (effects.genreStats) effects.genreStats.forEach(item => { value += item.amount; });
  value += (effects.motivation || 0) * 0.30;
  value -= (effects.fatigue || 0) * 0.18;
  value += (effects.study || 0) * (state.study < 45 ? 0.65 : 0.15);
  value -= (effects.injuryRisk || 0) * 0.20;
  value -= (effects.outdoor || 0) * 4;
  if (effects.flag) value += 8;
  return value;
}

function bestChoiceIndex(state, event) {
  let best = 0;
  let bestScore = -Infinity;
  event.choices.forEach((choice, index) => {
    const score = scoreEffects(state, choice.effects);
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}

function processChoiceEvent(state, event, rng) {
  const choiceIndex = bestChoiceIndex(state, event);
  DT.events.applyChoice(state, event, choiceIndex);
  // 実UIだけにある台湾合宿の追加分岐も再現する。
  if (event.id === 'taiwan_camp' && choiceIndex === 0 && rng() < 0.5) {
    DT.events.applyConditional(state, {
      id: 'taiwan_toilet',
      effects: { motivation: -20, stat: { id: 'difficulty', amount: 4 } }
    });
  }
}

function processPreEvent(state, rng) {
  if (DT.events.isOmikujiTurn(state.turn)) {
    DT.events.drawOmikuji(state, rng);
    return false;
  }
  const conditional = DT.events.conditionalEventFor(state);
  if (conditional) {
    if (conditional.awakenTrigger) {
      // 期待成長が最も高い「波に乗る」を選ぶ。成功率はUIと同じ50%。
      if (rng() < 0.5) DT.events.startAwakening(state, rng);
      else state.motivation = clamp(state.motivation - 20, 0, 100);
    } else if (conditional.choices) {
      processChoiceEvent(state, conditional, rng);
    } else {
      DT.events.applyConditional(state, conditional);
      return conditional.id === 'collapse';
    }
    return false;
  }
  const event = DT.events.roll(state, rng);
  if (event && event.kind === 'char') processChoiceEvent(state, event.event, rng);
  else if (event) DT.events.applyHappening(state, event.event);
  return false;
}

function applySnsChoice(state, rng) {
  if (rng() < DT.DATA.SNS_EVENT.viralChance) {
    state.motivation = clamp(state.motivation + DT.DATA.SNS_EVENT.viralMotivation, 0, 100);
  } else {
    state.motivation = clamp(state.motivation - DT.DATA.SNS_EVENT.existingPenalty, 0, 100);
  }
}

function difficultyRef(state, divisionId) {
  const division = DT.DATA.DIVISIONS.find(d => d.id === divisionId);
  if (!division || division.scoring === 'performance') return 0;
  if (division.scoring === 'overall' || division.scoring === 'technical') {
    return mean(DT.DATA.GENRES, g => state.skills[g.id].difficulty);
  }
  return state.skills[divisionId].difficulty;
}

function expectedScore(state, divisionId, policyId) {
  const policy = DT.DATA.POLICIES[policyId];
  const parts = DT.contest.breakdown(state, divisionId);
  if (parts.difficulty !== undefined) parts.difficulty = Math.round(parts.difficulty * policy.diffMult * 10) / 10;
  const raw = Object.values(parts).reduce((sum, value) => sum + value, 0);
  const miss = DT.DATA.SCORING.miss;
  const rolls = miss.rolls + (difficultyRef(state, divisionId) >= miss.hardLine ? miss.hardBonusRolls : 0);
  const expectedMissDeduction = rolls * DT.contest.missRate(state, divisionId, policyId) / 100 * 1.5;
  const expectedSpecialDeduction = 0.05 * DT.DATA.SCORING.specialDeduction;
  const expectedJudge = (state.motivation - 50) * DT.DATA.MOTIVATION.judgeCoef;
  return raw + expectedJudge - expectedMissDeduction - expectedSpecialDeduction;
}

function chooseContestPolicy(state, divisionIds, configured) {
  if (configured !== 'adaptive') return configured;
  const originalFatigue = state.fatigue;
  let best = 'normal';
  let bestScore = -Infinity;
  for (const policyId of Object.keys(DT.DATA.POLICIES)) {
    let total = 0;
    state.fatigue = originalFatigue;
    divisionIds.forEach((divisionId, index) => {
      if (index > 0) state.fatigue = clamp(state.fatigue + DT.DATA.SCORING.entryFatigue, 0, 100);
      total += expectedScore(state, divisionId, policyId);
    });
    if (total > bestScore) { best = policyId; bestScore = total; }
  }
  state.fatigue = originalFatigue;
  return best;
}

function popularity(state, results) {
  if (!results || results.length === 0 || state.popularitySeen) return;
  if (results[0].type !== 'oidc' && results[0].type !== 'ajdc') return;
  const noveltyAvg = mean(DT.DATA.GENRES, g => state.skills[g.id].novelty);
  const qualifying = results.filter(result => {
    if (result.rank > 3) return false;
    if (result.division === 'overall') return noveltyAvg > 90;
    return state.skills[result.division] && state.skills[result.division].novelty > 90;
  });
  if (qualifying.length === 0) return;
  state.popularitySeen = true;
  state.motivation = clamp(state.motivation + 5 * qualifying.length, 0, 100);
  qualifying.forEach(result => {
    if (result.division === 'overall') {
      DT.DATA.GENRES.forEach(g => { state.skills[g.id].control = clamp(state.skills[g.id].control + 3, 0, 100); });
    } else {
      state.skills[result.division].control = clamp(state.skills[result.division].control + 3, 0, 100);
    }
  });
}

function jjfTier(state) {
  const params = DT.DATA.GENRES.map(g => DT.contest.genreAvg(state, g.id)).concat([state.composition]);
  const avg = mean(params, value => value);
  const min = Math.min(...params);
  if (avg >= DT.DATA.JJF.passSure.avg && min >= DT.DATA.JJF.passSure.min) return 'sure';
  if (avg >= DT.DATA.JJF.passHalf.avg && min >= DT.DATA.JJF.passHalf.min) return 'half';
  return 'none';
}

function processPostEvent(state, rng, candidate) {
  let contestResults = null;
  const contest = DT.contest.contestForTurn(state.turn);
  const worlds = DT.contest.worldsContestForTurn(state.turn);
  const qualifier = DT.contest.jjfQualifierForTurn(state.turn);
  const final = DT.contest.jjfFinalForTurn(state.turn);
  if (contest) {
    const divisions = entryAll(state.turn, state);
    const policy = chooseContestPolicy(state, divisions, candidate.contestPolicy);
    contestResults = DT.contest.runAll(state, contest, divisions, rng, policy);
  } else if (worlds && DT.contest.worldsQualified(state, state.turn)) {
    const divisions = ['overall'];
    const policy = chooseContestPolicy(state, divisions, candidate.contestPolicy);
    contestResults = DT.contest.runAll(state, worlds, divisions, rng, policy);
  } else if (qualifier) {
    // 実力不足圏では参加せず、敗退によるやる気-8を避ける。
    if (jjfTier(state) !== 'none') {
      const result = DT.contest.jjfQualify(state, rng);
      if (result.passed) {
        state.motivation = clamp(state.motivation + DT.DATA.JJF.passMotivation, 0, 100);
        state.jjfFinalist = 1;
        state.results.push({
          name: qualifier.name, type: 'jjf', division: 'qualifier', divisionLabel: 'JJF予選突破',
          rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn,
          standings: [], rivalMessages: []
        });
      } else {
        state.motivation = clamp(state.motivation - 8, 0, 100);
      }
    }
  } else if (final && state.jjfFinalist) {
    state.jjfFinalist = 0;
    contestResults = DT.contest.runJjfFinal(state, final, rng);
  } else {
    const scheduled = DT.events.scheduledEventFor(state);
    if (scheduled) {
      if (scheduled.choices) processChoiceEvent(state, scheduled, rng);
      else DT.events.applyScheduled(state, scheduled);
    }
  }
  return contestResults;
}

function play(seed, mode, background, candidate) {
  const rng = lcg(seed);
  const state = DT.state.newCharacter(rng, background, mode);
  const metrics = { actions: 0, training: 0, study: 0, rest: 0, treatment: 0, injuries: 0 };
  let guard = 0;
  while (state.status === 'playing' && guard++ < 100) {
    const short = mode === 'short';
    const practiceMonth = !short || DT.shortMode.isPracticeMonth(state.turn);
    let action = null;
    if (practiceMonth) action = decideAction(state, candidate);

    // 通常版の療養はUI上、練習前イベントを通らない。ショート版の練習月にも前イベントはない。
    let skipAction = false;
    const shouldRunPreEvent = short ? !practiceMonth : action !== 'injured';
    if (shouldRunPreEvent) skipAction = processPreEvent(state, rng);

    if (practiceMonth && !skipAction) {
      metrics.actions += 1;
      if (action === 'training') {
        metrics.training += 1;
        const training = DT.engine.applyTraining(state, TRAIN_PLANS[candidate.trainPlan].slots(state), rng);
        const injury = DT.engine.rollInjury(state, rng);
        if (injury.injured) metrics.injuries += 1;
        if (training.noveltyGreat) applySnsChoice(state, rng);
      } else {
        if (action === 'study') metrics.study += 1;
        else if (action === 'rest') metrics.rest += 1;
        else if (action === 'injured') metrics.treatment += 1;
        DT.engine.applyAction(state, action, rng);
      }
    } else if (practiceMonth) {
      state.didTrain = false;
      state.didStudy = false;
    }

    const contestResults = processPostEvent(state, rng, candidate);
    DT.engine.endTurn(state, rng);
    popularity(state, contestResults);
  }

  const ending = DT.ending.evaluate(state);
  const ranked = state.results.filter(result => result.division !== 'qualifier');
  return {
    rank: ending.rank,
    status: state.status,
    points: ending.totalPoints,
    ability: abilityAvg(state),
    wins: ranked.filter(result => result.rank === 1).length,
    podiums: ranked.filter(result => result.rank <= 3).length,
    ajdcOverallWin: state.results.some(result => result.type === 'ajdc' && result.division === 'overall' && result.rank === 1),
    worldsQualified: state.results.some(result => result.type === 'worlds'),
    worldsWin: !!ending.worldsWin,
    actions: metrics.actions,
    training: metrics.training,
    study: metrics.study,
    rest: metrics.rest,
    treatment: metrics.treatment,
    injuries: metrics.injuries
  };
}

function candidates() {
  const out = [];
  for (const trainPlan of Object.keys(TRAIN_PLANS)) {
    for (const restLine of [55, 70]) {
      for (const academic of Object.keys(ACADEMICS)) {
        for (const contestPolicy of ['safe', 'normal', 'attack', 'adaptive']) {
          out.push({
            id: [trainPlan, 'rest' + restLine, academic, contestPolicy].join('__'),
            trainPlan, restLine, academic, contestPolicy
          });
        }
      }
    }
  }
  return out;
}

function runBatch(n, seedBase, cohort, candidate) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(play(seedBase + i * 7919, cohort.mode, cohort.background, candidate));
  }
  return rows;
}

function selectionSummary(rows, candidate) {
  return {
    candidate,
    meanPoints: mean(rows, row => row.points),
    graduationRate: mean(rows, row => row.status === 'graduated' ? 1 : 0),
    sRate: mean(rows, row => row.rank === 'S' ? 1 : 0),
    saRate: mean(rows, row => row.rank === 'S' || row.rank === 'A' ? 1 : 0)
  };
}

function finalSummary(rows, cohort, candidate, selectionTop) {
  const rankCounts = Object.fromEntries(RANKS.map(rank => [rank, rows.filter(row => row.rank === rank).length]));
  const background = DT.DATA.BACKGROUNDS.find(bg => bg.id === cohort.background);
  const shortMode = cohort.mode === 'short';
  const statMin = shortMode && background.shortStatMin !== undefined ? background.shortStatMin : background.statMin;
  const statSpread = shortMode && background.shortStatSpread !== undefined ? background.shortStatSpread : background.statSpread;
  return {
    mode: cohort.mode,
    background: cohort.background,
    difficulty: background.difficulty,
    startingRange: {
      statMin,
      statSpread,
      statMax: statMin + statSpread - 1,
      compositionMin: shortMode && background.shortCompMin !== undefined
        ? background.shortCompMin
        : (background.compMin === undefined ? statMin : background.compMin),
      compositionSpread: shortMode && background.shortCompSpread !== undefined
        ? background.shortCompSpread
        : (background.compSpread === undefined ? statSpread : background.compSpread)
    },
    n: rows.length,
    selectedPolicy: {
      id: candidate.id,
      training: TRAIN_PLANS[candidate.trainPlan].label,
      restLine: candidate.restLine,
      academics: ACADEMICS[candidate.academic].label,
      contestPolicy: candidate.contestPolicy
    },
    rankCounts,
    rankRates: Object.fromEntries(RANKS.map(rank => [rank, rankCounts[rank] / rows.length])),
    graduationRate: mean(rows, row => row.status === 'graduated' ? 1 : 0),
    meanPoints: mean(rows, row => row.points),
    meanAbility: mean(rows, row => row.ability),
    meanWins: mean(rows, row => row.wins),
    meanPodiums: mean(rows, row => row.podiums),
    ajdcOverallWinRate: mean(rows, row => row.ajdcOverallWin ? 1 : 0),
    worldsQualifiedRate: mean(rows, row => row.worldsQualified ? 1 : 0),
    worldsWinRate: mean(rows, row => row.worldsWin ? 1 : 0),
    meanActions: mean(rows, row => row.actions),
    meanTraining: mean(rows, row => row.training),
    meanStudy: mean(rows, row => row.study),
    meanRest: mean(rows, row => row.rest),
    meanTreatment: mean(rows, row => row.treatment),
    meanInjuries: mean(rows, row => row.injuries),
    validationTop5: selectionTop
  };
}

function cohortSeed(cohortIndex, phase) {
  return (phase * 100000000 + cohortIndex * 10000000 + 104729) >>> 0;
}

const selectionN = Number.parseInt(process.argv[2], 10) || 200;
const validationN = Number.parseInt(process.argv[3], 10) || 1000;
const evaluationN = Number.parseInt(process.argv[4], 10) || 10000;
const outputPath = process.argv[5] ? path.resolve(process.argv[5]) : null;
const modeFilter = process.argv[6] || null;
const backgroundFilter = process.argv[7] || null;
const statMinArg = process.argv[8];
const statSpreadArg = process.argv[9];
const statMinOverride = statMinArg === undefined ? null : Number.parseInt(statMinArg, 10);
const statSpreadOverride = statSpreadArg === undefined ? null : Number.parseInt(statSpreadArg, 10);
if ((statMinOverride !== null || statSpreadOverride !== null) && !backgroundFilter) {
  throw new Error('初期値レンジの上書きにはbackground指定が必要です');
}
if (statMinOverride !== null || statSpreadOverride !== null) {
  const target = DT.DATA.BACKGROUNDS.find(background => background.id === backgroundFilter);
  if (!target) throw new Error('未知のbackgroundId: ' + backgroundFilter);
  const shortOverride = modeFilter === 'short';
  if (statMinOverride !== null) target[shortOverride ? 'shortStatMin' : 'statMin'] = statMinOverride;
  if (statSpreadOverride !== null) target[shortOverride ? 'shortStatSpread' : 'statSpread'] = statSpreadOverride;
}
const allCandidates = candidates();
const cohorts = [];
for (const mode of ['short', 'standard']) {
  for (const background of ['college', 'highschool', 'juniorhigh']) {
    if (modeFilter && mode !== modeFilter) continue;
    if (backgroundFilter && background !== backgroundFilter) continue;
    cohorts.push({ mode, background });
  }
}
if (cohorts.length === 0) throw new Error('対象コホートがありません: mode=' + modeFilter + ' background=' + backgroundFilter);

const report = {
  generatedAt: new Date().toISOString(),
  definition: {
    selectionCriterion: '選定用シードで上位5方針を抽出し、別の検証シードで平均ポイントが最大の方針を採用',
    candidateCount: allCandidates.length,
    selectionN,
    validationN,
    evaluationN,
    evaluationSeedsAreHeldOut: true,
    backgroundOverride: backgroundFilter && (statMinOverride !== null || statSpreadOverride !== null)
      ? { background: backgroundFilter, statMin: statMinOverride, statSpread: statSpreadOverride }
      : null,
    modes: { short: '24行動・練習と勉強の上昇値2倍', standard: '48行動の通常版' },
    caveat: '候補として定義したヒューリスティックの中での最良であり、全行動列を総当たりした数学的な真の最適解ではない'
  },
  cohorts: []
};

cohorts.forEach((cohort, cohortIndex) => {
  const bg = DT.DATA.BACKGROUNDS.find(item => item.id === cohort.background);
  process.stderr.write('[1/3] ' + cohort.mode + ' / ' + bg.difficulty + ': ' + allCandidates.length + '候補を選定\n');
  const screened = allCandidates.map(candidate =>
    selectionSummary(runBatch(selectionN, cohortSeed(cohortIndex, 1), cohort, candidate), candidate));
  screened.sort((a, b) => b.meanPoints - a.meanPoints || b.graduationRate - a.graduationRate || b.saRate - a.saRate);
  const finalists = screened.slice(0, 5).map(item =>
    selectionSummary(runBatch(validationN, cohortSeed(cohortIndex, 2), cohort, item.candidate), item.candidate));
  finalists.sort((a, b) => b.meanPoints - a.meanPoints || b.graduationRate - a.graduationRate || b.saRate - a.saRate);
  const winner = finalists[0].candidate;
  process.stderr.write('[2/3] ' + cohort.mode + ' / ' + bg.difficulty + ': 採用=' + winner.id + '\n');
  const evaluationRows = runBatch(evaluationN, cohortSeed(cohortIndex, 3), cohort, winner);
  const top = finalists.map(item => ({
    id: item.candidate.id,
    meanPoints: item.meanPoints,
    graduationRate: item.graduationRate,
    sRate: item.sRate,
    saRate: item.saRate
  }));
  report.cohorts.push(finalSummary(evaluationRows, cohort, winner, top));
  process.stderr.write('[3/3] ' + cohort.mode + ' / ' + bg.difficulty + ': ' + evaluationN + 'シード評価完了\n');
});

const json = JSON.stringify(report, null, 2) + '\n';
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, json);
  console.log('保存: ' + outputPath);
}

console.log('\n=== 難易度別・最良候補のランク比率 ===');
report.cohorts.forEach(row => {
  console.log('\n' + row.mode + ' / ' + row.difficulty + ' / ' + row.selectedPolicy.id);
  console.log('  ランク: ' + RANKS.map(rank => rank + '=' + (row.rankRates[rank] * 100).toFixed(1) + '%').join(' '));
  console.log('  平均pt=' + row.meanPoints.toFixed(1) + ' 能力=' + row.meanAbility.toFixed(1) +
    ' 優勝=' + row.meanWins.toFixed(2) + ' AJDC総合V=' + (row.ajdcOverallWinRate * 100).toFixed(1) +
    '% 世界出場=' + (row.worldsQualifiedRate * 100).toFixed(1) + '% 世界V=' + (row.worldsWinRate * 100).toFixed(2) + '%');
});
