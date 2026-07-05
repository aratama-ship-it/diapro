(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const SAVE_KEY = 'diabolo-trainer-save-v1';

  function newCharacter(rng) {
    rng = rng || Math.random;
    const stats = {};
    DT.DATA.STATS.forEach(s => { stats[s.id] = 10 + Math.floor(rng() * 26); });
    return {
      turn: 1,
      stats: stats,
      study: 40 + Math.floor(rng() * 21),
      fatigue: 0,
      injuryRisk: 10,
      motivation: 3,
      injuredTurns: 0,
      lowStudyMonths: 0,
      didStudy: false,
      didTrain: false,
      results: [],
      status: 'playing'
    };
  }

  function save(state, storage) {
    (storage || global.localStorage).setItem(SAVE_KEY, JSON.stringify(state));
  }

  function load(storage) {
    const raw = (storage || global.localStorage).getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clear(storage) {
    (storage || global.localStorage).removeItem(SAVE_KEY);
  }

  DT.state = { newCharacter, save, load, clear, SAVE_KEY };
})(typeof window !== 'undefined' ? window : globalThis);
