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

  // 各項目の満点。stat系はweight、多彩性はweights.variety、基礎は elements×perElement。
  function partMaxOf(scoring, id) {
    if (id === 'fundamentals') return DT.DATA.SCORING.base.elements * DT.DATA.SCORING.base.perElement;
    return DT.DATA.SCORING[scoring].weights[id];
  }
  // 40%下限リマップ（v6, 2026-07-07 実プレイ反映）: どの項目も最低でも満点の componentFloor(40%) 出るようにし、
  // 能力0で40%、能力100で100%になる線形リマップ。floored = floor×max + (1-floor)×raw。
  // これで素点合計が既に妥当な帯(40〜100)になるため、旧スケール換算(base+raw×mult)は廃止した（scale={base:0,mult:1}）。
  function floorPart(scoring, id, raw) {
    const floor = DT.DATA.SCORING.componentFloor;
    return round1(floor * partMaxOf(scoring, id) + (1 - floor) * raw);
  }

  // v6: 各採点項目に40%下限を適用。overall=4ジャンルmethod平均×weight/100、specialist=該当マス×weight/100（ゲートなし）
  function breakdown(state, divisionId) {
    const division = divisionOf(divisionId);
    const scoring = division.scoring;
    const sc = DT.DATA.SCORING[scoring];
    const parts = {};
    if (scoring === 'overall') {
      Object.keys(sc.weights).forEach(id => {
        if (id === 'variety') {
          parts.variety = floorPart(scoring, 'variety', derivedVariety(state));
        } else if (id === 'composition') {
          parts.composition = floorPart(scoring, 'composition', state.composition * sc.weights.composition / 100);
        } else {
          parts[id] = floorPart(scoring, id, methodAvgAcrossGenres(state, id) * sc.weights[id] / 100);
        }
      });
      parts.fundamentals = floorPart(scoring, 'fundamentals', derivedBase(state).points);
    } else if (scoring === 'technical') {
      // 静岡DC テクニカル: 12項目(4ジャンル×3技術)の平均を単一の総合点に（構成は不参加）
      const total = DT.DATA.GENRES.reduce((a, g) => a + DT.DATA.METHODS.reduce((b, m) => b + state.skills[g.id][m.id], 0), 0);
      const avg12 = total / (DT.DATA.GENRES.length * DT.DATA.METHODS.length);
      parts.technical = floorPart(scoring, 'technical', avg12 * sc.weights.technical / 100);
    } else if (scoring === 'performance') {
      // 静岡DC パフォーマンス: 構成のみ
      parts.composition = floorPart(scoring, 'composition', state.composition * sc.weights.composition / 100);
    } else {
      const cell = state.skills[divisionId];
      Object.keys(sc.weights).forEach(id => {
        if (id === 'composition') {
          parts.composition = floorPart(scoring, 'composition', state.composition * sc.weights.composition / 100);
        } else {
          parts[id] = floorPart(scoring, id, cell[id] * sc.weights[id] / 100);
        }
      });
    }
    return parts;
  }

  // 部門ごとの操作安定度参照値: overall/technical→4ジャンルcontrol平均、performance→構成の完成度、specialist→skills[divisionId].control
  function controlRef(state, divisionId) {
    const sc = divisionOf(divisionId).scoring;
    if (sc === 'overall' || sc === 'technical') return methodAvgAcrossGenres(state, 'control');
    if (sc === 'performance') return state.composition;
    return state.skills[divisionId].control;
  }

  // 部門ごとの難易度参照値（ハードライン判定用）: overall/technical→4ジャンルdifficulty平均、performance→0(ハードボーナス無し)、specialist→skills[divisionId].difficulty
  function difficultyRef(state, divisionId) {
    const sc = divisionOf(divisionId).scoring;
    if (sc === 'overall' || sc === 'technical') return methodAvgAcrossGenres(state, 'difficulty');
    if (sc === 'performance') return 0;
    return state.skills[divisionId].difficulty;
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
    const judgeMod = Math.round(((state.motivation - 50) * DT.DATA.MOTIVATION.judgeCoef + (rng() * 6 - 3)) * 10) / 10;
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

  // v5バランス調整（実プレイフィードバック 2026-07-07）: 旧base値（oidc16/ajdc24）は初期能力
  // （素点20台）にすら負けており、1年生の初大会からほぼ確実に優勝できてしまっていた（実測turn5勝率27%）。
  // 「それなりの能力でも国内では14〜15位止まり（優勝には程遠い）、優勝は近年の全力投球でようやく」という
  // ユーザー指定の目標に合わせ、oidc/ajdcのbase・sdを引き上げ。まともな方針（argmin弱点狙い）30シードで
  // 検証：turn5勝率0/30・turn5平均順位14.0位、AJDC総合(4年)優勝3/30、世界大会出場17/30（詳細tests/参照）。
  // 世界大会はユーザー指定の「90点・8割以上で戦える」という目標に既に合致していたため変更なし
  // （base 63/growth 3/sd 20、詳細は .superpowers/sdd/v4-task-4-report.md 参照）。
  // v6（2026-07-07 スケール廃止に伴う再設定）: スケール換算を廃止したため、相手レベルは
  // 「表示スコアそのもの」の空間で定義する（display = base + growth×(年-1) + ノイズ）。
  // 目標: 1位は突出して80点以上（勝者はほぼ確実に80台）、中央は下げてばらつきを持たせ下位は戦える。
  //   OIDC(mean72/sd12): 1位平均≒84（約9割が80以上）・中プレイヤーは約7位。AJDC/世界大会はさらに高帯。
  //   実乱数のため個々の大会では稀に80をわずかに下回る（壁化を避けるためsdを残す）。ポイント配分は不変。
  const LEVELS = {
    oidc: { base: 72, growth: 1, sd: 12, entrants: 16,
            points: { overall: [40, 25, 15, 8, 2], specialist: [20, 13, 8, 4, 1] } },
    ajdc: { base: 76, growth: 1.5, sd: 12, entrants: 16,
            points: { overall: [100, 70, 50, 20, 5], specialist: [50, 35, 25, 10, 3] } },
    worlds: { base: 85, growth: 1, sd: 11, entrants: 16,
              points: { overall: [150, 100, 70, 30, 10], specialist: [75, 50, 35, 15, 5] } },
    // 静岡DC(1月): 参加資格全員・ポイントは通常の半分程度。部門ごとに相手レベルを変える(divLevels)。
    //   テクニカル=優勝ラインが80点超になる高めの帯＋中sd(実測: 最上位中央値82〜85, p10でも80超)。
    //   パフォーマンス=構成95付近が優勝ラインになる高めの帯＋低sd(最上位88〜91)。
    shizuoka: {
      base: 55, growth: 1, sd: 15, entrants: 12, // フォールバック（通常はdivLevelsを使用）
      points: { technical: [10, 6, 4, 2, 1], performance: [10, 6, 4, 2, 1] },
      divLevels: {
        technical:   { base: 77, sd: 6 },
        performance: { base: 84, sd: 5 }
      }
    }
  };

  // 技術解禁ツリー: genreId が現在解禁されているか。requires=null（根）は常にtrue。
  // スキルは単調増加なので、都度genreAvgで判定すれば永続フラグ無しで常に正しい。
  // チェーン依存: 前提ジャンル自身も解禁済みでなければならない（前提の習熟>閾値だけでは不十分）。
  //   例: d3は「d2が解禁済み かつ d2習熟>20」の両方が必要。d2の初期値がたまたま高くても、
  //   h1dが低くてd2が未解禁なら d3 も未解禁のまま（再帰で前提チェーンを辿る）。
  function isGenreUnlocked(state, genreId) {
    const node = DT.DATA.SKILL_TREE[genreId];
    const req = node ? node.requires : null;
    if (!req) return true;
    return isGenreUnlocked(state, req.genre) && genreAvg(state, req.genre) > req.threshold;
  }

  // 今解禁済みで state.announcedUnlocks に未登録のジャンルid（解禁演出用）
  function newlyUnlockedGenres(state) {
    const announced = state.announcedUnlocks || [];
    return DT.DATA.GENRES.map(g => g.id)
      .filter(id => isGenreUnlocked(state, id) && announced.indexOf(id) < 0);
  }

  // UI「次の解禁」表示用: 前提ジャンルが解禁済みの未解禁ジャンルのうち、残り習熟が最小のもの。無ければnull。
  function nextUnlockTarget(state) {
    const targets = DT.DATA.GENRES.map(g => g.id)
      .filter(id => !isGenreUnlocked(state, id))
      .map(id => {
        const req = DT.DATA.SKILL_TREE[id].requires;
        return { id: id, reqGenre: req.genre,
                 remaining: Math.max(1, Math.ceil((req.threshold + 0.1) - genreAvg(state, req.genre))) };
      })
      .filter(t => isGenreUnlocked(state, t.reqGenre));
    if (targets.length === 0) return null;
    targets.sort((a, b) => a.remaining - b.remaining);
    return targets[0];
  }

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
  // OIDCは国際大会なので国際名プール（台湾/フランス/アメリカ風）を使う
  function opponentName(contest, i) {
    const names = contest.type === 'oidc' ? DT.DATA.OPPONENT_NAMES_INTL : DT.DATA.OPPONENT_NAMES;
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
    // 部門別の相手レベル上書き(divLevels)があればそれを使う。無ければ大会共通のlv（既存大会は挙動不変）
    const dlv = (lv.divLevels && lv.divLevels[divisionId]) ? lv.divLevels[divisionId] : lv;
    const year = Math.ceil(contest.turn / 12);
    const base = dlv.base !== undefined ? dlv.base : lv.base;
    const growth = dlv.growth !== undefined ? dlv.growth : lv.growth;
    const sd = dlv.sd !== undefined ? dlv.sd : lv.sd;
    const mean = base + growth * (year - 1);

    const rivals = divisionId === 'overall' ? rivalsFor(contest) : [];
    // rng消費順: ライバル→モブ→プレイヤー（変更禁止）
    const rivalEntries = rivals.map(r => ({ rival: r, score: rivalScore(r, contest, rng) }));

    const scale = DT.DATA.SCORING.scale;
    const opponentCount = lv.entrants - 1 - rivalEntries.length;
    const opponents = [];
    for (let i = 0; i < opponentCount; i++) {
      const g = (rng() + rng() + rng()) / 3;
      const raw = mean + (g - 0.5) * 2 * sd * 1.8;
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
            if (o.id === 'shion') state.motivation = clamp(state.motivation - 8, 0, 100);
          }
        });
        if (beatAny) state.motivation = clamp(state.motivation + 8, 0, 100);
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

  // --- JJF（ジャグリング全国大会・ディアボロ）: 9月予選(参加任意) → 10月決勝(予選突破者のみ) ---
  function jjfQualifierForTurn(turn) {
    if (DT.DATA.JJF.qualifierTurns.indexOf(turn) < 0) return null;
    return { turn: turn, type: 'jjf-qualifier', name: Math.ceil(turn / 12) + '年 JJF予選' };
  }
  function jjfFinalForTurn(turn) {
    if (DT.DATA.JJF.finalTurns.indexOf(turn) < 0) return null;
    return { turn: turn, type: 'jjf', name: Math.ceil(turn / 12) + '年 JJF決勝' };
  }

  // 予選突破判定: 4ジャンル習熟＋演技構成の「平均」と「最低」で、バランス良く高いかを見る。
  //   sure=確実突破 / half=50% / none=不可。rng未指定時はMath.random。
  function jjfQualify(state, rng) {
    rng = rng || Math.random;
    const jjf = DT.DATA.JJF;
    const params = DT.DATA.GENRES.map(g => genreAvg(state, g.id)).concat([state.composition]);
    const avg = params.reduce((a, v) => a + v, 0) / params.length;
    const min = Math.min.apply(null, params);
    let tier;
    if (avg >= jjf.passSure.avg && min >= jjf.passSure.min) tier = 'sure';
    else if (avg >= jjf.passHalf.avg && min >= jjf.passHalf.min) tier = 'half';
    else tier = 'none';
    const passed = tier === 'sure' || (tier === 'half' && rng() < 0.5);
    return { passed: passed, tier: tier, avg: round1(avg), min: round1(min) };
  }

  // 決勝(10人): プレイヤーは総合スコアで争う。上位3名のみ追加ポイント。決勝進出の10ptは予選側で付与済み。
  function runJjfFinal(state, contest, rng) {
    rng = rng || Math.random;
    const jjf = DT.DATA.JJF;
    const lvl = jjf.finalLevel;
    const year = Math.ceil(contest.turn / 12);
    const mean = lvl.base + (lvl.growth || 0) * (year - 1);
    const scale = DT.DATA.SCORING.scale;
    const opponents = [];
    for (let i = 0; i < jjf.finalEntrants - 1; i++) {
      const g = (rng() + rng() + rng()) / 3;
      const raw = mean + (g - 0.5) * 2 * lvl.sd * 1.8;
      opponents.push({ name: opponentName(contest, i), score: round1(scale.base + raw * scale.mult) });
    }
    const p = playerScore(state, 'overall', rng);
    const rank = 1 + opponents.filter(o => o.score > p.score).length;
    const bonus = rank <= 3 ? jjf.finalRankPoints[rank - 1] : 0;
    const standings = buildStandings(
      opponents.map(o => ({ name: o.name, score: o.score })).concat([{ name: state.name, score: p.score, isPlayer: true }])
    );
    const r = {
      name: contest.name, type: 'jjf', division: 'overall', divisionLabel: 'JJF決勝',
      rank: rank, entrants: jjf.finalEntrants, score: p.score,
      parts: p.parts, rawTotal: p.rawTotal, judgeMod: p.judgeMod, misses: p.misses,
      execDeduction: p.execDeduction, specialDeduction: p.specialDeduction,
      points: bonus, standings: standings, turn: contest.turn, rivalMessages: []
    };
    state.results.push(r);
    return [r];
  }

  DT.contest = {
    genreAvg, derivedVariety, derivedBase, breakdown, missRate, playerScore,
    maxEntries, runAll, contestForTurn, worldsContestForTurn, worldsQualified,
    rivalScore, LEVELS, buildStandings,
    isGenreUnlocked, newlyUnlockedGenres, nextUnlockTarget,
    jjfQualifierForTurn, jjfFinalForTurn, jjfQualify, runJjfFinal
  };
})(typeof window !== 'undefined' ? window : globalThis);
