(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function seenCharEvents(state) {
    if (!Array.isArray(state.seenCharEvents)) state.seenCharEvents = [];
    return state.seenCharEvents;
  }

  function pickCharEvent(state, rng) {
    const seen = new Set(seenCharEvents(state));
    const list = DT.DATA.EVENTS.charEvents;
    const event = list[Math.floor(rng() * list.length)];
    return seen.has(event.id) ? null : event;
  }

  function roll(state, rng) {
    rng = rng || Math.random;
    const probs = DT.DATA.EVENTS.probs;
    const charP = probs.char;
    const happeningP = charP + probs.happening; // char判定の上に積む帯
    const r = rng();
    if (r < charP) {
      const event = pickCharEvent(state, rng);
      return event ? { kind: 'char', event: event } : null;
    }
    if (r < happeningP) {
      const list = DT.DATA.EVENTS.happenings;
      return { kind: 'happening', event: list[Math.floor(rng() * list.length)] };
    }
    return null;
  }

  function applyEffects(state, effects) {
    const messages = [];
    if (effects.stat) {
      const id = effects.stat.id;
      const amount = effects.stat.amount;
      if (id === 'composition') {
        state.composition = clamp(state.composition + amount, 0, 100);
      } else {
        DT.DATA.GENRES.forEach(g => {
          state.skills[g.id][id] = clamp(state.skills[g.id][id] + amount, 0, 100);
        });
      }
      const label = (id === 'composition' ? DT.DATA.COMPOSITION : DT.DATA.METHODS.find(s => s.id === id)).label;
      messages.push(label + (amount >= 0 ? ' +' : ' ') + amount);
    }
    if (effects.motivation) state.motivation = clamp(state.motivation + effects.motivation, 0, 100);
    if (effects.fatigue) state.fatigue = clamp(state.fatigue + effects.fatigue, 0, 100);
    if (effects.study) state.study = clamp(state.study + effects.study, 0, 100);
    // outdoor=次の練習セッションのゲイン半減デバフ（体育館工事）。ターン数を積む
    if (effects.outdoor) state.outdoorTurns = (state.outdoorTurns || 0) + effects.outdoor;
    return messages;
  }

  function applyChoice(state, event, choiceIndex) {
    const choice = event.choices[choiceIndex];
    const messages = [choice.result].concat(applyEffects(state, choice.effects));
    const seen = seenCharEvents(state);
    if (!seen.includes(event.id)) seen.push(event.id);
    if (event.char === 'coach') {
      state.coachEvents += 1;
      if (state.coachEvents >= 2 && !state.specialUnlocked) {
        state.specialUnlocked = true;
        messages.push('野中コーチの特別指導を受けられるようになった！（練習成功時の伸び+1）');
      }
    }
    return { messages };
  }

  function applyHappening(state, event) {
    const messages = [event.text].concat(applyEffects(state, event.effects));
    return { messages };
  }

  // 定期イベント（固定・非ランダム）: 現在のturnに一致する定義を返す。無ければnull。
  function scheduledEventFor(state) {
    return DT.DATA.SCHEDULED_EVENTS.find(e => e.turn === state.turn) || null;
  }

  // 定期イベントの効果を適用しメッセージを返す。
  // welcome=新入生歓迎会: 現在解禁済みジャンルの全技術(難易度/新奇性/操作安定度)を +gain（clamp 0-100）。
  //   未解禁ジャンル・演技構成は対象外。解禁判定は DT.contest.isGenreUnlocked を使う。
  function applyScheduled(state, event) {
    const messages = [];
    if (event.id === 'welcome') {
      const gain = DT.DATA.SCHEDULED_WELCOME_GAIN;
      const boosted = [];
      DT.DATA.GENRES.forEach(g => {
        if (!DT.contest.isGenreUnlocked(state, g.id)) return;
        DT.DATA.METHODS.forEach(m => {
          state.skills[g.id][m.id] = clamp(state.skills[g.id][m.id] + gain, 0, 100);
        });
        boosted.push(g.label);
      });
      messages.push(event.text + '（' + boosted.join('・') + ' の各技術 +' + gain + '）');
    }
    return { messages };
  }

  DT.events = { roll, applyChoice, applyHappening, scheduledEventFor, applyScheduled };
})(typeof window !== 'undefined' ? window : globalThis);
