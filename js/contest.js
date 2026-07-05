(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // JDA採点規則: 各項目点＝能力値×配点/100。基礎点のみ段階式（25ごとに1要素×5点）
  function breakdown(state) {
    const sc = DT.DATA.SCORING;
    const parts = {};
    Object.keys(sc.weights).forEach(id => {
      parts[id] = Math.round(state.stats[id] * sc.weights[id]) / 100;
    });
    const elements = Math.min(sc.base.elements, Math.floor(state.stats[sc.base.stat] / 25));
    parts[sc.base.stat] = elements * sc.base.perElement;
    return parts;
  }

  function missRate(state) {
    return clamp(Math.round(25 + state.fatigue * 0.3 - state.stats.control * 0.3), 2, 60);
  }

  function playerScore(state, rng) {
    rng = rng || Math.random;
    const parts = breakdown(state);
    let total = Object.values(parts).reduce((a, v) => a + v, 0);
    total += (state.motivation - 3) * 2 + (rng() * 6 - 3); // 調子＋審査員ぶれ

    // 実施減点: ミスごとに1〜2点。高難易度構成は判定回数が増える（攻めるほどリスク増）
    const rolls = state.stats.difficulty >= 60 ? 3 : 2;
    const rate = missRate(state);
    let misses = 0;
    let execDeduction = 0;
    for (let i = 0; i < rolls; i++) {
      if (rng() * 100 < rate) {
        misses += 1;
        execDeduction += 1 + Math.round(rng()); // 1点 or 2点（最大 execDeductionMax）
      }
    }
    // 特別減点: 低確率で演技スペース外（両足）
    const specialDeduction = rng() * 100 < 5 ? DT.DATA.SCORING.specialDeduction : 0;

    total -= execDeduction + specialDeduction;
    return { score: Math.round(total * 10) / 10, parts, misses, execDeduction, specialDeduction };
  }

  // 新100点スケールに合わせて調整（プレイヤーの現実的な最終スコアは40〜55点程度）
  const LEVELS = {
    summer:   { base: 25, growth: 5, sd: 10, entrants: 16, points: [40, 25, 15, 8, 2] },
    national: { base: 35, growth: 7, sd: 12, entrants: 16, points: [100, 70, 50, 20, 5] }
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
      entrants: lv.entrants, score: p.score, misses: p.misses,
      parts: p.parts, execDeduction: p.execDeduction, specialDeduction: p.specialDeduction,
      points
    };
    state.results.push(result);
    return result;
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { breakdown, missRate, playerScore, run, contestForTurn, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
