(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function divisionOf(divisionId) {
    return DT.DATA.DIVISIONS.find(d => d.id === divisionId);
  }

  const round1 = v => Math.round(v * 10) / 10;

  // 多彩性点=Σmin(genre,50)/200×満点(overall.weights.variety)。0.1点精度
  function derivedVariety(state) {
    const cap = DT.DATA.SCORING.overall.weights.variety;
    const sum = DT.DATA.GENRES.reduce((a, g) => a + Math.min(state.genres[g.id], 50), 0);
    return round1(sum / 200 * cap);
  }

  // 基礎点=習熟threshold以上のジャンル数×perElement
  function derivedBase(state) {
    const base = DT.DATA.SCORING.base;
    const elements = DT.DATA.GENRES.filter(g => state.genres[g.id] >= base.threshold).length;
    return { elements, points: elements * base.perElement };
  }

  function breakdown(state, divisionId) {
    const division = divisionOf(divisionId);
    const sc = DT.DATA.SCORING[division.scoring];
    const parts = {};
    if (division.scoring === 'overall') {
      Object.keys(sc.weights).forEach(id => {
        if (id === 'variety') {
          parts.variety = derivedVariety(state);
        } else {
          parts[id] = round1(state.stats[id] * sc.weights[id] / 100);
        }
      });
      parts.fundamentals = derivedBase(state).points;
    } else {
      Object.keys(sc.weights).forEach(id => {
        parts[id] = round1(state.stats[id] * sc.weights[id] / 100);
      });
    }
    return parts;
  }

  function missRate(state) {
    const injuryPenalty = state.injuredTurns > 0 ? 15 : 0;
    return clamp(Math.round(25 + state.fatigue * 0.3 - state.stats.control * 0.3 + injuryPenalty), 2, 60);
  }

  function playerScore(state, divisionId, rng) {
    rng = rng || Math.random;
    const division = divisionOf(divisionId);
    const parts = breakdown(state, divisionId);
    let rawTotal = Object.values(parts).reduce((a, v) => a + v, 0);
    let gateMult = 1;
    if (division.scoring === 'specialist') {
      const gate = DT.DATA.SCORING.gate;
      const mult = gate.min + gate.span * (state.genres[divisionId] / 100);
      rawTotal = round1(rawTotal * mult);
      gateMult = Math.round(mult * 100) / 100;
    }
    const scale = DT.DATA.SCORING.scale;
    let total = scale.base + rawTotal * scale.mult;
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
    return { score: Math.round(total * 10) / 10, parts, rawTotal, judgeMod, misses, execDeduction, specialDeduction, gateMult };
  }

  // v3バランス調整（Task4）: SLOTSゲイン縮小（1/1/1）と合わせて対戦相手の成長カーブも引き上げた。
  // oidc.baseは既存テスト固定値(25)のため不変。ajdc/worldsのbase・growth・ajdc.sdを調整し、
  // 「毎回AJDC総合で優勝してS」にならないようにした（詳細は.superpowers/sdd/v3-task-4-report.md参照）
  const LEVELS = {
    oidc: { base: 25, growth: 15, sd: 10, entrants: 16,
            points: { overall: [40, 25, 15, 8, 2], specialist: [20, 13, 8, 4, 1] } },
    ajdc: { base: 45, growth: 12, sd: 14, entrants: 16,
            points: { overall: [100, 70, 50, 20, 5], specialist: [50, 35, 25, 10, 3] } },
    worlds: { base: 60, growth: 8, sd: 8, entrants: 16,
              points: { overall: [150, 100, 70, 30, 10], specialist: [75, 50, 35, 15, 5] } }
  };

  function maxEntries(turn) {
    return Math.min(DT.DATA.DIVISIONS.length, Math.ceil(turn / 12) + 1);
  }

  function rivalScore(rival, contest, rng) {
    rng = rng || Math.random;
    const year = Math.ceil(contest.turn / 12);
    const raw = rival.base + rival.growth * (year - 1) + (rng() - 0.5) * 2 * rival.sd;
    const scale = DT.DATA.SCORING.scale;
    return round1(scale.base + raw * scale.mult);
  }

  function rivalsFor(contest) {
    return DT.DATA.RIVALS.filter(r => r.contests.includes(contest.type));
  }

  function runDivision(state, contest, divisionId, rng) {
    const lv = LEVELS[contest.type];
    const year = Math.ceil(contest.turn / 12);
    const mean = lv.base + lv.growth * (year - 1);

    const rivals = divisionId === 'overall' ? rivalsFor(contest) : [];
    const rivalEntries = rivals.map(r => ({ rival: r, score: rivalScore(r, contest, rng) }));

    const scale = DT.DATA.SCORING.scale;
    const opponents = [];
    for (let i = 0; i < lv.entrants - 1 - rivalEntries.length; i++) {
      const g = (rng() + rng() + rng()) / 3;
      const raw = mean + (g - 0.5) * 2 * lv.sd * 1.8;
      opponents.push(round1(scale.base + raw * scale.mult));
    }
    const p = playerScore(state, divisionId, rng);
    const allScores = opponents.concat(rivalEntries.map(e => e.score));
    const rank = 1 + allScores.filter(o => o > p.score).length;
    const half = Math.ceil(lv.entrants / 2);
    const div = divisionOf(divisionId);
    const table = lv.points[div.scoring];
    const points = rank === 1 ? table[0]
      : rank === 2 ? table[1]
      : rank === 3 ? table[2]
      : rank <= half ? table[3]
      : table[4];
    const rivalOutcomes = rivalEntries.map(e => ({
      id: e.rival.id, name: e.rival.name, score: e.score, beat: p.score > e.score
    }));
    return {
      name: contest.name, type: contest.type,
      division: divisionId, divisionLabel: div.label,
      rank, entrants: lv.entrants, score: p.score,
      parts: p.parts, rawTotal: p.rawTotal, judgeMod: p.judgeMod, misses: p.misses,
      execDeduction: p.execDeduction, specialDeduction: p.specialDeduction, gateMult: p.gateMult,
      points, rivalOutcomes, turn: contest.turn
    };
  }

  function runAll(state, contest, divisionIds, rng) {
    rng = rng || Math.random;
    const order = divisionIds || [];
    if (order.length === 0) return [];
    const results = [];
    order.forEach((id, i) => {
      if (i > 0) state.fatigue = clamp(state.fatigue + DT.DATA.SCORING.entryFatigue, 0, 100);
      const r = runDivision(state, contest, id, rng);
      state.results.push(r);
      if (id === 'overall') {
        const rivalMessages = [];
        let beatAny = false;
        r.rivalOutcomes.forEach(o => {
          if (o.beat) {
            state.rivalRecord[o.id].win += 1;
            beatAny = true;
            rivalMessages.push(o.name + 'に勝った！（' + o.score + '点）');
          } else {
            state.rivalRecord[o.id].lose += 1;
            rivalMessages.push(o.name + 'に敗れた…（' + o.score + '点）');
            if (o.id === 'shion') state.motivation = clamp(state.motivation - 1, 1, 5);
          }
        });
        if (beatAny) state.motivation = clamp(state.motivation + 1, 1, 5);
        r.rivalMessages = rivalMessages;
      } else {
        r.rivalMessages = [];
      }
      results.push(r);
    });
    return results;
  }

  function worldsContestForTurn(turn) {
    if (!DT.DATA.WORLDS_TURNS.includes(turn)) return null;
    const year = Math.ceil(turn / 12);
    return { turn, type: 'worlds', name: year + '年 世界大会' };
  }

  function worldsQualified(state, worldsTurn) {
    return state.results.some(r =>
      r.rank === 1 && (r.type === 'oidc' || r.type === 'ajdc') &&
      r.turn > worldsTurn - 12 && r.turn < worldsTurn
    );
  }

  function contestForTurn(turn) {
    return DT.DATA.CONTESTS.find(c => c.turn === turn) || null;
  }

  DT.contest = { derivedVariety, derivedBase, breakdown, missRate, playerScore, maxEntries, runAll, contestForTurn, worldsContestForTurn, worldsQualified, rivalScore, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
