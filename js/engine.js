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
      state.fatigue = clamp(state.fatigue - 35, 0, 100);
      state.injuryRisk = clamp(state.injuryRisk - 12, 0, 100);
      state.motivation = clamp(state.motivation + 1, 1, 5);
      messages.push('ゆっくり休んだ。疲労が回復した。');
      return { tier: null, messages };
    }
    if (actionId === 'study') {
      const tier = rollTier(state, rng);
      const gain = Math.round(DT.DATA.STUDY.gain * TIER_MULT[tier]);
      state.study = clamp(state.study + gain, 0, 100);
      state.fatigue = clamp(state.fatigue + DT.DATA.STUDY.fatigue, 0, 100);
      state.didStudy = true;
      messages.push('勉強（' + tier + '）: 学力 +' + gain);
      return { tier, messages };
    }

    const t = DT.DATA.TRAININGS.find(x => x.id === actionId);
    const tier = rollTier(state, rng);
    let gain = Math.round(t.gain * TIER_MULT[tier] * growthMult(state.stats[t.stat]));
    if (tier === '失敗') {
      gain = 0;
    } else if (gain < 1) {
      gain = 1;
    }
    if (tier !== '失敗' && state.specialUnlocked) gain += 1;
    state.stats[t.stat] = clamp(state.stats[t.stat] + gain, 0, 100);
    state.fatigue = clamp(state.fatigue + t.fatigue, 0, 100);
    state.injuryRisk = clamp(state.injuryRisk + t.risk, 0, 100);
    state.didTrain = true;

    if (tier === '失敗') {
      state.fatigue = clamp(state.fatigue + 5, 0, 100);
      state.motivation = clamp(state.motivation - 1, 1, 5);
      messages.push(t.label + '（失敗）: うまくいかず疲れだけが残った……');
    } else {
      if (tier === '大成功') state.motivation = clamp(state.motivation + 1, 1, 5);
      messages.push(t.label + '（' + tier + '）: ' + statLabel(t.stat) + ' +' + gain);
    }
    return { tier, messages };
  }

  function endTurn(state, rng) {
    rng = rng || Math.random;
    const events = [];

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

    state.turn += 1;
    if (state.turn > DT.DATA.TOTAL_TURNS) state.status = 'graduated';
    return { events };
  }

  function turnLabel(turn) {
    const year = Math.ceil(turn / 12);
    const month = ((turn - 1) % 12 + 3) % 12 + 1;
    return year + '年生 ' + month + '月';
  }

  DT.engine = { outcomeProbs, rollTier, growthMult, applyAction, endTurn, turnLabel, TIER_MULT };
})(typeof window !== 'undefined' ? window : globalThis);
