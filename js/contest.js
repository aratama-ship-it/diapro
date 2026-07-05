(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function divisionOf(divisionId) {
    return DT.DATA.DIVISIONS.find(d => d.id === divisionId);
  }

  function breakdown(state, divisionId) {
    const sc = DT.DATA.SCORING[divisionOf(divisionId).scoring];
    const parts = {};
    Object.keys(sc.weights).forEach(id => {
      parts[id] = Math.round(state.stats[id] * sc.weights[id]) / 100;
    });
    if (sc.base) {
      const elements = Math.min(sc.base.elements, Math.floor(state.stats[sc.base.stat] / 25));
      parts[sc.base.stat] = elements * sc.base.perElement;
    }
    return parts;
  }

  function missRate(state) {
    return clamp(Math.round(25 + state.fatigue * 0.3 - state.stats.control * 0.3), 2, 60);
  }

  function playerScore(state, divisionId, rng) {
    rng = rng || Math.random;
    const parts = breakdown(state, divisionId);
    let total = Object.values(parts).reduce((a, v) => a + v, 0);
    // 調子＋審査員ぶれ（内訳表示できるよう0.1点精度で保持）
    const judgeMod = Math.round(((state.motivation - 3) * 2 + (rng() * 6 - 3)) * 10) / 10;
    total += judgeMod;

    const rolls = state.stats.difficulty >= 60 ? 3 : 2;
    const rate = missRate(state);
    let misses = 0;
    let execDeduction = 0;
    for (let i = 0; i < rolls; i++) {
      if (rng() * 100 < rate) {
        misses += 1;
        execDeduction += 1 + Math.round(rng() * (DT.DATA.SCORING.execDeductionMax - 1));
      }
    }
    const specialDeduction = rng() * 100 < 5 ? DT.DATA.SCORING.specialDeduction : 0;

    total -= execDeduction + specialDeduction;
    return { score: Math.round(total * 10) / 10, parts, judgeMod, misses, execDeduction, specialDeduction };
  }

  const LEVELS = {
    oidc: { base: 25, growth: 5, sd: 10, entrants: 16,
            points: { overall: [40, 25, 15, 8, 2], specialist: [20, 13, 8, 4, 1] } },
    ajdc: { base: 35, growth: 7, sd: 12, entrants: 16,
            points: { overall: [100, 70, 50, 20, 5], specialist: [50, 35, 25, 10, 3] } }
  };

  function maxSpecialists(turn) {
    const specialistCount = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').length;
    return Math.min(specialistCount, Math.ceil(turn / 12));
  }

  function runDivision(state, contest, divisionId, rng) {
    const lv = LEVELS[contest.type];
    const year = Math.ceil(contest.turn / 12);
    const mean = lv.base + lv.growth * (year - 1);
    const opponents = [];
    for (let i = 0; i < lv.entrants - 1; i++) {
      const g = (rng() + rng() + rng()) / 3;
      opponents.push(mean + (g - 0.5) * 2 * lv.sd * 1.8);
    }
    const p = playerScore(state, divisionId, rng);
    const rank = 1 + opponents.filter(o => o > p.score).length;
    const half = Math.ceil(lv.entrants / 2);
    const div = divisionOf(divisionId);
    const table = lv.points[div.scoring];
    const points = rank === 1 ? table[0]
      : rank === 2 ? table[1]
      : rank === 3 ? table[2]
      : rank <= half ? table[3]
      : table[4];
    return {
      name: contest.name, type: contest.type,
      division: divisionId, divisionLabel: div.label,
      rank, entrants: lv.entrants, score: p.score,
      parts: p.parts, judgeMod: p.judgeMod, misses: p.misses,
      execDeduction: p.execDeduction, specialDeduction: p.specialDeduction,
      points
    };
  }

  function runAll(state, contest, specialistIds, rng) {
    rng = rng || Math.random;
    const order = ['overall'].concat(specialistIds || []);
    const results = [];
    order.forEach((id, i) => {
      if (i > 0) state.fatigue = clamp(state.fatigue + DT.DATA.SCORING.entryFatigue, 0, 100);
      const r = runDivision(state, contest, id, rng);
      state.results.push(r);
      results.push(r);
    });
    return results;
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { breakdown, missRate, playerScore, maxSpecialists, runAll, contestForTurn, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
