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
