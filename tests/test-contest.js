'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/contest.js');
const DT = globalThis.DT;

function allFifty() {
  const s = DT.state.newCharacter(() => 0);
  DT.DATA.GENRES.forEach(g => {
    DT.DATA.METHODS.forEach(m => { s.skills[g.id][m.id] = 50; });
  });
  s.composition = 50;
  return s;
}

function allZeroSkills() {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => {
    DT.DATA.METHODS.forEach(m => { s.skills[g.id][m.id] = 0; });
  });
  return s;
}

// 全マスを指定genreAvg一定値にする（3マス同値にすればgenreAvg=その値になる）
function setGenreAvg(s, genreId, value) {
  DT.DATA.METHODS.forEach(m => { s.skills[genreId][m.id] = value; });
}

// ---- genreAvg ----

test('genreAvg: 3マス平均を0.1精度で返す', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.genreAvg(s, 'v1d'), 50);
  s.skills.v1d = { difficulty: 10, novelty: 30, control: 60 };
  assert.strictEqual(DT.contest.genreAvg(s, 'v1d'), 33.3); // (10+30+60)/3=33.333...→33.3
});

// ---- 導出値 ----

test('derivedVariety: 全ジャンルgenreAvg0で0点', () => {
  const s = allZeroSkills();
  assert.strictEqual(DT.contest.derivedVariety(s), 0);
});

test('derivedVariety: 全ジャンルgenreAvg50で満点10（Σmin=200/200×10）', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.derivedVariety(s), 10);
});

test('derivedVariety: 混在ケース・0.1精度で丸め', () => {
  const s = allFifty();
  setGenreAvg(s, 'v1d', 10); setGenreAvg(s, 'h1d', 30); setGenreAvg(s, 'd2', 60); setGenreAvg(s, 'd3', 0);
  // Σmin(genreAvg,50) = 10+30+50+0 = 90 → 90/200*10 = 4.5
  assert.strictEqual(DT.contest.derivedVariety(s), 4.5);
});

test('derivedVariety: 全ジャンルgenreAvg100でも満点10で頭打ち（min(genreAvg,50)）', () => {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => setGenreAvg(s, g.id, 100));
  assert.strictEqual(DT.contest.derivedVariety(s), 10);
});

test('derivedBase: 全ジャンルgenreAvg0でelements0・points0', () => {
  const s = allZeroSkills();
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 0, points: 0 });
});

test('derivedBase: 全ジャンルgenreAvg50(≥threshold25)でelements4・points20', () => {
  const s = allFifty();
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 4, points: 20 });
});

test('derivedBase: 閾値ちょうど(25)は基礎点に含まれる', () => {
  const s = allZeroSkills();
  setGenreAvg(s, 'v1d', 25);
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 1, points: 5 });
});

test('derivedBase: 混在ケースで該当ジャンルのみ数える', () => {
  const s = allFifty();
  setGenreAvg(s, 'v1d', 10); setGenreAvg(s, 'h1d', 30); setGenreAvg(s, 'd2', 60); setGenreAvg(s, 'd3', 0);
  assert.deepStrictEqual(DT.contest.derivedBase(s), { elements: 2, points: 10 });
});

// ---- breakdown（ゲートなし・overall=4ジャンル平均方式／specialist=直接マス） ----

test('breakdown(overall): 6項目・all50/全マス50で合計79（v6:40%下限リマップ）', () => {
  const b = DT.contest.breakdown(allFifty(), 'overall');
  // 各項目 floored=0.4×満点+0.6×raw。stat50→各50%rawなので floored=0.4max+0.6×(0.5max)=0.7max
  assert.deepStrictEqual(b, { difficulty: 21, variety: 10, control: 7, novelty: 7, composition: 14, fundamentals: 20 });
  const sum = Object.values(b).reduce((a, v) => a + v, 0);
  assert.strictEqual(sum, 79);
});

test('breakdown(specialist): 4項目のみ・all50で合計70（v6:40%下限）', () => {
  const b = DT.contest.breakdown(allFifty(), 'v1d');
  assert.deepStrictEqual(b, { difficulty: 31.5, control: 10.5, novelty: 21, composition: 7 });
  const sum = Object.values(b).reduce((a, v) => a + v, 0);
  assert.strictEqual(sum, 70);
});

test('breakdown(overall): 全マス0でも各導出項目は40%下限になる（variety4/fundamentals8）', () => {
  const s = allZeroSkills();
  const b = DT.contest.breakdown(s, 'overall');
  assert.strictEqual(b.variety, 4); // 0.4×10
  assert.strictEqual(b.fundamentals, 8); // 0.4×20
});

test('breakdown(specialist): 他ジャンルの値に一切影響されない（そのジャンルのマスのみ参照）', () => {
  const s = allFifty();
  s.skills.h1d = { difficulty: 0, novelty: 0, control: 0 }; // v1dの結果に影響しないはず
  const b = DT.contest.breakdown(s, 'v1d');
  assert.deepStrictEqual(b, { difficulty: 31.5, control: 10.5, novelty: 21, composition: 7 });
});

test('breakdown(overall): 難易度/操作安定度/新奇性は4ジャンル平均を参照する', () => {
  const s = allFifty();
  s.skills.h1d.difficulty = 100; s.skills.v1d.difficulty = 100; s.skills.d2.difficulty = 100; s.skills.d3.difficulty = 100;
  const b = DT.contest.breakdown(s, 'overall');
  assert.strictEqual(b.difficulty, 30); // avg100 * 30/100 = 30
});

// ---- ゲート廃止の確認 ----

test('playerScore(specialist): ゲートは廃止・rawTotalはΣpartsとそのまま一致する（v1d, all50, rng0.5）', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, 'v1d', () => 0.5);
  assert.strictEqual(r.rawTotal, 70); // v6:40%下限で all50 → 70
  assert.strictEqual(r.gateMult, undefined, 'gateMultはv4で廃止されている');
});

test('playerScore(specialist): 該当ジャンルが低くても40%下限が効く（v1d=0でもrawTotal43）', () => {
  const s = allFifty();
  s.skills.v1d = { difficulty: 0, novelty: 0, control: 0 };
  const r = DT.contest.playerScore(s, 'v1d', () => 0.5);
  // difficulty18(0.4×45)+control6(0.4×15)+novelty12(0.4×30)+composition7(0.4×10+0.6×5)=43
  assert.strictEqual(r.rawTotal, 43);
});

// ---- v6: スケール廃止（表示スコア＝素点合計−減点） ----

test('playerScore(overall): 検算基準（全マス50・composition50・rng0.5固定）→ raw79 → score79（スケール廃止）', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, 'overall', () => 0.5);
  assert.strictEqual(r.rawTotal, 79);
  assert.strictEqual(r.judgeMod, 0);
  assert.strictEqual(r.misses, 0);
  assert.strictEqual(r.execDeduction, 0);
  assert.strictEqual(r.specialDeduction, 0);
  assert.strictEqual(r.score, 79); // 素点そのまま
});

test('playerScore(specialist): 検算基準（all50, rng0.5固定）→ raw70 → score70（スケール廃止で素点そのまま）', () => {
  const s = allFifty();
  const r = DT.contest.playerScore(s, 'v1d', () => 0.5);
  assert.strictEqual(r.rawTotal, 70);
  assert.strictEqual(r.score, 70);
});

test('playerScore: parts合計はrawTotalと一致し、scoreはリマップ後の値', () => {
  const s = allFifty();
  s.motivation = 100; // judgeMod = (100-50)*0.08 = 4 + noise
  const r = DT.contest.playerScore(s, 'overall', () => 0.5); // noise 0
  const partsSum = Object.values(r.parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(partsSum, r.rawTotal);
  assert.strictEqual(r.judgeMod, 4);
  const scaled = DT.DATA.SCORING.scale.base + r.rawTotal * DT.DATA.SCORING.scale.mult;
  assert.strictEqual(r.score, Math.round((scaled + r.judgeMod) * 10) / 10);
});

// ---- 新ミスモデル: missRate ----

test('missRate: 部門参照値ごとの境界値（overall=4ジャンルcontrol平均, specialist=skills[d].control）', () => {
  const s = allZeroSkills();
  // control=0, fatigue=0 → rate = 70-0+0 = 70
  assert.strictEqual(DT.contest.missRate(s, 'overall'), 70);
  assert.strictEqual(DT.contest.missRate(s, 'v1d'), 70);
});

test('missRate: controlが高いほど下がり、min(5)でクランプされる', () => {
  const s = allZeroSkills();
  DT.DATA.GENRES.forEach(g => { s.skills[g.id].control = 100; });
  // rate = 70 - 100*0.5 + 0 = 20
  assert.strictEqual(DT.contest.missRate(s, 'overall'), 20);
  DT.DATA.GENRES.forEach(g => { s.skills[g.id].control = 200; }); // 異常値でも式通りクランプ
  assert.strictEqual(DT.contest.missRate(s, 'overall'), 5); // 70-100=-30 → clamp min5
});

test('missRate: 疲労が高いほど上がり、max(90)でクランプされる', () => {
  const s = allZeroSkills();
  s.fatigue = 100; // rate = 70-0+30=100 → clamp 90
  assert.strictEqual(DT.contest.missRate(s, 'overall'), 90);
});

test('missRate: all50基準はcontrol50・fatigue0で45', () => {
  const s = allFifty();
  assert.strictEqual(DT.contest.missRate(s, 'overall'), 45);
  assert.strictEqual(DT.contest.missRate(s, 'v1d'), 45);
});

test('missRate: specialistは該当ジャンルのcontrolのみ参照し他ジャンルは無関係', () => {
  const s = allFifty();
  s.skills.h1d.control = 0; s.skills.d2.control = 0; s.skills.d3.control = 0; // v1d以外を全部0にしても
  assert.strictEqual(DT.contest.missRate(s, 'v1d'), 45); // v1dのcontrol(50)だけで決まる
});

// ---- 新ミスモデル: 判定回数（rolls + hardLineボーナス） ----

test('playerScore: difficulty参照値がhardLine(60)未満なら6ロール（rng消費量から判定）', () => {
  const s = allFifty(); // difficulty avg 50 < 60
  let count = 0;
  const rng = () => { count++; return 0.9; }; // rate45想定, 90<45false→missなし・magnitude消費なし
  DT.contest.playerScore(s, 'overall', rng);
  assert.strictEqual(count, 1 + 6 + 1); // noise + 6ロール(ノーミス) + special
});

test('playerScore: difficulty参照値がhardLine(60)以上なら8ロール（rolls+hardBonusRolls）', () => {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => { s.skills[g.id].difficulty = 60; });
  let count = 0;
  const rng = () => { count++; return 0.9; };
  DT.contest.playerScore(s, 'overall', rng);
  assert.strictEqual(count, 1 + 8 + 1);
});

test('playerScore: specialistのhardLineはそのマス(skills[d].difficulty)のみ参照', () => {
  const s = allFifty();
  s.skills.v1d.difficulty = 60; // v1dだけhard
  let count = 0;
  const rng = () => { count++; return 0.9; };
  DT.contest.playerScore(s, 'v1d', rng);
  assert.strictEqual(count, 1 + 8 + 1);
});

test('playerScore: hardLineちょうど未満(59)は6ロールのまま', () => {
  const s = allFifty();
  s.skills.v1d.difficulty = 59;
  let count = 0;
  const rng = () => { count++; return 0.9; };
  DT.contest.playerScore(s, 'v1d', rng);
  assert.strictEqual(count, 1 + 6 + 1);
});

// ---- 新ミスモデル: playerScoreの完全トレース（rng消費列を手計算でピン） ----

test('playerScore: ミス2回のフルトレース（specialist, control0・fatigue100→rate90, rolls6）', () => {
  const s = allFifty();
  s.skills.v1d.control = 0;
  s.fatigue = 100;
  // rate = clamp(70-0+30,5,90) = 90
  assert.strictEqual(DT.contest.missRate(s, 'v1d'), 90);
  // v6(40%下限): difficulty floor(22.5,45)=31.5 + control floor(0,15)=6 + novelty floor(15,30)=21 + composition floor(5,10)=7 = 65.5
  const seq = [
    0.5,        // noise → judgeMod 0
    0.1, 0.4,   // roll1: 10<90 miss, magnitude0.4→1+round(0.4*1)=1
    0.95,       // roll2: 95<90 false → no miss
    0.2, 0.9,   // roll3: 20<90 miss, magnitude0.9→1+round(0.9*1)=2
    0.99, 0.99, 0.99, // roll4-6: no miss
    0.99        // specialDeduction: 99<5 false
  ];
  let i = 0;
  const r = DT.contest.playerScore(s, 'v1d', () => seq[i++]);
  assert.strictEqual(r.rawTotal, 65.5);
  assert.strictEqual(r.misses, 2);
  assert.strictEqual(r.execDeduction, 3); // 1+2
  assert.strictEqual(r.specialDeduction, 0);
  assert.strictEqual(i, 10); // rng消費数(noise1+ロール毎チェック6+ミス時magnitude2+special1)
  const scaled = DT.DATA.SCORING.scale.base + r.rawTotal * DT.DATA.SCORING.scale.mult;
  assert.strictEqual(r.score, Math.round((scaled + r.judgeMod - r.execDeduction - r.specialDeduction) * 10) / 10);
  assert.strictEqual(r.score, 62.5); // v6スケール廃止: 65.5 + 0 - 3 - 0
});

test('maxEntries: 学年+1で増え部門総数5で頭打ち', () => {
  assert.strictEqual(DT.contest.maxEntries(5), 2);   // 1年
  assert.strictEqual(DT.contest.maxEntries(17), 3);  // 2年
  assert.strictEqual(DT.contest.maxEntries(29), 4);  // 3年
  assert.strictEqual(DT.contest.maxEntries(41), 5);  // 4年
  assert.strictEqual(DT.contest.maxEntries(48), 5);  // 4年（cap=部門総数5）
});

// ---- runAll/runDivision（相手・ライバルも同一リマップ36） ----

test('runAll: 総合+スペシャ1部門で結果2件・疲労が演技間に加算される', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall', 'v1d'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs.length, 2);
  assert.strictEqual(rs[0].division, 'overall');
  assert.strictEqual(rs[0].score, 79); // v6: all50 overall素点79
  assert.strictEqual(rs[0].rank, 1);
  assert.strictEqual(rs[0].points, 40);
  assert.strictEqual(rs[1].division, 'v1d');
  assert.strictEqual(rs[1].divisionLabel, '1ディアボロ垂直軸部門');
  // v6: all50のspecialist素点70 < OIDC相手72 → スペシャは最下位(16位)。総合(79)は勝てるが専門は相手が上
  assert.strictEqual(rs[1].rank, 16);
  assert.strictEqual(rs[1].points, 1); // 最下位ティア（specialist points[20,13,8,4,1]）
  assert.strictEqual(s.fatigue, 6);     // 2演技目の前に+6
  assert.strictEqual(s.results.length, 2);
});

test('runAll: AJDCのポイントは総合100/スペシャ50', () => {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => { DT.DATA.METHODS.forEach(m => { s.skills[g.id][m.id] = 100; }); });
  s.composition = 100;
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[7], ['overall', 'd2'], () => 0.5); // 4年AJDC
  assert.strictEqual(rs[0].points, 100);
  assert.strictEqual(rs[1].points, 50);
});

test('contestForTurn: OIDC/AJDCの月だけ返す', () => {
  assert.strictEqual(DT.contest.contestForTurn(5).type, 'oidc');
  assert.strictEqual(DT.contest.contestForTurn(48).type, 'ajdc');
  assert.strictEqual(DT.contest.contestForTurn(11), null);
});

test('rivalScore: 表示スコア空間で成長曲線を返す（v6・ノイズ0）', () => {
  const shion = DT.DATA.RIVALS[0];
  // v6: base76+growth2×(年-1)。1年76／4年82。スケール廃止で素点そのまま
  assert.strictEqual(DT.contest.rivalScore(shion, DT.DATA.CONTESTS[0], () => 0.5), 76);
  assert.strictEqual(DT.contest.rivalScore(shion, DT.DATA.CONTESTS[7], () => 0.5), 82);
});

test('runDivision: 対戦相手の生成値は表示スコア空間そのまま（oidc1年・mean72・ノイズ0）', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5); // 1年OIDC 相手平均72
  // プレイヤー79 > 志音76 > モブ72 → rank1
  assert.strictEqual(rs[0].rank, 1);
  // standings[0]=自分(79,1位) standings[1]=志音(76,2位) standings[2]=モブ(72,3位)
  const shionRow = rs[0].standings.find(e => e.name === '志音');
  assert.strictEqual(shionRow.score, 76);
  assert.strictEqual(shionRow.rank, 2); // 志音76はモブ72より強く2位
  const mob = rs[0].standings.find(e => e.rank === 3);
  assert.strictEqual(mob.score, 72); // モブの生成値=mean72（ノイズ0）
});

test('runAll: 総合部門にライバルが実在し勝敗が記録される', () => {
  const s = allFifty(); // スコア79 > 志音1年76
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5); // 1年OIDC: 志音のみ
  assert.strictEqual(rs[0].rivalOutcomes.length, 1);
  assert.strictEqual(rs[0].rivalOutcomes[0].id, 'shion');
  assert.strictEqual(rs[0].rivalOutcomes[0].score, 76);
  assert.strictEqual(rs[0].rivalOutcomes[0].beat, true);
  assert.strictEqual(s.rivalRecord.shion.win, 1);
  assert.strictEqual(s.motivation, 58); // 勝ってやる気+8（50→58）
  assert.ok(rs[0].rivalMessages.some(m => m.includes('志音')));
});

test('runAll: AJDCには魁人も出る・負けは魁人ノーペナルティ', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[1], ['overall'], () => 0.5); // 1年AJDC
  assert.strictEqual(rs[0].rivalOutcomes.length, 2);
  assert.strictEqual(s.rivalRecord.shion.win, 1);
  assert.strictEqual(s.motivation, 58); // 志音勝ち+8のみ（50→58、魁人負けは減点なし）
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
  assert.strictEqual(s.motivation, motivationBefore);
  assert.strictEqual(s.results.length, 2);
});

test('runAll: 3ディアボロ部門(d3)はv1dと同じspecialist計算（all50・rng0.5→raw70→70）', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['d3'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(rs[0].division, 'd3');
  assert.strictEqual(rs[0].divisionLabel, '3ディアボロ部門');
  assert.strictEqual(rs[0].rawTotal, 70);
  assert.strictEqual(rs[0].score, 70);
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
  assert.strictEqual(DT.contest.worldsQualified(s, 20), false); // 翌年には失効
  s.results.push({ name: '1年 AJDC', type: 'ajdc', division: 'overall', rank: 2, points: 70, turn: 12 });
  assert.strictEqual(DT.contest.worldsQualified(s, 20), false); // 2位では権利なし
  s.results.push({ name: '2年 OIDC', type: 'oidc', division: 'overall', rank: 1, points: 40, turn: 17 });
  assert.strictEqual(DT.contest.worldsQualified(s, 20), true);
});

test('runAll: 世界大会は総合のみ・魁人が出る・超高レベル', () => {
  const s = allFifty();
  DT.DATA.GENRES.forEach(g => { DT.DATA.METHODS.forEach(m => { s.skills[g.id][m.id] = 100; }); });
  s.composition = 100;
  const wc = DT.contest.worldsContestForTurn(44); // 4年
  const rs = DT.contest.runAll(s, wc, ['overall'], () => 0.5);
  assert.strictEqual(rs.length, 1);
  assert.strictEqual(rs[0].rank, 1); // 全能力100なら魁人にも勝つ
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

test('runAll: 結果オブジェクトにrawTotalが入る（overallはΣpartsと一致、specialistもゲート廃止で一致）', () => {
  const s = allFifty();
  s.skills.v1d = { difficulty: 0, novelty: 0, control: 0 }; // v1dだけ弱くする（他は影響しないことを確認）
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall', 'v1d'], () => 0.5); // 1年OIDC
  assert.strictEqual(rs[0].division, 'overall');
  const overallPartsSum = Object.values(rs[0].parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(rs[0].rawTotal, overallPartsSum);

  assert.strictEqual(rs[1].division, 'v1d');
  const partsSum = Object.values(rs[1].parts).reduce((a, v) => a + v, 0);
  assert.strictEqual(partsSum, 43); // v6: v1d=0でも40%下限で18+6+12+composition7=43
  assert.strictEqual(rs[1].rawTotal, 43); // ゲート廃止でΣpartsと完全一致
});

// ---- 怪我中のミス率ペナルティ（v3復活機能） ----

test('missRate: injuredTurns>0でミス率+15%（クランプ内のケース）', () => {
  const s = allFifty(); // control50・fatigue0 → base rate 45（クランプ内）
  s.injuredTurns = 0;
  const rateHealthy = DT.contest.missRate(s, 'overall');
  s.injuredTurns = 1;
  const rateInjured = DT.contest.missRate(s, 'overall');
  assert.strictEqual(rateHealthy, 45);
  assert.strictEqual(rateInjured, 60);
  assert.strictEqual(rateInjured - rateHealthy, 15);
});

// ---- standings（順位表） ----

test('standings: 完全同点は同じrankを共有し、result.rank算出式（厳密に大きい人数+1）と一致する', () => {
  const entries = [
    { name: 'A', score: 80 },
    { name: 'B', score: 80 },
    { name: 'C', score: 70, isPlayer: true }
  ];
  const st = DT.contest.buildStandings(entries);
  const a = st.find(e => e.name === 'A');
  const b = st.find(e => e.name === 'B');
  const c = st.find(e => e.isPlayer);
  assert.strictEqual(a.rank, 1);
  assert.strictEqual(b.rank, 1); // 同点は同rank
  assert.strictEqual(c.rank, 3); // 80より厳密に大きいのが2人 → 1+2=3（旧: sort-index式だとrank3のまま一致するが、上位互換のため式で明示検証）
});

test('standings: プレイヤーが他者と完全同点の場合、standings上のrankがresult.rank算出式と一致する', () => {
  const entries = [
    { name: 'A', score: 80 },
    { name: 'B', score: 80, isPlayer: true },
    { name: 'C', score: 70 }
  ];
  const st = DT.contest.buildStandings(entries);
  const self = st.find(e => e.isPlayer);
  // result.rank相当の算出式: 1 + 自分より厳密に大きいスコアの人数
  const expectedRank = 1 + entries.filter(e => e.score > self.score).length;
  assert.strictEqual(self.rank, expectedRank);
  assert.strictEqual(self.rank, 1); // Aと同点でともに1位
  const a = st.find(e => e.name === 'A');
  assert.strictEqual(a.rank, self.rank);
});



test('standings: 上位3名＋自分＋ライバルが重複除去でrank付き格納される（自分が上位圏外のケース）', () => {
  const s = allFifty();
  s.skills.v1d = { difficulty: 5, novelty: 5, control: 5 }; // 低スコアにして下位に落とす
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['v1d'], () => 0.5);
  const st = rs[0].standings;
  assert.ok(st.length >= 4); // top3 + self（ライバルなし）
  const ranks = st.map(e => e.rank);
  assert.deepStrictEqual(ranks, ranks.slice().sort((a, b) => a - b)); // rank昇順
  const self = st.find(e => e.isPlayer);
  assert.ok(self);
  assert.strictEqual(self.rank, rs[0].rank); // 自分のrankがresult.rankと一致
  // 同点（トップのモブ3名は全員rng固定で同スコア）は同rankを共有する（重複自体は同点なら正当）
  const topScore = st[0].score;
  const topGroup = st.filter(e => e.score === topScore);
  assert.ok(topGroup.length >= 2, 'このシナリオではモブ同士が同点になるはず');
  topGroup.forEach(e => assert.strictEqual(e.rank, 1));
});

test('standings: 自分が1位のときはtop3に既に含まれ、重複なく1エントリーのみ', () => {
  const s = allFifty(); // 高スコアで1位確実
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5);
  const st = rs[0].standings;
  const selfEntries = st.filter(e => e.isPlayer);
  assert.strictEqual(selfEntries.length, 1);
  assert.strictEqual(selfEntries[0].rank, 1);
  assert.strictEqual(st[0].isPlayer, true);
});

test('standings: ライバルがいる部門ではライバルも重複除去で含まれる', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[1], ['overall'], () => 0.5); // 1年AJDC: 志音・魁人
  const st = rs[0].standings;
  const rivalEntries = st.filter(e => e.rivalId);
  assert.strictEqual(rivalEntries.length, 2);
  assert.ok(rivalEntries.some(e => e.rivalId === 'shion'));
  assert.ok(rivalEntries.some(e => e.rivalId === 'kaito'));
});

test('standings: モブの命名はrngを消費しない（rng呼び出し回数が命名なしの場合と一致する）', () => {
  const s = allFifty();
  let count = 0;
  const rng = () => { count++; return 0.5; };
  DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], rng);
  // 1年OIDC: rival1(志音)=1回、opponent(16-1-1=14)*3=42回、player(noise1+roll6+special1)=8回 → 合計51
  assert.strictEqual(count, 51);
});

test('standings: モブの命名は決定的（同じturn/indexなら同じ名前）で名簿長と重複可能性が低いストライド', () => {
  const s = allFifty();
  const rs1 = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['overall'], () => 0.5);
  const s2 = allFifty();
  const rs2 = DT.contest.runAll(s2, DT.DATA.CONTESTS[0], ['overall'], () => 0.5);
  assert.deepStrictEqual(rs1[0].standings.map(e => e.name), rs2[0].standings.map(e => e.name));
});

test('standings: 全参加者の名前はOPPONENT_NAMESプールまたは既知の名前（プレイヤー名・ライバル名）から来る', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[1], ['overall'], () => 0.5); // ライバル2名いるAJDC
  const known = new Set(DT.DATA.OPPONENT_NAMES.concat([s.name], DT.DATA.RIVALS.map(r => r.name)));
  rs[0].standings.forEach(e => assert.ok(known.has(e.name), e.name + ' が既知の名前集合にない'));
});

test('isGenreUnlocked: h1dは常時解禁、v1d/d2はh1d習熟>20、d3はd2習熟>20', () => {
  const mk = (avgs) => {
    const skills = {};
    DT.DATA.GENRES.forEach(g => {
      skills[g.id] = { difficulty: avgs[g.id], novelty: avgs[g.id], control: avgs[g.id] };
    });
    return { skills, announcedUnlocks: [] };
  };
  const zero = mk({ h1d: 0, v1d: 0, d2: 0, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'h1d'), true);  // 根は常時
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'v1d'), false);
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'd2'), false);
  assert.strictEqual(DT.contest.isGenreUnlocked(zero, 'd3'), false);

  const boundary = mk({ h1d: 20, v1d: 0, d2: 0, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(boundary, 'v1d'), false); // 20ちょうどは未解禁
  const over = mk({ h1d: 21, v1d: 0, d2: 0, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(over, 'v1d'), true);
  assert.strictEqual(DT.contest.isGenreUnlocked(over, 'd2'), true);
  assert.strictEqual(DT.contest.isGenreUnlocked(over, 'd3'), false); // d2習熟はまだ0

  const d3ready = mk({ h1d: 21, v1d: 0, d2: 25, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(d3ready, 'd3'), true);
});

// 回帰（2026-07-07 実プレイ報告）: 前提ジャンルが未解禁なら、その上位も解禁されてはいけない。
// 高校スタート等でh1d習熟が低い(≤20)のにd2の初期値がたまたま20超だと、旧実装はd3を解禁してしまった
// （isGenreUnlockedがd2習熟>20だけを見て、d2自身が未解禁であることを無視していた＝チェーン判定漏れ）。
test('isGenreUnlocked: 前提ジャンルが未解禁ならd3も未解禁（チェーン依存）', () => {
  const mk = (avgs) => {
    const skills = {};
    DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: avgs[g.id], novelty: avgs[g.id], control: avgs[g.id] }; });
    return { skills, announcedUnlocks: [] };
  };
  // h1d=15(≤20 → v1d/d2は未解禁), d2=25(>20だが d2自身が未解禁): d3は解禁されてはいけない
  const s = mk({ h1d: 15, v1d: 0, d2: 25, d3: 0 });
  assert.strictEqual(DT.contest.isGenreUnlocked(s, 'd2'), false, 'h1d≤20なのでd2は未解禁');
  assert.strictEqual(DT.contest.isGenreUnlocked(s, 'd3'), false, 'd2が未解禁なのでd3も未解禁であるべき');
});

test('newlyUnlockedGenres: 解禁済みかつ未告知のジャンルidのみ返す', () => {
  const skills = {};
  DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: 25, novelty: 25, control: 25 }; });
  // h1d解禁済み・告知済み、v1d/d2は解禁済みだが未告知、d3はd2習熟25>20で解禁済み未告知
  const state = { skills, announcedUnlocks: ['h1d'] };
  assert.deepStrictEqual(DT.contest.newlyUnlockedGenres(state).sort(), ['d2', 'd3', 'v1d']);
});

test('nextUnlockTarget: 前提が解禁済みで一番近い未解禁ジャンルを返す', () => {
  const skills = {};
  DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: 10, novelty: 10, control: 10 }; });
  const state = { skills, announcedUnlocks: ['h1d'] };
  const t = DT.contest.nextUnlockTarget(state); // h1d習熟10 → v1d/d2が候補
  assert.ok(t && (t.id === 'v1d' || t.id === 'd2'));
  assert.strictEqual(t.reqGenre, 'h1d');
  assert.ok(t.remaining >= 1);
  // 全解禁済みならnull
  DT.DATA.GENRES.forEach(g => { skills[g.id] = { difficulty: 50, novelty: 50, control: 50 }; });
  assert.strictEqual(DT.contest.nextUnlockTarget({ skills, announcedUnlocks: [] }), null);
});

summary();
