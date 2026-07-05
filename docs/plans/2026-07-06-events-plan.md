# イベントシステム＋主人公名入力（v2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャライベント（固定5人）・ライバル大会実在システム・ランダムハプニングの3本柱と、主人公名の入力を実装する。

**Architecture:** イベント定義は `data.js` にデータ駆動で追加、判定・適用ロジックは新モジュール `js/events.js`。ライバルは `contest.js` の総合部門対戦相手に名前つきで実在し、独自成長曲線を持つ。イベント発生は「練習後のオマケ」（大会月は発生しない）。UIは選択肢つきイベント画面を1枚追加。セーブキーv4。

**Tech Stack:** 変更なし（vanilla JS、Nodeテスト、innerHTML禁止）

## Global Constraints

- 既存のIIFE・rng注入・innerHTML禁止・データ駆動規約を維持
- イベント発生は大会月（contestForTurnが非null）と療養中（actionId==='injured'）はスキップ。それ以外の行動後に1回roll: r<0.20でキャライベント、r<0.28でハプニング
- キャライベントは2択。ハプニングは選択肢なし（ログに出るだけ）
- コーチイベントを2回経験すると「特別指導」解放: 以降、練習の成功時ゲイン+1（失敗時は+0のまま）。解放は一度きり
- ライバル: 志音（同学年の天才）=OIDC/AJDC両方の総合部門に出場、魁人（社会人王者）=AJDCの総合部門のみ。スコアは各自の成長曲線+ノイズ。総合部門のentrants合計は16のまま（ランダム相手を減らして置き換える）
- ライバル勝敗: 総合部門でライバルに勝つとやる気+1（複数勝ちでも+1）、志音に負けるとやる気-1（魁人への負けはペナルティなし）。通算成績をstate.rivalRecordに記録
- 主人公名: キャラ作成画面で入力（8文字まで、空なら「主人公」）。エンディングとイベント画面で使用
- セーブキー `diabolo-trainer-save-v4`、OLD_KEYSにv3追加
- キャラ名は仮置き（後でユーザーが変更可能なようdata.jsに一元化）: 剣持コーチ／陽太（同期）／美琴先輩／志音（ライバル）／魁人（王者）
- リポジトリルート: app-dev/diabolo-trainer/

---

### Task 1: data.js キャラ・イベント・ライバル定義、state v4

**Files:**
- Modify: `js/data.js`（CHARACTERS/EVENTS/RIVALS追加。既存ブロック不変）
- Modify: `js/state.js`（SAVE_KEY v4、OLD_KEYSにv3、newCharacterに新フィールド）
- Modify: `tests/test-data.js`、`tests/test-state.js`

**Interfaces:**
- Produces: `DT.DATA.CHARACTERS` = `[{id, name, role}]`（coach/yota/mikoto/shion/kaito）
- Produces: `DT.DATA.EVENTS` = `{ charEvents: [{id, char, text, choices:[{label, effects, result}]}], happenings: [{id, text, effects}] }`
  - effects形式: `{ stat?: {id, amount}, motivation?, fatigue?, study? }`（複数キー可）
- Produces: `DT.DATA.RIVALS` = `[{id:'shion', name:'志音', contests:['oidc','ajdc'], base:22, growth:10, sd:4}, {id:'kaito', name:'魁人', contests:['ajdc'], base:66, growth:2.5, sd:4}]`
- Produces: state新フィールド: `name:'主人公'`, `coachEvents:0`, `specialUnlocked:false`, `rivalRecord:{shion:{win:0,lose:0}, kaito:{win:0,lose:0}}`（rivalRecordはDT.DATA.RIVALSから動的生成）

- [ ] **Step 1: テスト追記（test-data / test-state）**

test-data.jsに追加:
```js
test('DATA: キャラ5人とライバル2人が定義されている', () => {
  assert.strictEqual(DT.DATA.CHARACTERS.length, 5);
  assert.strictEqual(DT.DATA.RIVALS.length, 2);
  assert.deepStrictEqual(DT.DATA.RIVALS.map(r => r.id), ['shion', 'kaito']);
  assert.deepStrictEqual(DT.DATA.RIVALS[0].contests, ['oidc', 'ajdc']);
  assert.deepStrictEqual(DT.DATA.RIVALS[1].contests, ['ajdc']);
});

test('DATA: イベント定義の整合性', () => {
  const ev = DT.DATA.EVENTS;
  assert.ok(ev.charEvents.length >= 10);
  assert.ok(ev.happenings.length >= 5);
  const charIds = DT.DATA.CHARACTERS.map(c => c.id);
  ev.charEvents.forEach(e => {
    assert.ok(charIds.includes(e.char), e.id + ' のcharが未定義');
    assert.strictEqual(e.choices.length, 2, e.id);
    e.choices.forEach(c => {
      assert.ok(c.label && c.result, e.id);
      if (c.effects.stat) assert.ok(DT.DATA.STATS.some(s => s.id === c.effects.stat.id), e.id);
    });
  });
  ev.happenings.forEach(h => assert.ok(h.text && h.effects, h.id));
});
```

test-state.jsに追加:
```js
test('newCharacter: v2フィールド（名前・イベント進行・ライバル戦績）', () => {
  const c = DT.state.newCharacter(() => 0);
  assert.strictEqual(c.name, '主人公');
  assert.strictEqual(c.coachEvents, 0);
  assert.strictEqual(c.specialUnlocked, false);
  assert.deepStrictEqual(c.rivalRecord, { shion: { win: 0, lose: 0 }, kaito: { win: 0, lose: 0 } });
});
```
既存の「旧キー掃除」テストのOLD_KEYS検証にv3も追加（storeにv3キーを置いてload後nullを確認）。

- [ ] **Step 2: 失敗確認** → `node tests/test-data.js`, `node tests/test-state.js` FAIL

- [ ] **Step 3: data.jsに追加**

```js
    // v2: 登場キャラクター（名前はdata.jsで一元管理 — 変更はここだけでよい）
    CHARACTERS: [
      { id: 'coach',  name: '剣持コーチ', role: '部の指導者。元世界チャンピオン' },
      { id: 'yota',   name: '陽太',       role: '同期のムードメーカー' },
      { id: 'mikoto', name: '美琴先輩',   role: '理論派の先輩' },
      { id: 'shion',  name: '志音',       role: '同学年の天才ライバル' },
      { id: 'kaito',  name: '魁人',       role: 'AJDC連覇中の王者' }
    ],
    EVENTS: {
      charEvents: [
        { id: 'coach1', char: 'coach', text: '「基礎ができてない奴に応用はない」剣持コーチが基礎の反復を命じてきた。',
          choices: [
            { label: '黙って従う',       effects: { stat: { id: 'fundamentals', amount: 3 }, fatigue: 8 },  result: '地味な反復の先に、確かな手応えがあった。' },
            { label: '自分の練習を主張', effects: { stat: { id: 'novelty', amount: 2 }, motivation: 1 },     result: '「…好きにしろ」意外にも認めてくれた。' } ] },
        { id: 'coach2', char: 'coach', text: '剣持コーチが自分の現役時代の映像を見せてくれた。',
          choices: [
            { label: '技術を盗む',       effects: { stat: { id: 'difficulty', amount: 3 } },                  result: '世界レベルの技術を目に焼き付けた。' },
            { label: '見せ方を学ぶ',     effects: { stat: { id: 'composition', amount: 3 } },                 result: '「魅せて初めて点になる」深い言葉だった。' } ] },
        { id: 'yota1', char: 'yota', text: '陽太が「息抜きしようぜ！」とゲームセンターに誘ってきた。',
          choices: [
            { label: '付き合う',         effects: { fatigue: -15, motivation: 1 },                            result: '思い切り笑って、心が軽くなった。' },
            { label: '練習を優先',       effects: { stat: { id: 'control', amount: 2 }, motivation: -1 },     result: '断った罪悪感はあるが、腕は上がった。' } ] },
        { id: 'yota2', char: 'yota', text: '陽太が動画撮影を手伝ってくれると言う。',
          choices: [
            { label: '演技を撮ってもらう', effects: { stat: { id: 'composition', amount: 2 } },               result: '客観的に見ると構成の粗がよく分かった。' },
            { label: '技のスローを撮る',   effects: { stat: { id: 'control', amount: 2 } },                   result: 'フォームの癖を修正できた。' } ] },
        { id: 'mikoto1', char: 'mikoto', text: '美琴先輩が採点規則の読み合わせに誘ってくれた。',
          choices: [
            { label: '構成理論を教わる', effects: { stat: { id: 'composition', amount: 3 } },                 result: '「起承転結は音楽で決まるのよ」目から鱗だった。' },
            { label: '試験勉強も教わる', effects: { study: 8 },                                               result: 'ついでに レポートの書き方まで教わった。' } ] },
        { id: 'mikoto2', char: 'mikoto', text: '美琴先輩が「あなたの演技、もったいないのよね」と呟いた。',
          choices: [
            { label: '詳しく聞く',       effects: { stat: { id: 'variety', amount: 3 } },                     result: '技の引き出しの偏りを指摘された。' },
            { label: '聞き流す',         effects: { motivation: 1 },                                          result: '自分のスタイルを貫くのも大事だ。' } ] },
        { id: 'shion1', char: 'shion', text: '志音の練習を偶然見てしまった。異次元の完成度だった。',
          choices: [
            { label: '闘志を燃やす',     effects: { motivation: 2 },                                          result: '「次の大会で絶対に勝つ」' },
            { label: '技を研究する',     effects: { stat: { id: 'novelty', amount: 2 }, fatigue: 5 },         result: '深夜まで分析ノートを書き込んだ。' } ] },
        { id: 'shion2', char: 'shion', text: '志音に「お前、最近ちょっと面白いな」と声をかけられた。',
          choices: [
            { label: '勝負を挑む',       effects: { stat: { id: 'difficulty', amount: 2 }, fatigue: 8 },      result: '即席の技比べ。負けたが、得るものがあった。' },
            { label: '素直に喜ぶ',       effects: { motivation: 1, study: -3 },                               result: '浮かれてその日は勉強が手につかなかった。' } ] },
        { id: 'kaito1', char: 'kaito', text: 'SNSで王者・魁人の新技映像が流れてきた。世界が違う。',
          choices: [
            { label: '何度も見返す',     effects: { stat: { id: 'difficulty', amount: 2 } },                  result: '理屈は分かった。あとは体で覚えるだけだ。' },
            { label: '自分の道を行く',   effects: { stat: { id: 'composition', amount: 2 } },                 result: '同じ土俵で戦わない。それも戦略だ。' } ] },
        { id: 'kaito2', char: 'kaito', text: '大会会場で魁人に「学生で面白いのが居ると聞いた」と話しかけられた。',
          choices: [
            { label: '目標です、と言う', effects: { motivation: 2 },                                          result: '「なら早く上がってこい」胸が熱くなった。' },
            { label: '倒す相手です、と言う', effects: { stat: { id: 'control', amount: 2 }, motivation: 1 },  result: '「…いい目だ」王者は笑った。' } ] }
      ],
      happenings: [
        { id: 'hap1', text: 'バイト代で新しいディアボロを購入した！', effects: { stat: { id: 'control', amount: 2 } } },
        { id: 'hap2', text: '風邪をひいてしまった……', effects: { fatigue: 15, motivation: -1 } },
        { id: 'hap3', text: '文化祭で演技を披露して大ウケだった！', effects: { stat: { id: 'composition', amount: 2 }, motivation: 1 } },
        { id: 'hap4', text: '練習動画がSNSで少しバズった！', effects: { motivation: 2 } },
        { id: 'hap5', text: '大雨で体育館が使えず、家でゆっくり過ごした。', effects: { fatigue: -10 } }
      ]
    },
    // v2: ライバル（総合部門に実在する対戦相手）
    RIVALS: [
      { id: 'shion', name: '志音', contests: ['oidc', 'ajdc'], base: 22, growth: 10, sd: 4 },
      { id: 'kaito', name: '魁人', contests: ['ajdc'],         base: 66, growth: 2.5, sd: 4 }
    ],
```

> **注**: イベントのstat IDはすべて現行STATS（difficulty/variety/control/novelty/composition/fundamentals）を使うこと。テストの整合性チェックが守ってくれる。

- [ ] **Step 4: state.jsを更新**

```js
  const SAVE_KEY = 'diabolo-trainer-save-v4';
  const OLD_KEYS = ['diabolo-trainer-save-v1', 'diabolo-trainer-save-v2', 'diabolo-trainer-save-v3'];
```
newCharacterの返り値に追加:
```js
      name: '主人公',
      coachEvents: 0,
      specialUnlocked: false,
      rivalRecord: DT.DATA.RIVALS.reduce((acc, r) => { acc[r.id] = { win: 0, lose: 0 }; return acc; }, {}),
```

- [ ] **Step 5: ゲート確認** → test-data / test-state / test-engine 緑（contest/ending/simulationは影響なしのはず — 全部回して確認）

- [ ] **Step 6: コミット** `feat: キャラ・イベント・ライバル定義とセーブv4`

---

### Task 2: events.js 判定・適用ロジック＋特別指導ボーナス

**Files:**
- Create: `js/events.js`
- Modify: `js/engine.js`（specialUnlockedボーナス1行）
- Create: `tests/test-events.js`
- Modify: `tests/test-engine.js`（ボーナステスト追記）

**Interfaces:**
- Produces: `DT.events.roll(state, rng)` → `null | { kind:'char', event } | { kind:'happening', event }`（発生判定のみ。大会月・療養中の判定は呼び出し側）
- Produces: `DT.events.applyChoice(state, event, choiceIndex, )` → `{ messages: string[] }`（効果適用＋コーチカウント＋特別指導解放判定）
- Produces: `DT.events.applyHappening(state, event)` → `{ messages: string[] }`
- Produces: engine.applyAction: 練習が失敗以外のとき `state.specialUnlocked` なら gain+1

- [ ] **Step 1: test-events.jsを書く**

```js
'use strict';
const assert = require('node:assert');
const { test, summary } = require('./harness');
require('../js/data.js');
require('../js/state.js');
require('../js/events.js');
const DT = globalThis.DT;

function base() { return DT.state.newCharacter(() => 0); }

test('roll: r<0.20でキャライベント、r<0.28でハプニング、以上でnull', () => {
  const s = base();
  const seq1 = [0.1, 0.0]; let i1 = 0; // 発生roll, イベント選択roll
  const r1 = DT.events.roll(s, () => seq1[i1++]);
  assert.strictEqual(r1.kind, 'char');
  const seq2 = [0.25, 0.0]; let i2 = 0;
  const r2 = DT.events.roll(s, () => seq2[i2++]);
  assert.strictEqual(r2.kind, 'happening');
  assert.strictEqual(DT.events.roll(s, () => 0.5), null);
});

test('applyChoice: 効果が適用されメッセージが返る', () => {
  const s = base();
  const ev = DT.DATA.EVENTS.charEvents.find(e => e.id === 'yota1');
  const before = s.fatigue = 30;
  const r = DT.events.applyChoice(s, ev, 0); // 付き合う: fatigue-15, motivation+1
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.motivation, 4);
  assert.ok(r.messages.some(m => m.includes('心が軽く')));
});

test('applyChoice: statとstudyの効果・クランプ', () => {
  const s = base();
  const ev = DT.DATA.EVENTS.charEvents.find(e => e.id === 'mikoto1');
  DT.events.applyChoice(s, ev, 1); // study+8
  assert.strictEqual(s.study, 48);
  const ev2 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach1');
  DT.events.applyChoice(s, ev2, 0); // fundamentals+3, fatigue+8
  assert.strictEqual(s.stats.fundamentals, 13);
});

test('コーチイベント2回で特別指導解放（一度きり）', () => {
  const s = base();
  const c1 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach1');
  const c2 = DT.DATA.EVENTS.charEvents.find(e => e.id === 'coach2');
  DT.events.applyChoice(s, c1, 1);
  assert.strictEqual(s.specialUnlocked, false);
  const r = DT.events.applyChoice(s, c2, 0);
  assert.strictEqual(s.specialUnlocked, true);
  assert.ok(r.messages.some(m => m.includes('特別指導')));
  assert.strictEqual(s.coachEvents, 2);
});

test('applyHappening: 効果適用', () => {
  const s = base();
  const h = DT.DATA.EVENTS.happenings.find(e => e.id === 'hap2');
  const r = DT.events.applyHappening(s, h); // fatigue+15, motivation-1
  assert.strictEqual(s.fatigue, 15);
  assert.strictEqual(s.motivation, 2);
  assert.ok(r.messages.length >= 1);
});

summary();
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: events.jsを実装**

```js
(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const CHAR_P = 0.20;
  const HAPPENING_P = 0.28; // char判定の上に積む（0.20〜0.28の帯）

  function roll(state, rng) {
    rng = rng || Math.random;
    const r = rng();
    if (r < CHAR_P) {
      const list = DT.DATA.EVENTS.charEvents;
      return { kind: 'char', event: list[Math.floor(rng() * list.length)] };
    }
    if (r < HAPPENING_P) {
      const list = DT.DATA.EVENTS.happenings;
      return { kind: 'happening', event: list[Math.floor(rng() * list.length)] };
    }
    return null;
  }

  function applyEffects(state, effects) {
    const messages = [];
    if (effects.stat) {
      state.stats[effects.stat.id] = clamp(state.stats[effects.stat.id] + effects.stat.amount, 0, 100);
      const label = DT.DATA.STATS.find(s => s.id === effects.stat.id).label;
      messages.push(label + (effects.stat.amount >= 0 ? ' +' : ' ') + effects.stat.amount);
    }
    if (effects.motivation) state.motivation = clamp(state.motivation + effects.motivation, 1, 5);
    if (effects.fatigue) state.fatigue = clamp(state.fatigue + effects.fatigue, 0, 100);
    if (effects.study) state.study = clamp(state.study + effects.study, 0, 100);
    return messages;
  }

  function applyChoice(state, event, choiceIndex) {
    const choice = event.choices[choiceIndex];
    const messages = [choice.result].concat(applyEffects(state, choice.effects));
    if (event.char === 'coach') {
      state.coachEvents += 1;
      if (state.coachEvents >= 2 && !state.specialUnlocked) {
        state.specialUnlocked = true;
        messages.push('剣持コーチの特別指導を受けられるようになった！（練習成功時の伸び+1）');
      }
    }
    return { messages };
  }

  function applyHappening(state, event) {
    const messages = [event.text].concat(applyEffects(state, event.effects));
    return { messages };
  }

  DT.events = { roll, applyChoice, applyHappening };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: engine.jsの練習ゲインに特別指導ボーナス**

applyActionの練習分岐、`} else if (gain < 1) { gain = 1; }` の直後に:
```js
    if (tier !== '失敗' && state.specialUnlocked) gain += 1;
```
（statsへの加算前に置くこと）

test-engine.jsに追記:
```js
test('applyAction: 特別指導解放後は成功時ゲイン+1', () => {
  const s = base();
  s.specialUnlocked = true;
  DT.engine.applyAction(s, 'difficulty', () => 0.0); // 大成功: 18+1
  assert.strictEqual(s.stats.difficulty, 29);
  const s2 = base();
  s2.specialUnlocked = true;
  DT.engine.applyAction(s2, 'difficulty', () => 0.15); // 失敗: +0のまま
  assert.strictEqual(s2.stats.difficulty, 10);
});
```

- [ ] **Step 5: 確認** → test-events / test-engine 含め全スイート（simulation以外）緑

- [ ] **Step 6: コミット** `feat: イベント判定・適用ロジックと特別指導ボーナス`（index.htmlへのscript追加はEV-5）

---

### Task 3: contest.js ライバル実在システム

**Files:**
- Modify: `js/contest.js`
- Modify: `tests/test-contest.js`

**Interfaces:**
- Produces: `DT.contest.rivalScore(rival, contest, rng)` → 曲線+ノイズのスコア
- Produces: runDivision（総合部門のみ）: 対戦相手のうちライバル該当分を置き換え、結果に `rivalOutcomes: [{id, name, score, beat}]` を追加（他部門は空配列）
- Produces: runAll: 総合部門の結果からrivalRecord更新＋やる気変動（勝ち+1／志音に負け-1）。eventsフィールドにメッセージ（'志音に勝った！'等）を持たせ、結果オブジェクトに `rivalMessages: string[]` を追加

- [ ] **Step 1: テスト追記（test-contest.js、summary()前）**

```js
test('rivalScore: 成長曲線どおり（ノイズ0）', () => {
  const shion = DT.DATA.RIVALS[0];
  // rng 0.5 → ノイズ0
  assert.strictEqual(DT.contest.rivalScore(shion, DT.DATA.CONTESTS[0], () => 0.5), 22); // 1年
  assert.strictEqual(DT.contest.rivalScore(shion, DT.DATA.CONTESTS[7], () => 0.5), 52); // 4年
});

test('runAll: 総合部門にライバルが実在し勝敗が記録される', () => {
  const s = allFifty(); // スコア50 > 志音1年22
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], [], () => 0.5); // 1年OIDC: 志音のみ
  assert.strictEqual(rs[0].rivalOutcomes.length, 1);
  assert.strictEqual(rs[0].rivalOutcomes[0].id, 'shion');
  assert.strictEqual(rs[0].rivalOutcomes[0].beat, true);
  assert.strictEqual(s.rivalRecord.shion.win, 1);
  assert.strictEqual(s.motivation, 4); // 勝ってやる気+1
  assert.ok(rs[0].rivalMessages.some(m => m.includes('志音')));
});

test('runAll: AJDCには魁人も出る・負けは魁人ノーペナルティ', () => {
  const s = allFifty(); // スコア50: 志音1年22に勝ち、魁人66に負け
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[1], [], () => 0.5); // 1年AJDC
  assert.strictEqual(rs[0].rivalOutcomes.length, 2);
  assert.strictEqual(s.rivalRecord.kaito.lose, 1);
  assert.strictEqual(s.rivalRecord.shion.win, 1);
  assert.strictEqual(s.motivation, 4); // 志音勝ち+1のみ（魁人負けは減点なし）
});

test('runAll: スペシャリスト部門にライバルは出ない', () => {
  const s = allFifty();
  const rs = DT.contest.runAll(s, DT.DATA.CONTESTS[0], ['v1d'], () => 0.5);
  assert.deepStrictEqual(rs[1].rivalOutcomes, []);
});
```

- [ ] **Step 2: 失敗確認**

- [ ] **Step 3: contest.jsを実装**

```js
  function rivalScore(rival, contest, rng) {
    rng = rng || Math.random;
    const year = Math.ceil(contest.turn / 12);
    return Math.round((rival.base + rival.growth * (year - 1) + (rng() - 0.5) * 2 * rival.sd) * 10) / 10;
  }

  function rivalsFor(contest) {
    return DT.DATA.RIVALS.filter(r => r.contests.includes(contest.type));
  }
```

runDivisionの変更（総合部門のみライバル挿入）:
```js
    const rivals = divisionId === 'overall' ? rivalsFor(contest) : [];
    const rivalEntries = rivals.map(r => ({ rival: r, score: rivalScore(r, contest, rng) }));
    const opponents = [];
    for (let i = 0; i < lv.entrants - 1 - rivalEntries.length; i++) {
      const g = (rng() + rng() + rng()) / 3;
      opponents.push(mean + (g - 0.5) * 2 * lv.sd * 1.8);
    }
    const p = playerScore(state, divisionId, rng);
    const allScores = opponents.concat(rivalEntries.map(e => e.score));
    const rank = 1 + allScores.filter(o => o > p.score).length;
    ...
    const rivalOutcomes = rivalEntries.map(e => ({
      id: e.rival.id, name: e.rival.name, score: e.score, beat: p.score > e.score
    }));
```
結果オブジェクトに `rivalOutcomes` を追加。

**rng消費順に注意**: ライバルスコアを先に消費（rivalEntries生成）→ランダム相手→playerScore。テストの期待値はこの順序で成立している（rng固定0.5ならノイズ0で順序の影響はないが、シミュレーションの再現性のため固定順とする）。

runAllの総合部門処理後に:
```js
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
```
exportsに `rivalScore` を追加。

- [ ] **Step 4: 確認** → test-contest緑、既存テストの回帰確認（1位/16人系テストはランダム相手が減っても総数16のまま成立するか検算すること: 1年OIDCは志音22点<50点なのでrank1のまま）

- [ ] **Step 5: コミット** `feat: ライバル実在システム（総合部門・勝敗記録・やる気変動）`

---

### Task 4: シミュレーション統合

**Files:**
- Modify: `tests/test-simulation.js`

**Interfaces:**
- playThroughにイベントを組み込む（UIと同じ順序: applyAction → 大会月でなければevents.roll → charはchoice 0を適用/happeningは適用 → 大会 → endTurn）

- [ ] **Step 1: playThrough更新**

```js
function playThrough(rng, choose) {
  const state = DT.state.newCharacter(rng);
  let guard = 0;
  while (state.status === 'playing' && guard < 100) {
    guard += 1;
    const action = choose(state);
    DT.engine.applyAction(state, action, rng);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      DT.contest.runAll(state, contest, specialistPick(state.turn), rng);
    } else if (action !== 'injured') {
      const ev = DT.events.roll(state, rng);
      if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
      else if (ev) DT.events.applyHappening(state, ev.event);
    }
    DT.engine.endTurn(state, rng);
  }
  return state;
}
```
requireに `../js/events.js` を追加。

- [ ] **Step 2: アサーション追加（summary()前）**

```js
test('イベントは4年間で複数回発生し、特別指導も到達可能', () => {
  let unlockedCount = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = playThrough(lcg(seed), chooseSensible);
    if (s.specialUnlocked) unlockedCount += 1;
  }
  assert.ok(unlockedCount >= 5, '特別指導解放が少なすぎる: ' + unlockedCount + '/20');
});

test('ライバル戦績が記録される', () => {
  const s = playThrough(lcg(3), chooseSensible);
  const shion = s.rivalRecord.shion;
  assert.strictEqual(shion.win + shion.lose, 8); // 志音は全8大会に出る
  const kaito = s.rivalRecord.kaito;
  assert.strictEqual(kaito.win + kaito.lose, 4); // 魁人はAJDCのみ
});
```

- [ ] **Step 3: 全テスト実行＋分布確認**

イベント効果でランク分布が上振れする可能性がある。分布テストの出力を必ずレポートに記載し、S（優勝経由含む）が20中5以上になったらDONE_WITH_CONCERNSで報告（閾値・イベント効果量の調整はコントローラー判断）。

- [ ] **Step 4: コミット** `test: イベントとライバルをシミュレーションに統合`

---

### Task 5: UI — 名前入力・イベント画面・ライバル表示

**Files:**
- Modify: `index.html`（events.jsのscript追加、name入力、イベント画面セクション）
- Modify: `css/style.css`（input用の最小スタイル）
- Modify: `js/app.js`

**Interfaces:**
- キャラ作成画面に名前入力（8文字、空なら「主人公」）
- イベント画面: キャラ名＋本文＋2択ボタン（ハプニングはメインログに出すだけ）
- 大会結果: 総合部門ブロックにrivalMessages行を追加
- エンディング: 名前入り称号＋ライバル通算成績

- [ ] **Step 1: index.html**

- `<script src="js/events.js"></script>` を contest.js の後・app.jsの前に追加（ending.jsの後でも可、data/stateより後なら安全）
- screen-createの`#create-stats`の前に:
```html
    <div class="card">
      <label for="create-name" class="subtitle">選手の名前（8文字まで）</label>
      <input id="create-name" maxlength="8" placeholder="主人公">
    </div>
```
- screen-entryの後に:
```html
  <section id="screen-event" class="screen hidden">
    <h2 id="event-char"></h2>
    <div id="event-text" class="card"></div>
    <div id="event-choices" class="card"></div>
  </section>
```

- [ ] **Step 2: style.css**

```css
input {
  width: 100%;
  padding: 10px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #11111f;
  color: #eaeaea;
  font-size: 1rem;
}
#event-choices { display: flex; flex-direction: column; gap: 8px; }
```

- [ ] **Step 3: app.js**

(a) btn-start: `state = candidate; state.name = ($('#create-name').value || '').trim() || '主人公'; ...`

(b) onActionのイベント差し込み（大会分岐の後、finishTurnの前）:
```js
  function onAction(actionId) {
    const result = DT.engine.applyAction(state, actionId);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      pendingMessages = result.messages;
      pendingContest = contest;
      renderEntry(contest);
      return;
    }
    if (actionId !== 'injured') {
      const ev = DT.events.roll(state);
      if (ev && ev.kind === 'char') {
        pendingMessages = result.messages;
        renderEvent(ev.event);
        return;
      }
      if (ev) {
        const h = DT.events.applyHappening(state, ev.event);
        finishTurn(result.messages.concat(h.messages), null);
        return;
      }
    }
    finishTurn(result.messages, null);
  }

  function renderEvent(event) {
    const chara = DT.DATA.CHARACTERS.find(c => c.id === event.char);
    $('#event-char').textContent = chara.name;
    $('#event-text').replaceChildren(el('p', '', event.text));
    const buttons = event.choices.map((c, i) => {
      const b = el('button', i === 0 ? 'primary' : '', c.label);
      b.onclick = () => {
        const r = DT.events.applyChoice(state, event, i);
        finishTurn(pendingMessages.concat(r.messages), null);
      };
      return b;
    });
    $('#event-choices').replaceChildren(...buttons);
    show('#screen-event');
  }
```

(c) renderContestResultsの総合ブロック（i===0の減点行の後）に:
```js
        (r.rivalMessages || []).forEach(m => nodes.push(el('div', 'cond-warn', m)));
```
（勝ちメッセージも同スタイルで可。気になるなら勝ち=通常テキストにしてよい）

(d) renderEnding: タイトルを `state.name + 'の4年間'` を含む形に（例: `$('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : state.name + '、卒業！';`）。ランク表示の後にライバル戦績:
```js
    DT.DATA.RIVALS.forEach(rv => {
      const rec = state.rivalRecord[rv.id];
      nodes.push(textRow(rv.name + '戦', rec.win + '勝' + rec.lose + '敗'));
    });
```

- [ ] **Step 4: 検証** → `node --check js/app.js`＋全スイート。ブラウザ確認はコントローラー実施（名前入力→イベント発生→2択→ログ反映、大会でライバル勝敗表示、エンディングに名前と戦績）

- [ ] **Step 5: コミット** `feat: 名前入力・イベント画面・ライバル表示UI`

---

## 完了条件

- 全テスト緑（events追加で50本超）、シミュレーションにイベント・ライバルが統合され分布が報告される
- ブラウザ: 名前入力→練習後にイベントが時々発生（2択）→大会結果に「志音に勝った！」等→エンディングに名前・ライバル通算成績
- 特別指導（コーチ×2）が実プレイで到達可能

## 対象外

- 裏エンディング「サーカスの世界へ」（v3候補）
- ジャンル別スキルファクター（1D/2D/3D練習軸）— ユーザー要望として記録済み、能力体系の再設計を伴うため別タスク
- キャラ名の最終決定（data.jsのCHARACTERSを書き換えるだけで変更可能）
