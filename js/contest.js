(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function divisionOf(divisionId) {
    return DT.DATA.DIVISIONS.find(d => d.id === divisionId);
  }

  const round1 = v => Math.round(v * 10) / 10;

  // ジャンル習熟＝そのジャンルの3マス(difficulty/novelty/control)平均。0.1点精度で丸める
  function genreAvg(state, genreId) {
    const cell = state.skills[genreId];
    const sum = DT.DATA.METHODS.reduce((a, m) => a + cell[m.id], 0);
    return round1(sum / DT.DATA.METHODS.length);
  }

  // 多彩性点=Σmin(genreAvg,50)/200×満点(overall.weights.variety)。0.1点精度
  function derivedVariety(state) {
    const cap = DT.DATA.SCORING.overall.weights.variety;
    const sum = DT.DATA.GENRES.reduce((a, g) => a + Math.min(genreAvg(state, g.id), 50), 0);
    return round1(sum / 200 * cap);
  }

  // 基礎点=習熟threshold以上のジャンル数×perElement（習熟=genreAvg）
  function derivedBase(state) {
    const base = DT.DATA.SCORING.base;
    const elements = DT.DATA.GENRES.filter(g => genreAvg(state, g.id) >= base.threshold).length;
    return { elements, points: elements * base.perElement };
  }

  // 総合部門の4ジャンル平均（method単位）。例: 難易度点算出用の4ジャンルdifficulty平均
  function methodAvgAcrossGenres(state, methodId) {
    const sum = DT.DATA.GENRES.reduce((a, g) => a + state.skills[g.id][methodId], 0);
    return sum / DT.DATA.GENRES.length;
  }

  // v4: overall=4ジャンルのmethod平均×weight/100、specialist=skills[divisionId]の該当マス×weight/100（ゲートなし）
  function breakdown(state, divisionId) {
    const division = divisionOf(divisionId);
    const sc = DT.DATA.SCORING[division.scoring];
    const parts = {};
    if (division.scoring === 'overall') {
      Object.keys(sc.weights).forEach(id => {
        if (id === 'variety') {
          parts.variety = derivedVariety(state);
        } else if (id === 'composition') {
          parts.composition = round1(state.composition * sc.weights.composition / 100);
        } else {
          parts[id] = round1(methodAvgAcrossGenres(state, id) * sc.weights[id] / 100);
        }
      });
      parts.fundamentals = derivedBase(state).points;
    } else {
      const cell = state.skills[divisionId];
      Object.keys(sc.weights).forEach(id => {
        if (id === 'composition') {
          parts.composition = round1(state.composition * sc.weights.composition / 100);
        } else {
          parts[id] = round1(cell[id] * sc.weights[id] / 100);
        }
      });
    }
    return parts;
  }

  // 部門ごとの操作安定度参照値: overall→4ジャンルcontrol平均、specialist→skills[divisionId].control
  function controlRef(state, divisionId) {
    const division = divisionOf(divisionId);
    return division.scoring === 'overall'
      ? methodAvgAcrossGenres(state, 'control')
      : state.skills[divisionId].control;
  }

  // 部門ごとの難易度参照値（ハードライン判定用）: overall→4ジャンルdifficulty平均、specialist→skills[divisionId].difficulty
  function difficultyRef(state, divisionId) {
    const division = divisionOf(divisionId);
    return division.scoring === 'overall'
      ? methodAvgAcrossGenres(state, 'difficulty')
      : state.skills[divisionId].difficulty;
  }

  // v4新ミスモデル: rate = clamp(base − control×controlCoef + fatigue×fatigueCoef, min, max)
  // v3で復活: 怪我中(injuredTurns>0)はミス率+15%（ユーザー指定機能。V4移行時に脱落していたため再導入）
  function missRate(state, divisionId) {
    const miss = DT.DATA.SCORING.miss;
    const control = controlRef(state, divisionId);
    const rate = miss.base - control * miss.controlCoef + state.fatigue * miss.fatigueCoef;
    return clamp(Math.round(rate) + (state.injuredTurns > 0 ? miss.injuredPenalty : 0), miss.min, miss.max);
  }

  function missRollCount(state, divisionId) {
    const miss = DT.DATA.SCORING.miss;
    const hard = difficultyRef(state, divisionId) >= miss.hardLine;
    return miss.rolls + (hard ? miss.hardBonusRolls : 0);
  }

  function playerScore(state, divisionId, rng) {
    rng = rng || Math.random;
    const parts = breakdown(state, divisionId);
    const rawTotal = Object.values(parts).reduce((a, v) => a + v, 0);

    const scale = DT.DATA.SCORING.scale;
    let total = scale.base + rawTotal * scale.mult;
    // 調子＋審査員ぶれ（内訳表示できるよう0.1点精度で保持）
    const judgeMod = Math.round(((state.motivation - 3) * 2 + (rng() * 6 - 3)) * 10) / 10;
    total += judgeMod;

    const rolls = missRollCount(state, divisionId);
    const rate = missRate(state, divisionId);
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
    return { score: Math.round(total * 10) / 10, parts, rawTotal, judgeMod, misses, execDeduction, specialDeduction };
  }

  // v4バランス調整（Task4）: グリッド化でスペシャ部門のゲートが廃止された結果、総合部門との整合を取るため
  // oidc/ajdc/worldsのbase・growthを全面的に引き下げた（argminマス狙いの合理的方針では12マスに練習が
  // 分散し、4年でgenreAvgは30台程度にしか伸びない。旧base値は72.4〜92.7display相当の場を想定しており
  // 高すぎたため、卒業時ランクがE/D未満に張り付いていた）。世界大会は別途キャリブレーション要件があり
  // base 63/growth 3/sd 20（ユーザー指定の目安63/3/13からsdのみ広げ、rank6≒88-91・rank3≒93-96に整合させた）。
  // 詳細な反復調整記録は .superpowers/sdd/v4-task-4-report.md 参照
  const LEVELS = {
    oidc: { base: 16, growth: 8, sd: 8, entrants: 16,
            points: { overall: [40, 25, 15, 8, 2], specialist: [20, 13, 8, 4, 1] } },
    ajdc: { base: 24, growth: 7, sd: 10, entrants: 16,
            points: { overall: [100, 70, 50, 20, 5], specialist: [50, 35, 25, 10, 3] } },
    worlds: { base: 63, growth: 3, sd: 20, entrants: 16,
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

  // モブ対戦相手の命名: rngを消費しない決定的割り当て（同一大会内でも式で重複を避ける）
  function opponentName(contest, i) {
    const names = DT.DATA.OPPONENT_NAMES;
    return names[(contest.turn * 7 + i * 5) % names.length];
  }

  // 順位表: 全参加者をスコア降順ソートし、上位3名＋自分＋ライバル（重複除去）にrankを付与して返す
  // rankは「自スコアより厳密に大きい人数+1」（同点は同順位）。result.rankの算出式と一致させる
  function buildStandings(entries, playerEntry) {
    const sorted = entries.slice().sort((a, b) => b.score - a.score);
    const ranked = sorted.map(e => Object.assign({}, e, {
      rank: 1 + entries.filter(o => o.score > e.score).length
    }));
    const picked = [];
    const seen = new Set();
    const add = (e) => {
      const key = e.isPlayer ? 'player' : (e.rivalId ? 'rival:' + e.rivalId : 'mob:' + e.name + ':' + e.rank);
      if (seen.has(key)) return;
      seen.add(key);
      picked.push(e);
    };
    ranked.slice(0, 3).forEach(add);
    ranked.filter(e => e.isPlayer).forEach(add);
    ranked.filter(e => e.rivalId).forEach(add);
    picked.sort((a, b) => a.rank - b.rank);
    return picked;
  }

  function runDivision(state, contest, divisionId, rng) {
    const lv = LEVELS[contest.type];
    const year = Math.ceil(contest.turn / 12);
    const mean = lv.base + lv.growth * (year - 1);

    const rivals = divisionId === 'overall' ? rivalsFor(contest) : [];
    // rng消費順: ライバル→モブ→プレイヤー（変更禁止）
    const rivalEntries = rivals.map(r => ({ rival: r, score: rivalScore(r, contest, rng) }));

    const scale = DT.DATA.SCORING.scale;
    const opponentCount = lv.entrants - 1 - rivalEntries.length;
    const opponents = [];
    for (let i = 0; i < opponentCount; i++) {
      const g = (rng() + rng() + rng()) / 3;
      const raw = mean + (g - 0.5) * 2 * lv.sd * 1.8;
      opponents.push({ name: opponentName(contest, i), score: round1(scale.base + raw * scale.mult) });
    }
    const p = playerScore(state, divisionId, rng);

    const allScores = opponents.map(o => o.score).concat(rivalEntries.map(e => e.score));
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

    const standingEntries = opponents.map(o => ({ name: o.name, score: o.score }))
      .concat(rivalEntries.map(e => ({ name: e.rival.name, score: e.score, rivalId: e.rival.id })))
      .concat([{ name: state.name, score: p.score, isPlayer: true }]);
    const standings = buildStandings(standingEntries);

    return {
      name: contest.name, type: contest.type,
      division: divisionId, divisionLabel: div.label,
      rank, entrants: lv.entrants, score: p.score,
      parts: p.parts, rawTotal: p.rawTotal, judgeMod: p.judgeMod, misses: p.misses,
      execDeduction: p.execDeduction, specialDeduction: p.specialDeduction,
      points, rivalOutcomes, standings, turn: contest.turn
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

  DT.contest = {
    genreAvg, derivedVariety, derivedBase, breakdown, missRate, playerScore,
    maxEntries, runAll, contestForTurn, worldsContestForTurn, worldsQualified,
    rivalScore, LEVELS, buildStandings
  };
})(typeof window !== 'undefined' ? window : globalThis);
