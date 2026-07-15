(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const SAVE_KEY = 'diabolo-trainer-save-v9';
  const OLD_KEYS = ['diabolo-trainer-save-v1', 'diabolo-trainer-save-v2', 'diabolo-trainer-save-v3', 'diabolo-trainer-save-v4', 'diabolo-trainer-save-v5', 'diabolo-trainer-save-v6', 'diabolo-trainer-save-v7', 'diabolo-trainer-save-v8'];

  function newCharacter(rng, backgroundId) {
    rng = rng || Math.random;
    const bg = DT.DATA.BACKGROUNDS.find(b => b.id === backgroundId) ||
               DT.DATA.BACKGROUNDS.find(b => b.id === 'highschool');
    // rng消費順: GENRES配列順×METHODS配列順（h1d.difficulty→h1d.novelty→h1d.control→v1d.difficulty→…）
    // の12マス → composition → study の順に固定（テストでピン留め）
    const skills = {};
    DT.DATA.GENRES.forEach(g => {
      skills[g.id] = {};
      DT.DATA.METHODS.forEach(m => { skills[g.id][m.id] = bg.statMin + Math.floor(rng() * bg.statSpread); });
    });
    // 演技構成は技術と別レンジを持てる（大学は技術0でも演技構成を少し残すため）。未指定なら技術と同レンジ。
    const compMin = (bg.compMin !== undefined) ? bg.compMin : bg.statMin;
    const compSpread = (bg.compSpread !== undefined) ? bg.compSpread : bg.statSpread;
    const composition = compMin + Math.floor(rng() * compSpread);
    return {
      turn: 1,
      skills: skills,
      composition: composition,
      study: 40 + Math.floor(rng() * 21),
      fatigue: 0,
      injuryRisk: 10,
      motivation: DT.DATA.MOTIVATION.initial,
      injuredTurns: 0,
      lowStudyMonths: 0,
      banTurns: 0,
      outdoorTurns: 0,
      // 覚醒: awakenTurns=残り月数, awakenUsedEarly/Late=1-2年/3-4年の枠を使ったか, awakenJustStarted=開始ターン目印, awakenEndPending=終了通知待ち
      awakenTurns: 0,
      awakenUsedEarly: false,
      awakenUsedLate: false,
      awakenJustStarted: false,
      awakenEndPending: false,
      // カード排出条件用のトラッキング（2026-07-15）: 覚醒成功回数/怪我回数/大凶を引いたか
      awakenCount: 0,
      injuryCount: 0,
      daikyoDrawn: false,
      jjfFinalist: 0,
      didStudy: false,
      didTrain: false,
      results: [],
      logHistory: [],
      status: 'playing',
      name: '主人公',
      background: bg.id,
      coachEvents: 0,
      specialUnlocked: false,
      seenCharEvents: [],
      rivalRecord: DT.DATA.RIVALS.reduce((acc, r) => { acc[r.id] = { win: 0, lose: 0 }; return acc; }, {}),
      lastSlots: [],
      // 開始時に既に解禁済みのジャンルは告知しない（h1d常時＋経歴により解禁されるもの）
      announcedUnlocks: DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked({ skills: skills }, g.id)).map(g => g.id)
    };
  }

  function save(state, storage) {
    (storage || global.localStorage).setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load(storage) {
    const s = storage || global.localStorage;
    OLD_KEYS.forEach(k => s.removeItem(k));
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clear(storage) {
    (storage || global.localStorage).removeItem(SAVE_KEY);
  }

  // --- 個人記録（ローカル）: クリアした周回の成績を localStorage に蓄積し、通算ポイント降順で保持 ---
  const RECORDS_KEY = 'diabolo-trainer-records-v1';
  const RECORDS_MAX = 20;

  function loadRecords(storage) {
    const s = storage || global.localStorage;
    try {
      const arr = JSON.parse(s.getItem(RECORDS_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  // 記録を1件追加し、通算ポイント降順にソート＆上位RECORDS_MAX件だけ保持して保存。保存後の一覧を返す。
  function addRecord(record, storage) {
    const s = storage || global.localStorage;
    const list = loadRecords(s);
    list.push(record);
    list.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    const trimmed = list.slice(0, RECORDS_MAX);
    s.setItem(RECORDS_KEY, JSON.stringify(trimmed));
    return trimmed;
  }

  DT.state = { newCharacter, save, load, clear, SAVE_KEY, loadRecords, addRecord, RECORDS_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
