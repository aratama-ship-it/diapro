(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const TIER_MULT = { '大成功': 2.0, '成功': 1.0, '普通': 0.5, '失敗': 0 };

  function outcomeProbs(state) {
    const boost = (state.motivation - 3) * 0.05
      + (state.study >= DT.DATA.STUDY_BONUS ? 0.05 : 0)
      - Math.max(0, state.fatigue - 50) * 0.004;
    const great = clamp(0.10 + boost, 0.02, 0.30);
    const fail = clamp(
      0.10 + Math.max(0, state.fatigue - 50) * 0.006 - (state.motivation - 3) * 0.03,
      0.03, 0.40
    );
    return { great, fail };
  }

  function rollTier(state, rng) {
    const p = outcomeProbs(state);
    const r = (rng || Math.random)();
    if (r < p.great) return '大成功';
    if (r < p.great + p.fail) return '失敗';
    const rest = 1 - p.great - p.fail;
    return r < p.great + p.fail + rest * 0.6 ? '成功' : '普通';
  }

  function growthMult(value) {
    if (value >= 90) return 0.25;
    if (value >= 70) return 0.5;
    if (value >= 40) return 0.75;
    return 1.0;
  }

  function statLabel(id) {
    return DT.DATA.STATS.find(s => s.id === id).label;
  }

  function genreLabel(id) {
    return DT.DATA.GENRES.find(g => g.id === id).label;
  }

  // 枠の練習内容を表す表示専用ラベル（ログメッセージ用。データそのものはSTATSのid/labelに従う）
  const METHOD_LABEL = { difficulty: '高難度技', novelty: '新技開発', control: '反復練習' };

  function isContestMonth(state) {
    return DT.DATA.CONTESTS.some(c => c.turn === state.turn);
  }

  function isAfterPerformance(state) {
    return state.results.some(r => r.turn === state.turn - 1);
  }

  function isMeetupMonth(turn) {
    return turn % DT.DATA.MEETUP.interval === DT.DATA.MEETUP.offset;
  }

  function applyAction(state, actionId, rng) {
    rng = rng || Math.random;
    const messages = [];
    state.didStudy = false;
    state.didTrain = false;

    if (actionId === 'injured') {
      messages.push('怪我の療養に専念した。');
      return { tier: null, messages };
    }
    if (actionId === 'rest') {
      let recover = 35;
      let riskRecover = 12;
      let note = '';
      if (isContestMonth(state)) {
        recover += DT.DATA.TIMING.contestMonth.restExtra;
        note = DT.DATA.TIMING.contestMonth.restNote;
      } else if (isAfterPerformance(state)) {
        recover += DT.DATA.TIMING.afterContest.restExtra;
        riskRecover += DT.DATA.TIMING.afterContest.restRiskExtra;
        note = DT.DATA.TIMING.afterContest.restNote;
      }
      state.fatigue = clamp(state.fatigue - recover, 0, 100);
      state.injuryRisk = clamp(state.injuryRisk - riskRecover, 0, 100);
      state.motivation = clamp(state.motivation + 1, 1, 5);
      messages.push('ゆっくり休んだ。疲労が回復した。' + note);
      return { tier: null, messages };
    }
    // actionId === 'study'
    const tier = rollTier(state, rng);
    const gain = Math.round(DT.DATA.STUDY.gain * TIER_MULT[tier]);
    state.study = clamp(state.study + gain, 0, 100);
    state.fatigue = clamp(state.fatigue + DT.DATA.STUDY.fatigue, 0, 100);
    state.didStudy = true;
    messages.push('勉強（' + tier + '）: 学力 +' + gain);
    return { tier, messages };
  }
  // Note: applyAction is now scoped to 'study'/'rest'/'injured' only (per v3 plan Task 2).
  // Training moved to applyTraining (slot-based, below).

  // 1枠分のゲインを計算する。key: method id ('difficulty'/'novelty'/'control') または 'routine'
  // baseGain: SLOTS.methodGain または SLOTS.routineGain。growthValue: growthMult計算に使う現在値（stats[method] または stats.composition）
  function computeSlotGain(state, key, baseGain, growthValue, tier) {
    let gain = Math.round(baseGain * TIER_MULT[tier] * growthMult(growthValue));
    if (tier === '失敗') {
      gain = 0;
    } else if (gain < 1) {
      gain = 1;
    }
    let timingNote = '';
    let extraFatigue = 0;
    if (isContestMonth(state)) {
      const tm = DT.DATA.TIMING.contestMonth[key];
      if (tm) {
        if (tier !== '失敗') {
          gain = Math.round(gain * tm.gainMult);
          timingNote = tm.note;
        }
        if (tm.extraFatiguePerSlot) {
          extraFatigue = tm.extraFatiguePerSlot;
          if (tier === '失敗') timingNote = tm.note;
        }
      }
    }
    if (isMeetupMonth(state.turn)) {
      const boost = DT.DATA.MEETUP.boosts[key];
      if (boost && tier !== '失敗') {
        gain = Math.round(gain * boost);
        timingNote = timingNote + DT.DATA.MEETUP.note;
      }
    }
    if (tier !== '失敗' && state.specialUnlocked) gain += 1;
    return { gain, timingNote, extraFatigue };
  }

  // 疲労は枠ごとに逐次state.fatigueへ加算する（後続枠のrollTier/growthMultは前枠の結果を反映した状態で評価される）
  // rng消費: 1枠につきrollTier用に1回のみ
  function applyTraining(state, slots, rng) {
    rng = rng || Math.random;
    state.didStudy = false;
    const messages = [];
    const results = [];

    slots.forEach(slot => {
      const isRoutine = slot === 'routine';
      const key = isRoutine ? 'routine' : slot.method;
      const tier = rollTier(state, rng);

      if (isRoutine) {
        const { gain, timingNote, extraFatigue } = computeSlotGain(state, 'routine', DT.DATA.SLOTS.routineGain, state.stats.composition, tier);
        state.stats.composition = clamp(state.stats.composition + gain, 0, 100);
        state.fatigue = clamp(state.fatigue + DT.DATA.SLOTS.fatigue.routine + extraFatigue, 0, 100);
        state.injuryRisk = clamp(state.injuryRisk + DT.DATA.SLOTS.risk.routine, 0, 100);
        if (tier === '大成功') state.motivation = clamp(state.motivation + 1, 1, 5);
        if (tier === '失敗') state.motivation = clamp(state.motivation - 1, 1, 5);
        results.push({ slot, tier, methodGain: gain });
        if (tier === '失敗') {
          messages.push('ルーチン構成（失敗）: うまくいかず疲れだけが残った……' + timingNote);
        } else {
          messages.push('ルーチン構成（' + tier + '）: 演技構成 +' + gain + timingNote);
        }
      } else {
        const method = slot.method;
        const genre = slot.genre;
        const { gain: methodGain, timingNote, extraFatigue } = computeSlotGain(state, method, DT.DATA.SLOTS.methodGain, state.stats[method], tier);
        let genreGain = Math.round(DT.DATA.SLOTS.genreGain * TIER_MULT[tier] * growthMult(state.genres[genre]));
        if (tier === '失敗') {
          genreGain = 0;
        } else if (genreGain < 1) {
          genreGain = 1;
        }
        state.stats[method] = clamp(state.stats[method] + methodGain, 0, 100);
        state.genres[genre] = clamp(state.genres[genre] + genreGain, 0, 100);
        state.fatigue = clamp(state.fatigue + DT.DATA.SLOTS.fatigue[method] + extraFatigue, 0, 100);
        state.injuryRisk = clamp(state.injuryRisk + DT.DATA.SLOTS.risk[method] + DT.DATA.SLOTS.genreRisk[genre], 0, 100);
        if (tier === '大成功') state.motivation = clamp(state.motivation + 1, 1, 5);
        if (tier === '失敗') state.motivation = clamp(state.motivation - 1, 1, 5);
        results.push({ slot, tier, methodGain, genreGain });
        if (tier === '失敗') {
          messages.push(genreLabel(genre) + '×' + METHOD_LABEL[method] + '（失敗）: うまくいかず疲れだけが残った……' + timingNote);
        } else {
          messages.push(genreLabel(genre) + '×' + METHOD_LABEL[method] + '（' + tier + '）: ' + statLabel(method) + ' +' + methodGain + '・習熟 +' + genreGain + timingNote);
        }
      }
    });

    state.didTrain = true;
    state.lastSlots = slots.map(slot => (slot === 'routine' ? 'routine' : { genre: slot.genre, method: slot.method }));
    return { results, messages };
  }

  function endTurn(state, rng) {
    rng = rng || Math.random;
    const events = [];

    if (state.banTurns > 0) {
      state.banTurns -= 1;
      if (state.banTurns === 0) events.push('補習期間が終わった！');
    }

    if (!state.didStudy) state.study = clamp(state.study - 2, 0, 100);
    state.fatigue = clamp(state.fatigue - 5, 0, 100);
    if (state.didTrain && state.fatigue >= 60) {
      state.injuryRisk = clamp(state.injuryRisk + 5, 0, 100);
    }

    if (state.didTrain && rng() < state.injuryRisk / 500) {
      state.injuredTurns = 1;
      state.injuryRisk = 25;
      state.motivation = clamp(state.motivation - 1, 1, 5);
      events.push('怪我をしてしまった！ 来月は療養が必要だ。');
    } else if (state.injuredTurns > 0) {
      state.injuredTurns -= 1;
      state.fatigue = clamp(state.fatigue - 25, 0, 100);
      if (state.injuredTurns === 0) events.push('怪我が治った！');
    }

    if (state.study < DT.DATA.STUDY_MIN) {
      state.lowStudyMonths += 1;
      if (state.lowStudyMonths >= DT.DATA.STUDY_LIMIT_MONTHS) {
        state.status = 'expelled';
        events.push('学業不振により退学処分となった……');
        return { events };
      }
      events.push('学業警告！（' + state.lowStudyMonths + '/' + DT.DATA.STUDY_LIMIT_MONTHS + 'ヶ月）');
    } else {
      state.lowStudyMonths = 0;
    }

    if (DT.DATA.EXAMS.turns.includes(state.turn)) {
      if (state.study < DT.DATA.EXAMS.passLine) {
        state.banTurns = DT.DATA.EXAMS.banMonths;
        events.push('定期テスト赤点！（学力' + state.study + '/' + DT.DATA.EXAMS.passLine + '）補習のため' + DT.DATA.EXAMS.banMonths + 'ヶ月間練習禁止…');
      } else {
        events.push('定期テスト合格！（学力' + state.study + '）');
      }
    }

    state.turn += 1;
    if (state.turn > DT.DATA.TOTAL_TURNS) state.status = 'graduated';
    return { events };
  }

  function turnLabel(turn) {
    const year = Math.ceil(turn / 12);
    const month = ((turn - 1) % 12 + 3) % 12 + 1;
    return year + '年生 ' + month + '月';
  }

  DT.engine = { outcomeProbs, rollTier, growthMult, applyAction, applyTraining, endTurn, turnLabel, isMeetupMonth, TIER_MULT };
})(typeof window !== 'undefined' ? window : globalThis);
