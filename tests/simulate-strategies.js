'use strict';
// 戦略比較＋カード特徴分布シミュレーション（2026-07-15）
// 目的: (1)どのプレイ方針が強いかをデータ化 (2)カード用アートの特徴プロファイル
//       (Type×ランク帯×最強ジャンル×勝ちっぷり) の出現分布を取得
// 実行: node tests/simulate-strategies.js [N] [backgroundId]
//   N=戦略ごとの試行数(既定100) / backgroundId=college(ハード)|highschool(ノーマル,既定)|juniorhigh(イージー)
//
// test-simulation.js の playThrough を土台に、実ゲームフローへ寄せた追加:
//   - 練習直後の怪我判定 rollInjury
//   - JJF予選(9月・常に参加)→決勝(10月)
//   - 状態依存イベント(過労で倒れる=行動キャンセル / 覚醒のきざし=50%で覚醒, 失敗やる気-20)
require('../js/data.js');
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

// ---- エントリー方針 ----
function entryAll(turn, state) {
  const contest = DT.contest.contestForTurn(turn);
  if (contest && contest.type === 'shizuoka') return ['technical', 'performance'];
  const specialistIds = DT.DATA.DIVISIONS
    .filter(d => d.scoring === 'specialist' && DT.contest.isGenreUnlocked(state, d.id))
    .map(d => d.id);
  const max = DT.contest.maxEntries(turn);
  return ['overall'].concat(specialistIds.slice(0, max - 1));
}
function entryH1dFocus(turn, state) {
  const contest = DT.contest.contestForTurn(turn);
  if (contest && contest.type === 'shizuoka') return ['technical', 'performance'];
  const ids = ['overall'];
  if (DT.contest.isGenreUnlocked(state, 'h1d')) ids.push('h1d');
  return ids.slice(0, DT.contest.maxEntries(turn));
}

// ---- 月の行動判断（共通のまともな方針） ----
function decideMonth(state, restLine) {
  if (state.injuredTurns > 0) return 'injured';
  if (state.banTurns > 0) return state.fatigue > restLine ? 'rest' : 'study';
  const nextExam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
  if (nextExam !== undefined && nextExam - state.turn <= 1 && state.study < 45) return 'study';
  if (state.study < 30) return 'study';
  if (state.fatigue > restLine) return 'rest';
  return 'train';
}

// ---- 練習スロット方針（戦略の本体） ----
const unlocked = s => DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked(s, g.id));
function argminCell(state, methodFilter) {
  const methods = methodFilter || DT.DATA.METHODS.map(m => m.id);
  let best = null;
  unlocked(state).forEach(g => methods.forEach(m => {
    const v = state.skills[g.id][m];
    if (!best || v < best.v) best = { genre: g.id, method: m, v };
  }));
  return best ? { genre: best.genre, method: best.method } : null;
}
// 同一メニュー2つまで制約を守って3枠組む
function fill3(entries) {
  const out = [];
  const count = e => out.filter(o => (o === 'routine' || e === 'routine') ? o === e
    : o.genre === e.genre && o.method === e.method).length;
  entries.forEach(e => { if (e && out.length < 3 && count(e) < 2) out.push(e); });
  while (out.length < 3) out.push('routine'); // 埋まらない分はルーチンで
  return out.slice(0, 3);
}

const STRATEGIES = {
  // 1) 弱点補強: 最も低いマスを埋める(既存テストのまともな方針)
  balance: {
    label: '弱点補強(argmin)', restLine: 55, entry: entryAll,
    slots: s => { const a = argminCell(s); const b = argminCell(s); return fill3([a, b, 'routine']); }
  },
  // 2) 総合採点特化: 総合部門の重み(難易30/構成20)に合わせ難易度＋構成を厚く
  overallMeta: {
    label: '総合採点特化(難易+構成)', restLine: 55, entry: entryAll,
    slots: s => { const d1 = argminCell(s, ['difficulty']); return fill3([d1, d1, 'routine']); }
  },
  // 3) 1DH一点特化: h1dのみ育てスペシャリスト狙い(難易45/新奇30が重い)
  h1dSpecial: {
    label: '1DH一点特化', restLine: 55, entry: entryH1dFocus,
    slots: () => fill3([{ genre: 'h1d', method: 'difficulty' }, { genre: 'h1d', method: 'novelty' }, { genre: 'h1d', method: 'control' }])
  },
  // 4) ショーマン型: 構成(ルーチン)最優先＋新奇性
  showman: {
    label: 'ショーマン(構成+新奇)', restLine: 55, entry: entryAll,
    slots: s => { const n = argminCell(s, ['novelty']); return fill3(['routine', 'routine', n]); }
  },
  // 5) 全力疾走: 弱点補強だが休養線を70に引き上げ(体力を削って練習量を稼ぐ)
  hustle: {
    label: '全力疾走(休まない)', restLine: 70, entry: entryAll,
    slots: s => { const a = argminCell(s); const b = argminCell(s); return fill3([a, b, 'routine']); }
  }
};

// ---- 1ゲーム通しプレイ ----
function playThrough(rng, strat) {
  const state = DT.state.newCharacter(rng, BACKGROUND); // 経歴は引数で指定(既定=高校ノーマル)
  let guard = 0;
  while (state.status === 'playing' && guard++ < 100) {
    // 練習前スロット: 1月=おみくじ(固定) → 状態依存イベント → ランダム
    let skipAction = false;
    const cond = DT.events.isOmikujiTurn(state.turn) ? null : DT.events.conditionalEventFor(state);
    if (DT.events.isOmikujiTurn(state.turn)) {
      DT.events.drawOmikuji(state, rng);
    } else if (cond) {
      if (cond.awakenTrigger) {
        if (rng() < 0.5) DT.events.startAwakening(state, rng);
        else state.motivation = clamp(state.motivation - 20, 0, 100);
      } else if (cond.choices) {
        DT.events.applyChoice(state, cond, 0);
      } else {
        DT.events.applyConditional(state, cond);
        if (cond.id === 'collapse') skipAction = true;
      }
    } else {
      const ev = DT.events.roll(state, rng);
      if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
      else if (ev) DT.events.applyHappening(state, ev.event);
    }
    // 行動
    if (!skipAction) {
      const act = decideMonth(state, strat.restLine);
      if (act === 'train') {
        DT.engine.applyTraining(state, strat.slots(state), rng);
        DT.engine.rollInjury(state, rng);
      } else {
        DT.engine.applyAction(state, act, rng);
      }
    } else {
      state.didTrain = false; state.didStudy = false;
    }
    // 練習後スロット: 大会 → JJF → 固定イベント
    const contest = DT.contest.contestForTurn(state.turn);
    const wc = DT.contest.worldsContestForTurn(state.turn);
    const jq = DT.contest.jjfQualifierForTurn(state.turn);
    const jf = DT.contest.jjfFinalForTurn(state.turn);
    if (contest) {
      DT.contest.runAll(state, contest, strat.entry(state.turn, state), rng);
    } else if (wc && DT.contest.worldsQualified(state, state.turn)) {
      DT.contest.runAll(state, wc, ['overall'], rng);
    } else if (jq) {
      const q = DT.contest.jjfQualify(state, rng);
      if (q.passed) {
        state.motivation = clamp(state.motivation + DT.DATA.JJF.passMotivation, 0, 100);
        state.jjfFinalist = 1;
        state.results.push({ name: jq.name, type: 'jjf', division: 'qualifier', divisionLabel: 'JJF予選突破',
          rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn, standings: [], rivalMessages: [] });
      } else {
        state.motivation = clamp(state.motivation - 8, 0, 100);
      }
    } else if (jf && state.jjfFinalist) {
      state.jjfFinalist = 0;
      DT.contest.runJjfFinal(state, jf, rng);
    } else {
      const sched = DT.events.scheduledEventFor(state);
      if (sched) {
        if (sched.choices) DT.events.applyChoice(state, sched, 0);
        else DT.events.applyScheduled(state, sched);
      }
    }
    DT.engine.endTurn(state, rng);
  }
  return state;
}

// ---- カード特徴の抽出 ----
function features(state) {
  const e = DT.ending.evaluate(state);
  const gAvg = id => DT.DATA.GENRES.reduce((a, g) => a + state.skills[g.id][id], 0) / DT.DATA.GENRES.length;
  const four = { 難易: gAvg('difficulty'), 新奇: gAvg('novelty'), 操作: gAvg('control'), 構成: state.composition };
  const vals = Object.values(four);
  const type = (Math.max(...vals) - Math.min(...vals) <= 8) ? '万能型'
    : { 難易: '高難度型', 新奇: 'イノベーター型', 操作: 'テクニシャン型', 構成: 'ショーマン型' }[
        Object.keys(four).reduce((a, k) => four[k] > four[a] ? k : a, '難易')];
  const strongestGenre = DT.DATA.GENRES.reduce((a, g) =>
    DT.contest.genreAvg(state, g.id) > DT.contest.genreAvg(state, a.id) ? g : a).label;
  const ranked = state.results.filter(r => r.division !== 'qualifier');
  const wins = ranked.filter(r => r.rank === 1).length;
  const podium = ranked.filter(r => r.rank <= 3).length;
  const podiumRate = ranked.length ? podium / ranked.length : 0;
  const winTier = wins >= 3 ? '常勝' : (podiumRate >= 0.3 ? '入賞常連' : '苦戦');
  const rankTier = e.rank === 'S' || e.rank === 'A' ? '高' : (e.rank === 'B' || e.rank === 'C' ? '中' : '低');
  const cellSum = DT.DATA.GENRES.reduce((a, g) => a + DT.DATA.METHODS.reduce((b, m) => b + state.skills[g.id][m.id], 0), 0);
  return { rank: e.rank, rankTier, points: e.totalPoints, cp: Math.round((cellSum + state.composition) / 1.3),
    type, strongestGenre, wins, podium, entries: ranked.length, winTier,
    worldsWin: !!e.worldsWin, ajdcWin: !!e.ajdcOverallWin, status: state.status, four };
}

// ---- 実行・集計 ----
const N = parseInt(process.argv[2], 10) || 100;
const BACKGROUND = process.argv[3] || 'highschool';
const BG_DEF = DT.DATA.BACKGROUNDS.find(b => b.id === BACKGROUND);
if (!BG_DEF) { console.error('未知のbackgroundId: ' + BACKGROUND); process.exit(1); }
const tally = (arr, key) => arr.reduce((a, f) => { const k = key(f); a[k] = (a[k] || 0) + 1; return a; }, {});
const avg = (arr, key) => Math.round(arr.reduce((a, f) => a + key(f), 0) / arr.length);
const pct = (n, d) => Math.round(n / d * 100) + '%';

const all = [];
console.log('=== 戦略比較（各N=' + N + '・経歴=' + BG_DEF.label + '/' + BG_DEF.difficulty + '） ===\n');
Object.entries(STRATEGIES).forEach(([id, strat]) => {
  const runs = [];
  for (let seed = 1; seed <= N; seed++) runs.push(features(playThrough(lcg(seed * 7919 + id.length), strat)));
  runs.forEach(r => { r.strategy = strat.label; all.push(r); });
  const grads = runs.filter(r => r.status === 'graduated');
  console.log('◆ ' + strat.label);
  console.log('  卒業率: ' + pct(grads.length, N) + '  平均pt: ' + avg(runs, r => r.points) +
    '  平均CP: ' + avg(runs, r => r.cp) + '  平均優勝数: ' + (runs.reduce((a, r) => a + r.wins, 0) / N).toFixed(1));
  console.log('  ランク分布: ' + JSON.stringify(tally(runs, r => r.rank)));
  console.log('  Type分布:   ' + JSON.stringify(tally(runs, r => r.type)));
  console.log('  世界大会V: ' + pct(runs.filter(r => r.worldsWin).length, N) +
    '  全日本V: ' + pct(runs.filter(r => r.ajdcWin).length, N));
  const f4 = k => Math.round(runs.reduce((a, r) => a + r.four[k], 0) / runs.length);
  console.log('  4系統平均: 難易' + f4('難易') + ' 新奇' + f4('新奇') + ' 操作' + f4('操作') + ' 構成' + f4('構成') + '\n');
});

console.log('=== カード特徴プロファイル分布（全戦略合算 N=' + all.length + '） ===\n');
console.log('Type×ランク帯:');
const types = ['高難度型', 'イノベーター型', 'テクニシャン型', 'ショーマン型', '万能型'];
const tiers = ['高', '中', '低'];
console.log('  ' + ' '.repeat(10) + tiers.map(t => t.padStart(6)).join(''));
types.forEach(t => {
  const row = tiers.map(tier => String(all.filter(f => f.type === t && f.rankTier === tier).length).padStart(6)).join('');
  console.log('  ' + t.padEnd(9, '　') + row);
});
console.log('\n最強ジャンル分布: ' + JSON.stringify(tally(all, f => f.strongestGenre)));
console.log('勝ちっぷり分布:   ' + JSON.stringify(tally(all, f => f.winTier)));
console.log('ランク分布(合算): ' + JSON.stringify(tally(all, f => f.rank)));
console.log('特別カード該当:   世界王者=' + all.filter(f => f.worldsWin).length + ' / 全日本V=' + all.filter(f => f.ajdcWin).length + ' / 退学=' + all.filter(f => f.status === 'expelled').length);
