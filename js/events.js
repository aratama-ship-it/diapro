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

  // 1つの技術系ステータス(difficulty/novelty/control は全ジャンルに/composition は単独)を変化させ、表示メッセージを返す
  function applyStatChange(state, id, amount) {
    if (id === 'composition') {
      state.composition = clamp(state.composition + amount, 0, 100);
    } else {
      DT.DATA.GENRES.forEach(g => {
        state.skills[g.id][id] = clamp(state.skills[g.id][id] + amount, 0, 100);
      });
    }
    const label = (id === 'composition' ? DT.DATA.COMPOSITION : DT.DATA.METHODS.find(s => s.id === id)).label;
    return label + (amount >= 0 ? ' +' : ' ') + amount;
  }

  function applyEffects(state, effects) {
    const messages = [];
    // stat=単一 / stats=複数（合宿など複数技術が同時に伸びるイベント用）
    if (effects.stat) messages.push(applyStatChange(state, effects.stat.id, effects.stat.amount));
    if (effects.stats) effects.stats.forEach(s => messages.push(applyStatChange(state, s.id, s.amount)));
    if (effects.motivation) state.motivation = clamp(state.motivation + effects.motivation, 0, 100);
    if (effects.fatigue) state.fatigue = clamp(state.fatigue + effects.fatigue, 0, 100);
    if (effects.study) state.study = clamp(state.study + effects.study, 0, 100);
    if (effects.injuryRisk) state.injuryRisk = clamp(state.injuryRisk + effects.injuryRisk, 0, 100);
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

  // 直近2大会がいずれも表彰台外（best rank>3）なら連敗中とみなす。state.resultsから算出。
  function losingStreak(state) {
    const byTurn = {};
    (state.results || []).forEach(r => {
      if (r.rank == null) return;
      byTurn[r.turn] = Math.min(byTurn[r.turn] === undefined ? 99 : byTurn[r.turn], r.rank);
    });
    const turns = Object.keys(byTurn).map(Number).sort((a, b) => a - b);
    if (turns.length < 2) return false;
    return turns.slice(-2).every(t => byTurn[t] > 3);
  }

  // 状態依存イベント: 状態条件で発火する特別イベントを返す（ランダム抽選より優先）。無ければnull。
  //   auto:true=選択肢なし（自動適用） / choicesあり=通常のイベント画面へ。once:true=一度きり(seenで管理)。
  function conditionalEventFor(state) {
    const seen = new Set(seenCharEvents(state));
    // ① 過労で倒れる（繰り返し・自己限定: 発火後fatigueが下がり条件が解ける）
    if (state.fatigue >= 90) {
      return { id: 'collapse', speaker: '⚠ 過労', auto: true,
        text: '無理がたたって練習中に倒れてしまった……！ 強制的に休養することになった。',
        effects: { fatigue: -45, motivation: -10, injuryRisk: 10 } };
    }
    // ② 絶好調で覚醒（一度きり）
    if (!seen.has('awakening') && state.motivation >= 88) {
      return { id: 'awakening', speaker: '✨ 覚醒', auto: true, once: true,
        text: '絶好調の波に乗り、無我夢中で回すうち——ずっと掴めなかった感覚が、突然しっくりきた！',
        effects: { stats: [{ id: 'novelty', amount: 4 }, { id: 'difficulty', amount: 3 }], motivation: 5 } };
    }
    // ③ 連敗中に野中コーチが励ます（一度きり・2択）
    if (!seen.has('senpai_cheer') && losingStreak(state)) {
      return { id: 'senpai_cheer', char: 'coach', speaker: '野中コーチ',
        text: '「結果が出ない時こそ、基礎に立ち返れ」肩を落とす自分に、野中コーチが声をかけてくれた。',
        choices: [
          { label: '素直に聞く', effects: { stat: { id: 'control', amount: 2 }, motivation: 8 }, result: '基礎練を見直した。焦りが少し晴れた。' },
          { label: '自分を信じる', effects: { motivation: 12 }, result: '「私は私のやり方で」不思議と前を向けた。' } ] };
    }
    return null;
  }

  // 状態依存イベント(auto)の効果を適用。once指定なら既読に記録して再発火を防ぐ。
  function applyConditional(state, event) {
    const messages = [event.text].concat(applyEffects(state, event.effects));
    if (event.once) { const seen = seenCharEvents(state); if (!seen.includes(event.id)) seen.push(event.id); }
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

  DT.events = { roll, applyChoice, applyHappening, scheduledEventFor, applyScheduled, conditionalEventFor, applyConditional };
})(typeof window !== 'undefined' ? window : globalThis);
