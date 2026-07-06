(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  function totalPoints(state) {
    return state.results.reduce((a, r) => a + r.points, 0);
  }

  function evaluate(state) {
    const points = totalPoints(state);
    if (state.status === 'expelled') {
      return {
        rank: '退学',
        title: '道半ばの退学……',
        totalPoints: points,
        comment: 'ディアボロに打ち込みすぎた。学業との両立も実力のうち。'
      };
    }
    // v4: abilityAvg = 13値（12マス: GENRES×METHODS + composition）の平均
    const cellSum = DT.DATA.GENRES.reduce((a, g) =>
      a + DT.DATA.METHODS.reduce((b, m) => b + state.skills[g.id][m.id], 0), 0);
    const abilitySum = cellSum + state.composition;
    const cellCount = DT.DATA.GENRES.length * DT.DATA.METHODS.length + 1;
    const abilityAvg = Math.round(abilitySum / cellCount);
    const worldsWin = state.results.some(r => r.type === 'worlds' && r.rank === 1);
    const ajdcOverallWin = state.results.some(r => r.type === 'ajdc' && r.division === 'overall' && r.rank === 1);
    // v3バランス調整（Task4）: LEVELS成長引き上げに伴い、無冠でも中堅相応の合計点になる帯が
    // 300点未満に増えたため、C閾値を220に引き下げてD一極集中を回避（詳細は同レポート参照）
    let rank;
    if (ajdcOverallWin || points >= 850) rank = 'S';
    else if (points >= 700) rank = 'A';
    else if (points >= 450) rank = 'B';
    else if (points >= 220) rank = 'C';
    else if (points >= 90) rank = 'D';
    else rank = 'E';
    if (worldsWin) rank = 'S';
    const titles = {
      S: '伝説のディアボリスト',
      A: '全国区のトッププレイヤー',
      B: '大会常連の実力者',
      C: '努力の中堅プレイヤー',
      D: 'これからのプレイヤー',
      E: 'サークルの思い出'
    };
    const title = worldsWin ? '世界チャンピオン' : titles[rank];
    return { rank, title, totalPoints: points, abilityAvg, ajdcOverallWin, worldsWin };
  }

  DT.ending = { evaluate };
})(typeof window !== 'undefined' ? window : globalThis);
