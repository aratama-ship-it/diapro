(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  // ============================================================
  // カード化エンディング（2026-07-15 Phase1）
  // カタログ50種: 特別15＋職人5＋ランク×属性マトリクス30。
  // 優先度の高い順に判定し、最初に該当した1枚を排出（マトリクスが受け皿）。
  // 仕様: docs/specs/2026-07-15-card-catalog-50.md
  // ============================================================

  // 属性Type判定のカード用正規化: 演技構成は単一ステータスで技術(4ジャンル平均)より
  // 高く出やすい（sim実測: 構成~89 vs 技術~70）ため、比較時のみ係数を掛けて補正する。
  const TYPE_COMPOSITION_FACTOR = 0.85;
  const TYPE_BALANCED_SPREAD = 8; // 正規化後の最大-最小がこれ以下なら万能型

  const TYPES = ['power', 'innovator', 'technician', 'showman', 'allround'];
  const TYPE_LABEL = {
    power: '高難度型', innovator: 'イノベーター型', technician: 'テクニシャン型',
    showman: 'ショーマン型', allround: '万能型'
  };

  // ---- 特徴抽出（stateから排出判定・カード表示に必要な値をまとめて計算） ----
  function features(state) {
    const e = DT.ending.evaluate(state);
    const gAvg = id => DT.DATA.GENRES.reduce((a, g) => a + state.skills[g.id][id], 0) / DT.DATA.GENRES.length;
    const stats = {
      difficulty: Math.round(gAvg('difficulty')),
      novelty: Math.round(gAvg('novelty')),
      control: Math.round(gAvg('control')),
      composition: Math.round(state.composition)
    };
    // Type判定（構成のみ係数補正して比較）
    const norm = {
      power: stats.difficulty, innovator: stats.novelty,
      technician: stats.control, showman: stats.composition * TYPE_COMPOSITION_FACTOR
    };
    const vals = Object.values(norm);
    let type;
    if (Math.max.apply(null, vals) - Math.min.apply(null, vals) <= TYPE_BALANCED_SPREAD) {
      type = 'allround';
    } else {
      type = Object.keys(norm).reduce((a, k) => (norm[k] > norm[a] ? k : a), 'power');
    }
    // 大会実績（JJF予選のqualifier行は順位実績から除外）
    const ranked = state.results.filter(r => r.division !== 'qualifier');
    const wins = ranked.filter(r => r.rank === 1).length;
    const podium = ranked.filter(r => r.rank <= 3).length;
    const podiumRate = ranked.length ? podium / ranked.length : 0;
    const divWins = id => ranked.filter(r => r.division === id && r.rank === 1).length;
    // AJDC総合の優勝ターン一覧（連覇判定: 12ターン差=連続年）
    const ajdcWinTurns = ranked.filter(r => r.type === 'ajdc' && r.division === 'overall' && r.rank === 1)
      .map(r => r.turn).sort((a, b) => a - b);
    let ajdcStreak = ajdcWinTurns.length > 0 ? 1 : 0;
    for (let i = 1; i < ajdcWinTurns.length; i++) {
      if (ajdcWinTurns[i] - ajdcWinTurns[i - 1] === 12) { ajdcStreak = 2; break; }
    }
    // 東海二冠: 同一ターンの静岡2部門両優勝
    const shizuokaDouble = ranked.some(r => r.type === 'shizuoka' && r.division === 'technical' && r.rank === 1 &&
      ranked.some(o => o.turn === r.turn && o.division === 'performance' && o.rank === 1));
    const jjfFinalWin = ranked.some(r => r.type === 'jjf' && r.division === 'overall' && r.rank === 1);
    const worldsEntered = ranked.some(r => r.type === 'worlds');
    const worldsTop8 = ranked.some(r => r.type === 'worlds' && r.rank <= 8); // 世界大会で入賞
    const grandSlam = divWins('overall') >= 1 && ['h1d', 'v1d', 'd2', 'd3'].every(d => divWins(d) >= 1);
    const cellSum = DT.DATA.GENRES.reduce((a, g) => a + DT.DATA.METHODS.reduce((b, m) => b + state.skills[g.id][m.id], 0), 0);
    const strongestGenre = DT.DATA.GENRES.reduce((a, g) =>
      DT.contest.genreAvg(state, g.id) > DT.contest.genreAvg(state, a.id) ? g : a);
    return {
      rank: e.rank, title: e.title, totalPoints: e.totalPoints,
      expelled: state.status === 'expelled',
      retired: state.status === 'retired', // 早期引退（2年AJDC後・改善プラン#4）
      worldsWin: !!e.worldsWin, ajdcWin: !!e.ajdcOverallWin, ajdcStreak,
      jjfFinalWin, worldsEntered, worldsTop8, grandSlam, shizuokaDouble,
      wins, podium, podiumRate, entries: ranked.length, divWins,
      stats, type,
      cp: Math.round((cellSum + state.composition) / 1.3),
      background: state.background,
      isHard: state.background === 'college',
      isEasy: state.background === 'juniorhigh',
      awakenCount: state.awakenCount || 0,
      injuryCount: state.injuryCount || 0,
      daikyoDrawn: !!state.daikyoDrawn,
      study: state.study,
      strongestGenre: strongestGenre.label,
      name: state.name
    };
  }

  // ---- 第1層: 特別カード（優先度順） ----
  const SPECIALS = [
    { id: 'sp_expelled',  title: '未完の大器',           when: f => f.expelled },
    { id: 'sp_worlds',    title: '伝説のディアボリスト', when: f => f.worldsWin },
    { id: 'sp_grandslam', title: 'グランドスラム',       when: f => f.grandSlam },
    { id: 'sp_dynasty',   title: '絶対王者',             when: f => f.ajdcStreak >= 2 },
    { id: 'sp_ajdc',      title: '日本の頂点',           when: f => f.ajdcWin },
    { id: 'sp_jjf',       title: '祭典の主役',           when: f => f.jjfFinalWin },
    { id: 'sp_weed',      title: '雑草の大器',           when: f => f.isHard && f.rank === 'S' },
    { id: 'sp_daikyo',    title: '大凶返し',             when: f => f.daikyoDrawn && (f.rank === 'S' || f.rank === 'A') },
    { id: 'sp_awakener',  title: '覚醒者',               when: f => f.awakenCount >= 3 },
    { id: 'sp_upset',     title: '下剋上',               when: f => f.isHard && (f.rank === 'B' || f.rank === 'A') },
    { id: 'sp_tokai',     title: '東海二冠',             when: f => f.shizuokaDouble },
    { id: 'sp_elite',     title: '英才教育の結晶',       when: f => f.isEasy && f.rank === 'S' && f.wins >= 5 },
    // 「無傷の四年間」「文武両道」は明示的に4年間の完走を要求 → 早期引退(retired)では取れない（改善プラン#4）
    { id: 'sp_unhurt',    title: '無傷の四年間',         when: f => !f.retired && f.injuryCount === 0 && (f.rank === 'S' || f.rank === 'A') && f.entries >= 10 },
    { id: 'sp_scholar',   title: '文武両道',             when: f => !f.retired && f.study >= 90 && 'SAB'.indexOf(f.rank) >= 0 },
    { id: 'sp_podium',    title: '表彰台の常連',         when: f => f.entries >= 8 && f.podiumRate >= 0.6 }
  ];

  // ---- 第2層: 職人カード ----
  const CRAFTSMEN = [
    { id: 'cr_h1d',    title: '水平の匠',       when: f => f.divWins('h1d') >= 5 },
    { id: 'cr_v1d',    title: '垂直の踊り手',   when: f => f.divWins('v1d') >= 5 },
    { id: 'cr_d2',     title: '双皿の遣い手',   when: f => f.divWins('d2') >= 5 },
    { id: 'cr_d3',     title: '三連の魔術師',   when: f => f.divWins('d3') >= 5 },
    { id: 'cr_worlds', title: '世界への挑戦者', when: f => f.worldsTop8 }
  ];

  // ---- 第3層: ランク×属性マトリクス（30種・全員の受け皿） ----
  const MATRIX = {
    S: { power: '極限の求道者', innovator: '時代の革命児', technician: '精密機械',     showman: '舞台の支配者', allround: '完全無欠' },
    A: { power: '剛技の使い手', innovator: '孤高の発明家', technician: '熟練の職人',   showman: '華の演者',     allround: '万能の実力者' },
    B: { power: '力技の人',     innovator: '奇手の使い手', technician: '堅実な技巧派', showman: '魅せる人',     allround: '器用な選手' },
    C: { power: '挑戦者',       innovator: '工夫の人',     technician: 'コツコツ職人', showman: 'ムードメーカー', allround: 'バランサー' },
    D: { power: '無鉄砲',       innovator: '夢追い人',     technician: '反復の虫',     showman: '目立ちたがり', allround: '発展途上' },
    E: { power: '無謀な情熱',   innovator: '空想家',       technician: '素振りの日々', showman: 'お祭り好き',   allround: '青春の一ページ' }
  };

  // 全50種の一覧（図鑑用）: [{id, title, layer}]
  function catalog() {
    const list = [];
    SPECIALS.forEach(c => list.push({ id: c.id, title: c.title, layer: 'special' }));
    CRAFTSMEN.forEach(c => list.push({ id: c.id, title: c.title, layer: 'craft' }));
    Object.keys(MATRIX).forEach(rank => Object.keys(MATRIX[rank]).forEach(type =>
      list.push({ id: 'mx_' + rank + '_' + type, title: MATRIX[rank][type], layer: 'matrix', rank, type })));
    return list;
  }

  // 判定済みのカード枠(id/title/layer)を、この周の選手データ付きの完全なカードにする
  function materialize(id, title, layer, f) {
    return {
      id, title, layer,
      rank: f.rank, type: f.type, typeLabel: TYPE_LABEL[f.type],
      cp: f.cp, totalPoints: f.totalPoints, stats: f.stats,
      expelled: f.expelled,
      medals: buildMedals(f),
      background: f.background, strongestGenre: f.strongestGenre,
      name: f.name
    };
  }

  // ---- 候補列挙: この周で条件を満たした全カードを優先度順に返す（改善プラン#3・2026-07-16） ----
  // 先頭が最上位（=従来のpickCardと同一）。末尾に現在ランク×タイプのマトリクス（全員の受け皿）。
  // 退学は例外で「未完の大器」単独（GAME OVERの周から他の物語は選ばせない）。
  function pickCandidates(state) {
    const f = features(state);
    if (f.expelled) {
      const sp = SPECIALS[0]; // sp_expelled
      return [materialize(sp.id, sp.title, 'special', f)];
    }
    const list = [];
    SPECIALS.forEach(c => { if (c.when(f)) list.push(materialize(c.id, c.title, 'special', f)); });
    CRAFTSMEN.forEach(c => { if (c.when(f)) list.push(materialize(c.id, c.title, 'craft', f)); });
    const rank = f.rank in MATRIX ? f.rank : 'E';
    list.push(materialize('mx_' + rank + '_' + f.type, MATRIX[rank][f.type], 'matrix', f));
    return list;
  }

  // ---- 排出判定: 特別 → 職人 → マトリクス の順で最初に該当した1枚 ----
  function pickCard(state) {
    return pickCandidates(state)[0];
  }

  // カード下部に刻むメダル（最大3個・強い実績順）
  function buildMedals(f) {
    const m = [];
    if (f.worldsWin) m.push('🏆世界王者');
    else if (f.worldsEntered) m.push('🌏世界大会出場');
    if (f.ajdcStreak >= 2) m.push('👑全日本連覇');
    else if (f.ajdcWin) m.push('🥇全日本V');
    if (f.jjfFinalWin) m.push('🎪JJF王者');
    if (m.length < 3 && f.wins > 0) m.push('⭐優勝' + f.wins + '回');
    if (m.length === 0) m.push(f.podium > 0 ? '🥉表彰台' + f.podium + '回' : '🎋出場' + f.entries + '大会');
    return m.slice(0, 3);
  }

  DT.cards = { features, pickCard, pickCandidates, catalog, TYPE_LABEL, TYPE_COMPOSITION_FACTOR };
})(typeof window !== 'undefined' ? window : globalThis);
