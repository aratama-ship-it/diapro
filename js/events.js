(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function seenCharEvents(state) {
    if (!Array.isArray(state.seenCharEvents)) state.seenCharEvents = [];
    return state.seenCharEvents;
  }

  function eventEligible(state, event) {
    if (!event) return false;
    if (event.minTurn !== undefined && state.turn < event.minTurn) return false;
    if (event.requires && !state[event.requires]) return false;
    return true;
  }

  function pickCharEvent(state, rng) {
    const seen = new Set(seenCharEvents(state));
    const list = DT.DATA.EVENTS.charEvents;
    const event = list[Math.floor(rng() * list.length)];
    // 発生条件を満たしていない場合は空振り（通常版でイベントごとの絶対発生率を変えない）。
    if (!eventEligible(state, event)) return null;
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
      const list = DT.DATA.EVENTS.happenings.filter(event => eventEligible(state, event));
      if (!list.length) return null;
      return { kind: 'happening', event: list[Math.floor(rng() * list.length)] };
    }
    return null;
  }

  // ショート版の奇数月用。強イベントの従来確率は維持し、「何も起きない」帯を日常イベントへ置き換える。
  function rollGuaranteed(state, rng) {
    rng = rng || Math.random;
    const seen = new Set(seenCharEvents(state));
    const charEvents = DT.DATA.EVENTS.charEvents.filter(event =>
      !seen.has(event.id) && eventEligible(state, event)
    );
    const happenings = DT.DATA.EVENTS.happenings.filter(event => eventEligible(state, event));
    const quietEvents = DT.DATA.EVENTS.quietEvents;
    const probs = DT.DATA.EVENTS.probs;
    const roll = rng();
    if (charEvents.length && roll < probs.char) {
      return { kind: 'char', event: charEvents[pickIndex(charEvents.length, rng)] };
    }
    if (happenings.length && roll >= probs.char && roll < probs.char + probs.happening) {
      return { kind: 'happening', event: happenings[pickIndex(happenings.length, rng)] };
    }
    return { kind: 'quiet', event: quietEvents[pickIndex(quietEvents.length, rng)] };
  }

  // 覚醒の調整値: ハード(経歴=大学から)は強化版（DATA.AWAKEN.hard）、それ以外は標準（DATA.AWAKEN）
  function awakenConf(state) {
    return state.background === 'college' ? DT.DATA.AWAKEN.hard : DT.DATA.AWAKEN;
  }

  // 覚醒中(awakenTurns>0)は「能力値のプラスの伸び」だけ倍率(標準1.5/ハード2.0)・繰り上げ(ceil)。マイナスや0はそのまま。
  //   ※やる気/学力/体力/大会スコアは対象外（能力値の伸びのみ）。
  function awakenBoost(state, amount) {
    return (state.awakenTurns > 0 && amount > 0) ? Math.ceil(amount * awakenConf(state).mult) : amount;
  }

  // 1つの技術系ステータス(difficulty/novelty/control は全ジャンルに/composition は単独)を変化させ、表示メッセージを返す
  function applyStatChange(state, id, amount) {
    amount = awakenBoost(state, amount);
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

  const signed = n => (n >= 0 ? '+' : '') + n;

  function techniqueCard(id) {
    return (DT.DATA.TECHNIQUE_CARDS || []).find(card => card.id === id) || null;
  }

  function techniqueLabel(id) {
    const card = techniqueCard(id);
    return card ? card.label : 'なし';
  }

  // 得意技を書き換え、選択時に一度だけ発動する効果を適用する。同じ技を教わり直した場合は再発動しない。
  function activateTechnique(state, techniqueId) {
    const card = techniqueCard(techniqueId);
    if (!card) return { changed: false, messages: [] };
    const changed = state.techniqueCard !== techniqueId;
    state.techniqueCard = techniqueId;
    state.techniqueCardSelectedAt = state.turn;
    const messages = ['得意技が「' + card.label + '」になった！'];
    if (!changed) return { changed: false, messages: messages };
    (card.activationRules || []).forEach(rule => {
      if (rule.composition) {
        const before = state.composition;
        state.composition = clamp(state.composition + rule.amount, 0, 100);
        const actual = state.composition - before;
        if (actual) messages.push('演技構成 ' + signed(actual));
        return;
      }
      (rule.genres || []).forEach(genre => {
        const before = state.skills[genre][rule.method];
        state.skills[genre][rule.method] = clamp(before + rule.amount, 0, 100);
      });
      messages.push('全ジャンル×' + DT.DATA.METHODS.find(m => m.id === rule.method).label + ' ' + signed(rule.amount));
    });
    return { changed: true, messages: messages };
  }

  function trainingRuleForSlot(card, slot) {
    if (!card || slot === 'routine') return null;
    return (card.trainingRules || []).find(rule =>
      rule.method === slot.method && rule.genres.indexOf(slot.genre) >= 0
    ) || null;
  }

  // 通常の練習計算後に得意技ボーナスを加える。成功して伸びた該当枠だけが対象。
  function applyTechniqueTrainingBonus(state, trainingResult) {
    const card = techniqueCard(state.techniqueCard);
    if (!card || !trainingResult || !Array.isArray(trainingResult.results)) return [];
    let positiveApplied = false;
    let negativeApplied = false;
    const messages = [];
    trainingResult.results.forEach(entry => {
      if (entry.gain <= 0) return;
      const rule = trainingRuleForSlot(card, entry.slot);
      if (!rule) return;
      if (rule.amount > 0 && positiveApplied) return;
      if (rule.amount < 0 && negativeApplied) return;
      if (rule.amount > 0) positiveApplied = true;
      if (rule.amount < 0) negativeApplied = true;
      const cell = state.skills[entry.slot.genre];
      const before = cell[entry.slot.method];
      // マイナスは「伸びを抑える」効果。通常練習で得た量を超えて能力そのものは下げない。
      const amount = rule.amount < 0 ? Math.max(-entry.gain, rule.amount) : rule.amount;
      cell[entry.slot.method] = clamp(before + amount, 0, 100);
      const actual = cell[entry.slot.method] - before;
      if (actual) {
        messages.push('得意技「' + card.label + '」: '
          + (DT.DATA.GENRES.find(g => g.id === entry.slot.genre) || { label: entry.slot.genre }).label
          + '×' + DT.DATA.METHODS.find(m => m.id === entry.slot.method).label + ' ' + signed(actual));
      }
    });
    return messages;
  }

  function pickIndex(length, rng) {
    return Math.min(length - 1, Math.floor((rng || Math.random)() * length));
  }

  function alumniRankBonus(alumni) {
    const conf = DT.DATA.ALUMNI_EVENT;
    const rank = alumni && /^[SABCDE]$/.test(alumni.rank || '') ? alumni.rank : 'B';
    const bonus = (conf.rankBonuses && conf.rankBonuses[rank]) || { chance: 0, motivation: 0 };
    return { rank: rank, chance: bonus.chance || 0, motivation: bonus.motivation || 0 };
  }

  function alumniSuccessChance(baseChance, alumni) {
    return Math.min(1, baseChance + alumniRankBonus(alumni).chance);
  }

  function applyAlumniInspiration(state, alumni, messages) {
    const bonus = alumniRankBonus(alumni);
    const before = state.motivation;
    state.motivation = clamp(state.motivation + bonus.motivation, 0, 100);
    const actual = state.motivation - before;
    if (actual > 0) messages.push('卒業ランク' + bonus.rank + 'の言葉に背中を押された。やる気 +' + actual);
  }

  // 3年次・4年次に各1回の発生月と、同一周回で重複しない先輩2名を最初の対象月に確定する。
  function ensureAlumniState(state, rng) {
    if (!Array.isArray(state.activeAlumni) || state.activeAlumni.length === 0) {
      state.activeAlumni = (DT.DATA.DEFAULT_ALUMNI || []).map(a => Object.assign({}, a));
    }
    state.activeAlumni = state.activeAlumni.slice(0, 5);
    if (!Array.isArray(state.alumniEventsSeen)) state.alumniEventsSeen = [];
    if (state.alumniScheduleReady && Array.isArray(state.alumniSchedule)) return state.alumniSchedule;
    rng = rng || Math.random;
    const conf = DT.DATA.ALUMNI_EVENT;
    const freeEventTurn = turn => {
      const probe = Object.assign({}, state, { turn: turn, gameMode: 'short' });
      return !isOmikujiTurn(turn) && !scheduledEventFor(probe);
    };
    const thirdTurns = conf.thirdYearTurns.filter(turn => turn >= state.turn && freeEventTurn(turn));
    const fourthTurns = conf.fourthYearTurns.filter(turn => turn >= state.turn && freeEventTurn(turn));
    const roster = state.activeAlumni;
    const first = roster[pickIndex(roster.length, rng)];
    const remaining = roster.filter(a => a.id !== first.id);
    const second = remaining.length ? remaining[pickIndex(remaining.length, rng)] : first;
    const schedule = [];
    if (thirdTurns.length) schedule.push({ turn: thirdTurns[pickIndex(thirdTurns.length, rng)], alumniId: first.id });
    if (fourthTurns.length) schedule.push({ turn: fourthTurns[pickIndex(fourthTurns.length, rng)], alumniId: second.id });
    state.alumniSchedule = schedule;
    state.alumniScheduleReady = true;
    return schedule;
  }

  function alumniEventFor(state, rng) {
    if (state.gameMode !== 'short' || state.turn < 28 || state.turn > 48) return null;
    const schedule = ensureAlumniState(state, rng);
    const item = schedule.find(row => row.turn === state.turn);
    if (!item || state.alumniEventsSeen.indexOf(state.turn) >= 0) return null;
    const alumni = state.activeAlumni.find(a => a.id === item.alumniId);
    if (!alumni) return null;
    const rankBonus = alumniRankBonus(alumni);
    const teachChance = alumniSuccessChance(DT.DATA.ALUMNI_EVENT.teachChance, alumni);
    const methodChance = alumniSuccessChance(DT.DATA.ALUMNI_EVENT.methodChance, alumni);
    return {
      id: 'alumni_' + state.turn,
      kind: 'alumni',
      alumni: alumni,
      rankBonus: rankBonus,
      teachChance: teachChance,
      methodChance: methodChance,
      speaker: alumni.name + '先輩',
      text: '卒業した' + alumni.name + '先輩が、久しぶりに部の練習へ顔を出してくれた。何を教わろう？',
      choices: [
        { type: 'teach', label: '得意技「' + techniqueLabel(alumni.techniqueId) + '」を教わる（成功率' + Math.round(teachChance * 100) + '%）' },
        { type: 'sayings', label: '大会語録を聞く（必ず成功）' },
        { type: 'method', label: '練習の仕方を教わる（成功率' + Math.round(methodChance * 100) + '%）' }
      ]
    };
  }

  function markAlumniEventSeen(state) {
    if (!Array.isArray(state.alumniEventsSeen)) state.alumniEventsSeen = [];
    if (state.alumniEventsSeen.indexOf(state.turn) < 0) state.alumniEventsSeen.push(state.turn);
  }

  function applyAlumniChoice(state, event, choiceIndex, rng) {
    rng = rng || Math.random;
    const choice = event.choices[choiceIndex];
    const alumni = event.alumni;
    const messages = [];
    let succeeded = false;
    if (choice.type === 'teach') {
      if (rng() < (event.teachChance === undefined ? alumniSuccessChance(DT.DATA.ALUMNI_EVENT.teachChance, alumni) : event.teachChance)) {
        messages.push(alumni.name + '先輩の手本をつかみ、得意技を受け継いだ！');
        messages.push(...activateTechnique(state, alumni.techniqueId).messages);
        messages.push(applyStatChange(state, 'difficulty', 1));
        succeeded = true;
      } else {
        state.motivation = clamp(state.motivation + DT.DATA.ALUMNI_EVENT.teachFailMotivation, 0, 100);
        messages.push('動きの核心をつかめなかった……。今回は身につかなかった。');
        messages.push('やる気 ' + signed(DT.DATA.ALUMNI_EVENT.teachFailMotivation));
      }
    } else if (choice.type === 'sayings') {
      messages.push('「大会では、成功させる技より崩れても戻れる技を持て」先輩の言葉が残った。');
      messages.push(applyStatChange(state, 'control', 1));
      succeeded = true;
    } else if (rng() < (event.methodChance === undefined ? alumniSuccessChance(DT.DATA.ALUMNI_EVENT.methodChance, alumni) : event.methodChance)) {
      messages.push('練習の組み立て方が腑に落ち、新しい発想を演技へつなげられた！');
      messages.push(applyStatChange(state, 'novelty', 1));
      messages.push(applyStatChange(state, 'composition', 1));
      succeeded = true;
    } else {
      state.motivation = clamp(state.motivation + DT.DATA.ALUMNI_EVENT.methodFailMotivation, 0, 100);
      messages.push('教わった通りに試したが、今の自分にはうまく噛み合わなかった。');
      messages.push('やる気 ' + signed(DT.DATA.ALUMNI_EVENT.methodFailMotivation));
    }
    if (succeeded) applyAlumniInspiration(state, alumni, messages);
    markAlumniEventSeen(state);
    return { messages: messages };
  }

  // 特定ジャンルの技術だけを変化させる（例: 1DVの新奇性+3）。表示は「1DV×新奇性 +3」形式。
  function applyGenreStat(state, genre, id, amount) {
    amount = awakenBoost(state, amount);
    state.skills[genre][id] = clamp(state.skills[genre][id] + amount, 0, 100);
    const g = DT.DATA.GENRES.find(x => x.id === genre);
    const label = (g ? g.label : genre) + '×' + DT.DATA.METHODS.find(m => m.id === id).label;
    return label + ' ' + signed(amount);
  }

  function applyEffects(state, effects) {
    const messages = [];
    // stat=単一(全ジャンル) / stats=複数(全ジャンル) / genreStat=特定ジャンル1つ / genreStats=特定ジャンル複数
    if (effects.stat) messages.push(applyStatChange(state, effects.stat.id, effects.stat.amount));
    if (effects.stats) effects.stats.forEach(s => messages.push(applyStatChange(state, s.id, s.amount)));
    if (effects.genreStat) messages.push(applyGenreStat(state, effects.genreStat.genre, effects.genreStat.id, effects.genreStat.amount));
    if (effects.genreStats) effects.genreStats.forEach(s => messages.push(applyGenreStat(state, s.genre, s.id, s.amount)));
    // コンディション変化も表示（どの選択でも変化が見えるように）。怪我リスクは非表示のまま。
    if (effects.motivation) { state.motivation = clamp(state.motivation + effects.motivation, 0, 100); messages.push('やる気 ' + signed(effects.motivation)); }
    if (effects.fatigue) { state.fatigue = clamp(state.fatigue + effects.fatigue, 0, 100); messages.push('体力 ' + signed(-effects.fatigue)); } // 体力=100-疲労なので符号反転
    if (effects.study) { state.study = clamp(state.study + effects.study, 0, 100); messages.push('学力 ' + signed(effects.study)); }
    if (effects.injuryRisk) state.injuryRisk = clamp(state.injuryRisk + effects.injuryRisk, 0, 100);
    // outdoor=次の練習セッションのゲイン半減デバフ（体育館工事）。ターン数を積む
    if (effects.outdoor) state.outdoorTurns = (state.outdoorTurns || 0) + effects.outdoor;
    // flag=進行フラグを立てる（例: metSaito）。他イベントの発生条件(requires)に使う
    if (effects.flag) state[effects.flag] = true;
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

  // 覚醒の発生枠: 1〜2年生(turn1-24)で1回・3〜4年生(turn25-48)で1回。成功時のみ枠を消費する。
  // ハードは枠制限なし（noSlotLimit）＝覚醒を引き続ければSに届く「賭けルート」。
  function awakenSlotUsed(state) {
    if (awakenConf(state).noSlotLimit) return false;
    return state.turn <= 24 ? !!state.awakenUsedEarly : !!state.awakenUsedLate;
  }
  // 覚醒の持続月数を抽選: 2ヶ月20% / 3ヶ月60% / 4ヶ月20%（ハードはdurationBonusで+1）
  function rollAwakenDuration(state, rng) {
    const r = (rng || Math.random)();
    const base = r < 0.2 ? 2 : (r < 0.8 ? 3 : 4);
    return base + awakenConf(state).durationBonus;
  }
  // 覚醒成功: 持続を抽選し、該当年代の枠を消費。開始したターンは減算しない目印(awakenJustStarted)を立てる。持続月数を返す。
  function startAwakening(state, rng) {
    const dur = rollAwakenDuration(state, rng);
    state.awakenTurns = dur;
    state.awakenJustStarted = true;
    state.awakenCount = (state.awakenCount || 0) + 1; // カード「覚醒者」判定用
    if (state.turn <= 24) state.awakenUsedEarly = true; else state.awakenUsedLate = true;
    return dur;
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
    // ② 覚醒のきざし（やる気が基準以上／枠が未使用なら選択肢イベント発生。基準=標準90/ハード85）。
    //    現在すでに覚醒中(awakenTurns>0)なら発生しない。「波に乗る」で50%成功→覚醒モード、失敗でやる気-20。
    if (!(state.awakenTurns > 0) && state.motivation >= awakenConf(state).motivationLine && !awakenSlotUsed(state)) {
      return { id: 'awaken_trigger', char: 'awaken', speaker: '✨ 覚醒のきざし', awakenTrigger: true,
        text: '心と体が噛み合い、絶好調の波が高まっている——。この高ぶりに、思いきって身を委ねてみるか？',
        choices: [
          { label: '波に乗る（挑戦）', awaken: true },
          { label: '落ち着いて整える', declineMot: -5, result: '深呼吸して、いつも通りに整えた。高ぶりは静かに引いていった。' } ] };
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

  // 定期イベント（固定・非ランダム）: ショート版では練習月を避けたshortTurnを使う。
  function scheduledEventFor(state) {
    const key = state && state.gameMode === 'short' ? 'shortTurn' : 'turn';
    return DT.DATA.SCHEDULED_EVENTS.find(e => e[key] === state.turn) || null;
  }

  // 初詣おみくじ（毎年1月・全モード共通）: 今月がおみくじ月か
  function isOmikujiTurn(turn) {
    return DT.DATA.OMIKUJI.turns.indexOf(turn) >= 0;
  }
  // おみくじを引く: 確率テーブル(p合計1.0)から1つ抽選し、効果を適用して {fortune, messages} を返す。
  // 大凶=能力マイナスの大変悪いレアイベント枠。能力プラスは覚醒中ブースト(applyEffects経由)の対象。
  function drawOmikuji(state, rng) {
    rng = rng || Math.random;
    const list = DT.DATA.OMIKUJI.fortunes;
    const r = rng();
    let acc = 0;
    let fortune = list[list.length - 1];
    for (let i = 0; i < list.length; i++) {
      acc += list[i].p;
      if (r < acc) { fortune = list[i]; break; }
    }
    if (fortune.id === 'daikyo') state.daikyoDrawn = true; // カード「大凶返し」判定用
    const messages = ['⛩ おみくじ: ' + fortune.label + '　' + fortune.text].concat(applyEffects(state, fortune.effects));
    return { fortune, messages };
  }

  // ショート版の奇数月に表示するイベントを1件だけ選ぶ。
  // 固定イベント＞卒業生＞初詣＞状態イベント＞通常イベントの優先順で、後続イベントは同月に重ねない。
  function shortEventFor(state, rng) {
    if (!state || state.gameMode !== 'short' || !DT.shortMode || !DT.shortMode.isEventMonth(state.turn)) return null;
    const scheduled = scheduledEventFor(state);
    if (scheduled) return { kind: 'scheduled', event: scheduled };
    const alumni = alumniEventFor(state, rng);
    if (alumni) return { kind: 'alumni', event: alumni };
    if (isOmikujiTurn(state.turn)) return { kind: 'omikuji', event: null };
    const conditional = conditionalEventFor(state);
    if (conditional) return { kind: 'conditional', event: conditional };
    return rollGuaranteed(state, rng);
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

  DT.events = {
    roll, rollGuaranteed, applyChoice, applyHappening, scheduledEventFor, applyScheduled,
    conditionalEventFor, applyConditional, startAwakening, awakenSlotUsed, awakenConf,
    isOmikujiTurn, drawOmikuji, techniqueCard, techniqueLabel, activateTechnique,
    applyTechniqueTrainingBonus, ensureAlumniState, alumniEventFor, applyAlumniChoice,
    alumniRankBonus, alumniSuccessChance, eventEligible, shortEventFor
  };
})(typeof window !== 'undefined' ? window : globalThis);
