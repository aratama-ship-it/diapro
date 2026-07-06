(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const SAVE_KEY = 'diabolo-trainer-save-v6';
  const OLD_KEYS = ['diabolo-trainer-save-v1', 'diabolo-trainer-save-v2', 'diabolo-trainer-save-v3', 'diabolo-trainer-save-v4', 'diabolo-trainer-save-v5'];

  function newCharacter(rng, backgroundId) {
    rng = rng || Math.random;
    const bg = DT.DATA.BACKGROUNDS.find(b => b.id === backgroundId) ||
               DT.DATA.BACKGROUNDS.find(b => b.id === 'highschool');
    // rng消費順: STATS(4件)→GENRES(4件)→study の順に固定（テストでピン留め）
    const stats = {};
    DT.DATA.STATS.forEach(s => { stats[s.id] = bg.statMin + Math.floor(rng() * bg.statSpread); });
    const genres = {};
    DT.DATA.GENRES.forEach(g => { genres[g.id] = bg.statMin + Math.floor(rng() * bg.statSpread); });
    return {
      turn: 1,
      stats: stats,
      genres: genres,
      study: 40 + Math.floor(rng() * 21),
      fatigue: 0,
      injuryRisk: 10,
      motivation: 3,
      injuredTurns: 0,
      lowStudyMonths: 0,
      banTurns: 0,
      didStudy: false,
      didTrain: false,
      results: [],
      status: 'playing',
      name: '主人公',
      background: bg.id,
      coachEvents: 0,
      specialUnlocked: false,
      rivalRecord: DT.DATA.RIVALS.reduce((acc, r) => { acc[r.id] = { win: 0, lose: 0 }; return acc; }, {}),
      lastSlots: []
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

  DT.state = { newCharacter, save, load, clear, SAVE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
