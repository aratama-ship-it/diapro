'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/contest.js');
const DT = globalThis.DT;

function allFifty() {
  const s = DT.state.newCharacter(() => 0);
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 50; });
  DT.DATA.GENRES.forEach(g => { s.genres[g.id] = 50; });
  return s;
}

function allZeroGenres() {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => { s.genres[g.id] = 0; });
  return s;
}

// ---- 導出値 ----

test('derivedVariety: 全ジャンル0で0点', () => {
  const s = allZeroGenres();
  assert.strictEqual(DT.contest.derivedVariety(s), 0);
});

test('derivedVariety: 全ジャンル50で満点10（Σmin=200/200×10）', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.derivedVariety(s), 10);
});

test('derivedVariety: 混在ケース・0.1精度で丸め', () => {
  const s = allFifty();
  s.genres = { v1d: 10, h1d: 30, d2: 60, d3: 0 };
  // Σmin(genre,50) = 10+30+50+0 = 90 → 90/200*10 = 4.5
  assert.strictEqual(DT.contest.derivedVariety(s), 4.5);
});

test('derivedVariety: 全ジャンル100でも満点10で頭打ち（min(genre,50)）', () => {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => { s.genres[g.id] = 100; });
  assert.strictEqual(DT.contest.derivedVariety(s), 10);
});

test('derivedBase: 全ジャンル0でelements0・points0', () => {
  const s = allZeroGenres();
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 0, points: 0 });
});

test('derivedBase: 全ジャンル50(≥threshold25)でelements4・points20', () => {
  const s = allFifty();
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 4, points: 20 });
});

test('derivedBase: 閾値ちょうど(25)は基礎点に含まれる', () => {
  const s = allZeroGenres();
  s.genres.v1d = 25;
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 1, points: 5 });
});

test('derivedBase: 混在ケースで該当ジャンルのみ数える', () => {
  const s = allFifty();
  s.genres = { v1d: 10, h1d: 30, d2: 60, d3: 0 };
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 2, points: 10 });
});

// ---- breakdown ----

test('breakdown(overall): 6項目・all50/全ジャンル50で合計65', () => {
  const b = DT.contest.breakdown(allFifty(), 'overall');
  assert.deepStrictEqual(b, { difficulty: 15, variety: 10, control: 5, novelty: 5, composition: 10, fundamentals: 20 });
  const sum = Object.values(b).reduce((a, v) => a + v, 0);
  assert.strictEqual(sum, 65);
});

test('breakdown(specialist): 4項目のみ・all50で合計50', () => {
  const b = DT.contest.breakdown(allFifty(), 'v1d');
  assert.deepStrictEqual(b, { difficulty: 22.5, control: 7.5, novelty: 15, composition: 5 });
});

test('breakdown(overall): ジャンル0でも旧stats.variety/fundamentalsを参照しない（導出のみ）', () => {
  const s = allZeroGenres();
  const b = DT.contest.breakdown(s, 'overall');
  assert.strictEqual(b.variety, 0);
  assert.strictEqual(b.fundamentals, 0);
});

// ---- ゲート ----

test('playerScore(specialist): ゲートはrawTotal算出後・remap前に適用される（v1d, all50, rng0.5）', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, 'v1d', () => 0.5);
  // parts合計50 → gate 0.4+0.6*(50/100)=0.7 → rawTotal 35 → scaled 30+35*0.7=54.5
  assert.strictEqual(r.rawTotal, 35);
  assert.strictEqual(r.score, 54.5);
  assert.strictEqual(r.gateMult, 0.7);
});

test('playerScore(specialist): 該当ジャンル0なら最低ゲート0.4のみ適用', () => {
  const s = allFifty();
  s.genres.v1d = 0;
  const r = DT.contest.playerScore(s, 'v1d', () => 0.5);
  // parts合計50 → gate 0.4 → rawTotal 20 → scaled 30+20*0.7=44
  assert.strictEqual(r.rawTotal, 20);
  assert.strictEqual(r.score, 44);
  assert.strictEqual(r.gateMult, 0.4);
});

test('playerScore(specialist): 該当ジャンル100ならゲート最大1.0（無減衰）', () => {
  const s = allFifty();
  s.genres.v1d = 100;
  const r = DT.contest.playerScore(s, 'v1d', () => 0.5);
  // gate 0.4+0.6*1=1.0 → rawTotal 50 → scaled 30+50*0.7=65
  assert.strictEqual(r.rawTotal, 50);
  assert.strictEqual(r.score, 65);
  assert.strictEqual(r.gateMult, 1);
});

test('playerScore(overall): ゲートは適用されない（overallはゲート対象外）', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, 'overall', () => 0.5);
  assert.strictEqual(r.rawTotal, 65);
  assert.strictEqual(r.gateMult, 1);
});

// ---- リマップ ----

test('playerScore(overall): 検算基準（全能力50・全ジャンル50・rng0.5固定）→75.5', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, 'overall', () => 0.5);
  assert.strictEqual(r.rawTotal, 65);
  assert.strictEqual(r.judgeMod, 0);
  assert.strictEqual(r.misses, 0);
  assert.strictEqual(r.execDeduction, 0);
  assert.strictEqual(r.specialDeduction, 0);
  assert.strictEqual(r.score, 75.5);
});

test('playerScore: parts合計はrawTotalと一致し、scoreはリマップ後の値', () => {
  const s = allFifty();
  s.motivation = 5; // judgeMod = 4 + noise
  const r = DT.contest.playerScore(s, 'overall', () => 0.5); // noise 0
  const partsSum = Object.values(r.parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(partsSum, r.rawTotal);
  assert.strictEqual(r.judgeMod, 4);
  const scaled = DT.DATA.SCORING.scale.base + r.rawTotal * DT.DATA.SCORING.scale.mult;
  assert.strictEqual(r.score, Math.round((scaled + r.judgeMod) * 10) / 10);
});

test('playerScore: 実施減点は表示スケール上で1-2点/ミス（execDeductionMax基準は不変）', () => {
  const s = allFifty();
  s.fatigue = 100; s.stats.control = 0; // missRate 55
  // rng: noise0.5, miss判定0.0(ミス), 減点幅1.0(→1+round(1*(2-1))=2点), miss判定0.99, special0.99
  const seq = [0.5, 0.0, 1.0, 0.99, 0.99];
  let i = 0;
  const r = DT.contest.playerScore(s, 'overall', () => seq[i++]);
  assert.strictEqual(r.misses, 1);
  assert.strictEqual(r.execDeduction, 2);
  const scaled = DT.DATA.SCORING.scale.base + r.rawTotal * DT.DATA.SCORING.scale.mult;
  assert.strictEqual(r.score, Math.round((scaled + r.judgeMod - r.execDeduction) * 10) / 10);
});

test('maxEntries: 学年+1で増え部門総数5で頭打ち', () => {
  assert.strictEqual(DT.contest.maxEntries(5), 2);   // 1年
  assert.strictEqual(DT.contest.maxEntries(17), 3);  // 2年
  assert.strictEqual(DT.contest.maxEntries(29), 4);  // 3年
  assert.strictEqual(DT.contest.maxEntries(41), 5);  // 4年
  assert.strictEqual(DT.contest.maxEntries(48), 5);  // 4年（cap=部門総数5）
});

// ---- runAll/runDivision（相手・ライバルも同一リマップ） ----

test('runAll: 総合+スペシャ1部門で結果2件・疲労が演技間に加算される', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall', 'v1d'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs.length, 2);
  assert.strictEqual(rs[0].division, 'overall');
  assert.strictEqual(rs[0].score, 75.5);
  assert.strictEqual(rs[0].rank, 1);
  assert.strictEqual(rs[0].points, 40);
  assert.strictEqual(rs[1].division, 'v1d');
  assert.strictEqual(rs[1].divisionLabel, '1ディアボロ垂直軸部門');
  // overall部門で志音に勝ちmotivationが4に上がっているためjudgeMod+2 → 54.5+2=56.5
  assert.strictEqual(rs[1].score, 56.5);
  assert.strictEqual(rs[1].rank, 1);
  assert.strictEqual(rs[1].points, 20); // スペシャリストは半分
  assert.strictEqual(s.fatigue, 6);     // 2演技目の前に+6
  assert.strictEqual(s.results.length, 2);
});

test('runAll: AJDCのポイントは総合100/スペシャ50', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  DT.DATA.GENRES.forEach(g => { s.genres[g.id] = 100; });
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[7], ['overall', 'd2'], () => 0.5); // 4年AJDC
  assert.strictEqual(rs[0].points, 100);
  assert.strictEqual(rs[1].points, 50);
});

test('contestForTurn: OIDC/AJDCの月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'oidc');
  assert.strictEqual(DT.contest.contestForTurn(48).type, 'ajdc');
  assert.strictEqual(DT.contest.contestForTurn(11), null); // 旧全国大会の月は今は大会なし
});

test('missRate: 怪我中はミス率+15%（stats.controlは不変のまま参照）', () => {
  const s = allFifty(); // 基準はmissRate 10
  s.injuredTurns = 1;
  assert.strictEqual(DT.contest.missRate(s), 25);
});

test('rivalScore: 成長曲線をリマップした値を返す（ノイズ0）', () => {
  const shion = DT.DATA.RIVALS[0];
  // raw: 1年22 → 30+22*0.7=45.4／4年52 → 30+52*0.7=66.4
  assert.strictEqual(DT.contest.rivalScore(shion, DT.DATA.CONTESTS[0], () => 0.5), 45.4);
  assert.strictEqual(DT.contest.rivalScore(shion, DT.DATA.CONTESTS[7], () => 0.5), 66.4);
});

test('runDivision: 対戦相手の生成値も同一リマップ（oidc1年・mean25・ノイズ0）', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5); // 1年OIDC 相手平均25
  // 相手の生値=mean(ノイズ0)=25 → display 30+25*0.7=47.5。全員プレイヤー75.5未満→rank1
  assert.strictEqual(rs[0].rank, 1);
});

test('rivalVsPlayer: 同等の生値ならプレイヤーとライバルのdisplayスコアはほぼ一致する', () => {
  // プレイヤーのoverall raw合計を志音1年の生値(22)相当に近づけて比較
  // rawTotal=65は固定配点なので、代わりにゲート後rawが一致するspecialistで検証:
  // v1d genre=0のとき rawTotal(after gate)=20。同じ生値をrivalScoreに見立てて比較。
  const s = allFifty();
  s.genres.v1d = 0;
  const p = DT.contest.playerScore(s, 'v1d', () => 0.5);
  const scaledRaw20 = DT.DATA.SCORING.scale.base + 20 * DT.DATA.SCORING.scale.mult;
  assert.strictEqual(p.score, scaledRaw20); // judgeMod0・減点0のときrawが同じなら表示スコアも一致
});

test('rank preservation: 同一rngならraw順とdisplay順は一致する（線形変換のため）', () => {
  // 3人分のraw値を用意し、線形リマップ後も大小関係が保たれることを確認
  const raws = [10, 45.4, 75.5, 20, 65];
  const scaled = raws.map(v => DT.DATA.SCORING.scale.base + v * DT.DATA.SCORING.scale.mult);
  const rawOrder = raws.map((v, i) => i).sort((a, b) => raws[a] - raws[b]);
  const scaledOrder = scaled.map((v, i) => i).sort((a, b) => scaled[a] - scaled[b]);
  assert.deepStrictEqual(rawOrder, scaledOrder);
});

test('runAll: 総合部門にライバルが実在し勝敗が記録される', () => {
  const s = allFifty(); // スコア75.5 > 志音1年45.4
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5); // 1年OIDC: 志音のみ
  assert.strictEqual(rs[0].rivalOutcomes.length, 1);
  assert.strictEqual(rs[0].rivalOutcomes[0].id, 'shion');
  assert.strictEqual(rs[0].rivalOutcomes[0].score, 45.4);
  assert.strictEqual(rs[0].rivalOutcomes[0].beat, true);
  assert.strictEqual(s.rivalRecord.shion.win, 1);
  assert.strictEqual(s.motivation, 4); // 勝ってやる気+1
  assert.ok(rs[0].rivalMessages.some(m => m.includes('志音')));
});

test('runAll: AJDCには魁人も出る・負けは魁人ノーペナルティ', () => {
  const s = allFifty(); // スコア75.5: 志音1年45.4に勝ち、魁人66(raw)相当のリマップ値に負ける
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[1], ['overall'], () => 0.5); // 1年AJDC
  assert.strictEqual(rs[0].rivalOutcomes.length, 2);
  assert.strictEqual(s.rivalRecord.shion.win, 1);
  assert.strictEqual(s.motivation, 4); // 志音勝ち+1のみ（魁人負けは減点なし）
});

test('runAll: スペシャリスト部門にライバルは出ない', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall', 'v1d'], () => 0.5);
  assert.deepStrictEqual(rs[1].rivalOutcomes, []);
});

test('runAll: 総合を含まないエントリー（specialistのみ）→ ライバル関与なし・motivation/rivalRecord不変', () => {
  const s = allFifty();
  const motivationBefore = s.motivation;
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['v1d', 'd2'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs.length, 2);
  assert.strictEqual(rs[0].division, 'v1d');
  assert.strictEqual(rs[1].division, 'd2');
  assert.deepStrictEqual(rs[0].rivalOutcomes, []);
  assert.deepStrictEqual(rs[1].rivalOutcomes, []);
  assert.deepStrictEqual(rs[0].rivalMessages, []);
  assert.deepStrictEqual(rs[1].rivalMessages, []);
  assert.strictEqual(s.rivalRecord.shion.win, 0);
  assert.strictEqual(s.rivalRecord.shion.lose, 0);
  assert.strictEqual(s.motivation, motivationBefore); // ライバル戦がないためやる気は変化しない
  assert.strictEqual(s.results.length, 2);
});

test('runAll: 3ディアボロ部門(d3)はv1dと同じspecialistゲート計算（all50・rng0.5→54.5）', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['d3'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(rs[0].division, 'd3');
  assert.strictEqual(rs[0].divisionLabel, '3ディアボロ部門');
  // parts合計50 → gate 0.4+0.6*(genres.d3=50/100)=0.7 → rawTotal 35 → scaled 30+35*0.7=54.5
  assert.strictEqual(rs[0].rawTotal, 35);
  assert.strictEqual(rs[0].score, 54.5);
});

test('runAll: 空配列は何もせずstateを変更しない', () => {
  const s = allFifty();
  const before = JSON.stringify(s);
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], [], () => 0.5);
  assert.deepStrictEqual(rs, []);
  assert.strictEqual(JSON.stringify(s), before);
});

test('worldsContestForTurn: 11月だけ返す', () => {
  assert.strictEqual(DT.contest.worldsContestForTurn(8).type, 'worlds');
  assert.strictEqual(DT.contest.worldsContestForTurn(8).name, '1年 世界大会');
  assert.strictEqual(DT.contest.worldsContestForTurn(44).name, '4年 世界大会');
  assert.strictEqual(DT.contest.worldsContestForTurn(5), null);
});

test('worldsQualified: 直近1年のOIDC/AJDC優勝で出場権', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.worldsQualified(s, 8), false);
  s.results.push({ name: '1年 OIDC', type: 'oidc', division: 'v1d', rank: 1, points: 20, turn: 5 });
  assert.strictEqual(DT.contest.worldsQualified(s, 8), true);   // スペシャ部門優勝でもOK
  assert.strictEqual(DT.contest.worldsQualified(s, 20), false); // 翌年には失効（20-12=8 < 5は範囲外）
  s.results.push({ name: '1年 AJDC', type: 'ajdc', division: 'overall', rank: 2, points: 70, turn: 12 });
  assert.strictEqual(DT.contest.worldsQualified(s, 20), false); // 2位では権利なし
  s.results.push({ name: '2年 OIDC', type: 'oidc', division: 'overall', rank: 1, points: 40, turn: 17 });
  assert.strictEqual(DT.contest.worldsQualified(s, 20), true);
});

test('runAll: 世界大会は総合のみ・魁人が出る・超高レベル', () => {
  const s = allFifty();
  DT.DATA.STATS.forEach(st => { s.stats[st.id] = 100; });
  DT.DATA.GENRES.forEach(g => { s.genres[g.id] = 100; });
  const wc = DT.contest.worldsContestForTurn(44); // 4年
  const rs = DT.contest.runAll(s, wc, ['overall'], () => 0.5);
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(rs[0].rank, 1); // 全能力100(=満点130raw)なら魁人にも勝つ
  assert.strictEqual(rs[0].points, 150);
  assert.strictEqual(rs[0].turn, 44);
  assert.strictEqual(rs[0].rivalOutcomes.length, 1);
  assert.strictEqual(rs[0].rivalOutcomes[0].id, 'kaito');
});

test('結果オブジェクトにturnが入る（既存大会）', () => {
  const s = allFifty();
  DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5);
  assert.strictEqual(s.results[0].turn, 5);
});

test('runAll: 結果オブジェクトにrawTotalが入る・スペシャリストはゲート後の値（Σpartsと不一致）', () => {
  const s = allFifty();
  s.genres.v1d = 0; // v1d部門のゲートが最低0.4に落ちるケース（他ジャンルは50のまま）
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall', 'v1d'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs[0].division, 'overall');
  const overallPartsSum = Object.values(rs[0].parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(rs[0].rawTotal, overallPartsSum); // overallはゲート対象外・Σpartsと一致

  assert.strictEqual(rs[1].division, 'v1d');
  const partsSum = Object.values(rs[1].parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(partsSum, 50); // Σparts(素点)は50のまま
  assert.strictEqual(rs[1].rawTotal, 20); // ゲート後(0.4倍)の値でΣpartsとは不一致
  assert.notStrictEqual(rs[1].rawTotal, partsSum);
});

test('runAll: 結果オブジェクトにgateMultが入る・overall=1、スペシャリスト全50=0.7', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall', 'v1d'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs[0].division, 'overall');
  assert.strictEqual(rs[0].gateMult, 1);
  assert.strictEqual(rs[1].division, 'v1d');
  assert.strictEqual(rs[1].gateMult, 0.7);
});

summary();
