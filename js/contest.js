(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 「総合系」仮項目（難易度スコア・ミス率・総合表現力）は基礎能力からの派生値として実装
  function derived(state) {
    const s = state.stats;
    const difficulty = Math.round((s.multiplex + s.isolation + s.saisai) / 3);
    const expression = Math.round((s.composition + s.music + s.staging) / 3);
    const missRate = clamp(Math.round(25 + state.fatigue * 0.3 - s.basic * 0.3), 2, 60);
    return { difficulty, expression, missRate };
  }

  function playerScore(state, rng) {
    rng = rng || Math.random;
    const d = derived(state);
    let score = d.difficulty * 0.45 + state.stats.basic * 0.15 + d.expression * 0.35
      + (state.motivation - 3) * 2 + (rng() * 10 - 5);
    let misses = 0;
    for (let i = 0; i < 2; i++) {
      if (rng() * 100 < d.missRate) misses += 1;
    }
    score -= misses * 8;
    return { score: Math.round(score * 10) / 10, misses };
  }

  const LEVELS = {
    summer:   { base: 30, growth: 8, sd: 10, entrants: 16, points: [40, 25, 15, 8, 2] },
    national: { base: 45, growth: 8, sd: 12, entrants: 16, points: [100, 70, 50, 20, 5] }
  };

  function run(state, contest, rng) {
    rng = rng || Math.random;
    const lv = LEVELS[contest.type];
    const year = Math.ceil(contest.turn / 12);
    const mean = lv.base + lv.growth * (year - 1);
    const opponents = [];
    for (let i = 0; i < lv.entrants - 1; i++) {
      const g = (rng() + rng() + rng()) / 3; // 0..1の山型分布
      opponents.push(mean + (g - 0.5) * 2 * lv.sd * 1.8);
    }
    const p = playerScore(state, rng);
    const rank = 1 + opponents.filter(o => o > p.score).length;
    const half = Math.ceil(lv.entrants / 2);
    const points = rank === 1 ? lv.points[0]
      : rank === 2 ? lv.points[1]
      : rank === 3 ? lv.points[2]
      : rank <= half ? lv.points[3]
      : lv.points[4];
    const result = {
      name: contest.name, type: contest.type, rank,
      entrants: lv.entrants, score: p.score, misses: p.misses, points
    };
    state.results.push(result);
    return result;
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { derived, playerScore, run, contestForTurn, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
