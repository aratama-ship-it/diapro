(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};

  const ID = 'short';
  const PLAYER_TURNS = 24;

  function isShort(value) {
    if (typeof value === 'string') return value === ID;
    return !!value && value.gameMode === ID;
  }

  // turnは4月始まりの内部月番号（1〜48）。4月=練習、5月=イベント…と交互に進む。
  function calendarMonth(turn) {
    return ((turn - 1) % 12 + 3) % 12 + 1;
  }

  function isPracticeMonth(turn) {
    return calendarMonth(turn) % 2 === 0;
  }

  function isEventMonth(turn) {
    return !isPracticeMonth(turn);
  }

  function playerTurn(turn) {
    return Math.ceil(turn / 2);
  }

  function periodLabel(turn, turnLabel) {
    const first = turnLabel(turn);
    if (turn >= 48) return first;
    const second = turnLabel(turn + 1).replace(/^\d+年生\s*/, '');
    return first + ' → ' + second;
  }

  DT.shortMode = { ID, PLAYER_TURNS, isShort, calendarMonth, isPracticeMonth, isEventMonth, playerTurn, periodLabel };
})(typeof window !== 'undefined' ? window : globalThis);
