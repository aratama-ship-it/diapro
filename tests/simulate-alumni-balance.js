'use strict';

// 卒業生イベント実装後のショート版を、既知の強い育成方針×先輩3択で比較する。
// 全512方針を大標本で再探索する代わりに、直前の最良方針と今回のスモークで浮上した方針を
// 選定用シードで比較し、未使用シードで難易度別の結果比率を測る。
//
// Usage:
//   node tests/simulate-alumni-balance.js [selectionN] [evaluationN] [outputJson]

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const sourceSimulator = path.join(__dirname, 'simulate-optimal-difficulty.js');
const source = fs.readFileSync(sourceSimulator, 'utf8');
const marker = 'const selectionN = Number.parseInt(process.argv[2], 10) || 200;';
const index = source.indexOf(marker);
if (index < 0) throw new Error('最適方針シミュレーターのCLI境界が見つかりません');
const librarySource = source.slice(0, index) + [
  '',
  'module.exports = { DT, play, mean };',
  ''
].join('\n');
const simulatorModule = new Module(sourceSimulator, module);
simulatorModule.filename = sourceSimulator;
simulatorModule.paths = Module._nodeModulePaths(path.dirname(sourceSimulator));
simulatorModule._compile(librarySource, sourceSimulator);
const { DT, play, mean } = simulatorModule.exports;

const selectionN = Number.parseInt(process.argv[2], 10) || 100;
const evaluationN = Number.parseInt(process.argv[3], 10) || 500;
const outputPath = process.argv[4]
  ? path.resolve(process.argv[4])
  : path.resolve(__dirname, '../docs/analysis/2026-07-23-alumni-balance.json');
const RANKS = ['S', 'A', 'B', 'C', 'D', 'E', '退学'];
const ALUMNI_CHOICES = ['teachAlways', 'firstTeachThenMethod', 'sayingsAlways', 'methodAlways'];

const BASE_POLICIES = [
  { trainPlan: 'adaptive', restLine: 55, academic: 'lean', contestPolicy: 'safe' },
  { trainPlan: 'adaptive', restLine: 55, academic: 'lean', contestPolicy: 'adaptive' },
  { trainPlan: 'adaptive', restLine: 55, academic: 'lean', contestPolicy: 'attack' },
  { trainPlan: 'balance', restLine: 55, academic: 'safe', contestPolicy: 'attack' }
];

function candidates() {
  return BASE_POLICIES.flatMap(base => ALUMNI_CHOICES.map(alumniChoice => Object.assign({}, base, {
    alumniChoice,
    id: [base.trainPlan, 'rest' + base.restLine, base.academic, base.contestPolicy, alumniChoice].join('__')
  })));
}

function runBatch(n, seedBase, background, candidate) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(play(seedBase + i * 7919, 'short', background, candidate));
  }
  return rows;
}

function summarize(rows, background, candidate) {
  const rankCounts = Object.fromEntries(RANKS.map(rank => [rank, rows.filter(row => row.rank === rank).length]));
  const techniqueIds = ['none'].concat(DT.DATA.DEFAULT_ALUMNI.map(alumni => alumni.techniqueId));
  return {
    background,
    difficulty: DT.DATA.BACKGROUNDS.find(item => item.id === background).difficulty,
    n: rows.length,
    candidate,
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
    meanAlumniEvents: mean(rows, row => row.alumniEvents),
    techniqueRates: Object.fromEntries(
      techniqueIds.map(id => [id, mean(rows, row => row.techniqueCard === id ? 1 : 0)])
    )
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  definition: {
    mode: 'short',
    selectionN,
    evaluationN,
    selectionCandidates: candidates().length,
    evaluationSeedsAreHeldOut: true,
    alumniChoicePolicies: ALUMNI_CHOICES,
    eventRule: '奇数月は必ずイベント1件。卒業生イベントは通常イベントを置き換え、大会は別枠',
    caveat: '全行動列の数学的最適解ではなく、既知の強い4育成方針×4先輩方針の中での最良'
  },
  cohorts: []
};

['college', 'highschool', 'juniorhigh'].forEach((background, cohortIndex) => {
  const difficulty = DT.DATA.BACKGROUNDS.find(item => item.id === background).difficulty;
  process.stderr.write('[1/2] ' + difficulty + ': ' + candidates().length + '候補を選定\n');
  const selected = candidates().map((candidate, candidateIndex) => {
    const rows = runBatch(selectionN, 100000000 + cohortIndex * 10000000 + candidateIndex * 100003, background, candidate);
    return { candidate, meanPoints: mean(rows, row => row.points) };
  }).sort((a, b) => b.meanPoints - a.meanPoints);
  const winner = selected[0].candidate;
  process.stderr.write('[2/2] ' + difficulty + ': ' + winner.id + ' を' + evaluationN + 'シード評価\n');
  const rows = runBatch(evaluationN, 300000000 + cohortIndex * 10000000 + 104729, background, winner);
  const cohort = summarize(rows, background, winner);
  cohort.selectionTop5 = selected.slice(0, 5);
  report.cohorts.push(cohort);
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log('保存: ' + outputPath);
report.cohorts.forEach(row => {
  console.log('\n' + row.difficulty + ' / ' + row.candidate.id);
  console.log('  ランク: ' + RANKS.map(rank => rank + '=' + (row.rankRates[rank] * 100).toFixed(1) + '%').join(' '));
  console.log('  平均pt=' + row.meanPoints.toFixed(1)
    + ' 能力=' + row.meanAbility.toFixed(1)
    + ' 卒業生イベント=' + row.meanAlumniEvents.toFixed(2));
});
