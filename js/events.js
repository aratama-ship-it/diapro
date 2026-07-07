(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const COACH_WEIGHT = 2;
  const DEFAULT_WEIGHT = 1;

  // コーチイベントの出現重みを2倍にする（特別指導到達率の底上げ）。
  // rng消費は帯判定1回＋この選択1回の計2回を維持するため、重み付き累積区間上を1つのrng値でスキャンする。
  function pickWeightedCharEvent(rng) {
    const list = DT.DATA.EVENTS.charEvents;
    const weight = (ev) => (ev.char === 'coach' ? COACH_WEIGHT : DEFAULT_WEIGHT);
    const totalWeight = list.reduce((sum, ev) => sum + weight(ev), 0);
    let target = rng() * totalWeight;
    for (let i = 0; i < list.length; i++) {
      target -= weight(list[i]);
      if (target < 0) return list[i];
    }
    return list[list.length - 1];
  }

  function roll(state, rng) {
    rng = rng || Math.random;
    const probs = DT.DATA.EVENTS.probs;
    const charP = probs.char;
    const happeningP = charP + probs.happening; // char判定の上に積む帯
    const r = rng();
    if (r < charP) {
      return { kind: 'char', event: pickWeightedCharEvent(rng) };
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
    return messages;
  }

  function applyChoice(state, event, choiceIndex) {
    const choice = event.choices[choiceIndex];
    const messages = [choice.result].concat(applyEffects(state, choice.effects));
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

  DT.events = { roll, applyChoice, applyHappening };
})(typeof window !== 'undefined' ? window : globalThis);
