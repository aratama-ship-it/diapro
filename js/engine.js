(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const TIER_MULT = { '大成功': 2.0, '成功': 1.0, '普通': 0.5, '失敗': 0 };

  function outcomeProbs(state) {
    const mot = DT.DATA.MOTIVATION;
    const boost = (state.motivation - 50) * mot.greatCoef
      + (state.study >= DT.DATA.STUDY_BONUS ? 0.05 : 0)
      - Math.max(0, state.fatigue - 50) * 0.004;
    const great = clamp(0.10 + boost, 0.02, 0.30);
    const fail = clamp(
      0.10 + Math.max(0, state.fatigue - 50) * 0.006 - (state.motivation - 50) * mot.failCoef,
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

  // 構成専用の成長減衰（バランス修正a・2026-07-15）: カーブはDATA.SLOTS.compositionCurve（降順前提）。
  // 85以上でmult 0＝ルーチン練習では伸びない（イベントでのみ上振れ）。
  function compositionGrowthMult(value) {
    const band = DT.DATA.SLOTS.compositionCurve.find(b => value >= b.min);
    return band ? band.mult : 1.0;
  }

  function methodLabel(id) {
    return DT.DATA.METHODS.find(s => s.id === id).label;
  }

  function genreLabel(id) {
    return DT.DATA.GENRES.find(g => g.id === id).label;
  }

  // 枠の練習内容を表す表示専用ラベル（ログメッセージ用。データそのものはMETHODSのid/labelに従う）
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
      state.motivation = clamp(state.motivation + 8, 0, 100);
      messages.push('ゆっくり休んだ。疲労が回復した。' + note);
      return { tier: null, messages };
    }
    // actionId === 'study'
    const tier = rollTier(state, rng);
    const studyMult = state.gameMode === 'short' ? 2 : 1;
    const gain = Math.round(DT.DATA.STUDY.gain * TIER_MULT[tier]) * studyMult;
    state.study = clamp(state.study + gain, 0, 100);
    state.fatigue = clamp(state.fatigue + DT.DATA.STUDY.fatigue, 0, 100);
    state.didStudy = true;
    messages.push('勉強（' + tier + '）: 学力 +' + gain);
    return { tier, messages };
  }
  // Note: applyAction is now scoped to 'study'/'rest'/'injured' only (per v3 plan Task 2).
  // Training moved to applyTraining (slot-based, below).

  // 1枠分のゲインを計算する。key: method id ('difficulty'/'novelty'/'control') または 'routine'
  // baseGain: SLOTS.gridGain または SLOTS.routineGain。growthValue: growthMult計算に使う現在値（skills[genre][method] または composition）
  //
  // v5修正（2026-07-07 実プレイ報告）: 旧実装は「ベース丸め→大会補正で再丸め→練習会補正で再丸め」と
  // 段階ごとにMath.roundしていたため、baseが小さい枠（routineGain=1）や高レベル（growthMult<1）で
  // tierごとの小数差が丸めで潰れていた（例: 練習会でroutineの成功も普通もどちらも+2）。
  // 全倍率（tier×成長×大会補正×練習会補正）を掛け合わせてから最後に一度だけ丸めることで、
  // tierの差を保つ。フラット加算（特別指導・絶好調ボーナス）は丸めの後に加える。
  function computeSlotGain(state, key, baseGain, growthValue, tier) {
    let timingNote = '';
    let extraFatigue = 0;
    const tm = isContestMonth(state) ? DT.DATA.TIMING.contestMonth[key] : null;

    if (tier === '失敗') {
      // 失敗枠はゲイン0。大会月の追加疲労（例: 高難度技）とそのノートだけは反映する。
      if (tm && tm.extraFatiguePerSlot) {
        extraFatigue = tm.extraFatiguePerSlot;
        timingNote = tm.note;
      }
      return { gain: 0, timingNote, extraFatigue };
    }

    // 構成(routine)は専用の減衰カーブ。mult 0（構成85以上）は練習では伸びない:
    // 最低+1保証・特別指導/絶好調ボーナスも通さずgain 0で確定（イベントでのみ上振れする領域）。
    const growth = key === 'routine' ? compositionGrowthMult(growthValue) : growthMult(growthValue);
    if (growth === 0) {
      if (tm && tm.extraFatiguePerSlot) { extraFatigue = tm.extraFatiguePerSlot; timingNote = tm.note; }
      return { gain: 0, timingNote, extraFatigue, capped: true };
    }
    let mult = TIER_MULT[tier] * growth;
    if (tm) {
      mult *= tm.gainMult;
      timingNote = tm.note;
      if (tm.extraFatiguePerSlot) extraFatigue = tm.extraFatiguePerSlot;
    }
    if (isMeetupMonth(state.turn)) {
      const boost = DT.DATA.MEETUP.boosts[key];
      if (boost) {
        mult *= boost;
        timingNote = timingNote + DT.DATA.MEETUP.note;
      }
    }
    // 1年目(1〜12ターン)は成長が早い初期ボーナス。全倍率に乗せてから最後に一度だけ丸める。
    if (state.turn <= 12) mult *= DT.DATA.SLOTS.yearOneGrowthBonus;
    // 屋外練習デバフ（体育館工事イベント直後の練習）: このセッションのゲインを半減
    if (state.outdoorTurns > 0) mult *= DT.DATA.SLOTS.outdoorGainMult;
    let gain = Math.round(baseGain * mult);
    if (gain < 1) gain = 1; // 非失敗枠は最低+1を保証

    if (state.specialUnlocked) gain += 1;
    if (state.motivation >= DT.DATA.MOTIVATION.hotLine) gain += DT.DATA.MOTIVATION.hotBonus;
    // 覚醒中は能力の伸びを倍率(標準1.5/ハード2.0=DATA.AWAKEN)・繰り上げ(ceil)。失敗枠=gain0は上で早期return済み。
    if (state.awakenTurns > 0) {
      const aw = state.background === 'college' ? DT.DATA.AWAKEN.hard : DT.DATA.AWAKEN;
      gain = Math.ceil(gain * aw.mult);
    }
    // ショート版は行動機会が24回になるため、練習で確定した能力上昇だけを正確に2倍にする。
    // 疲労・怪我リスク・イベント効果は倍化しない。
    if (state.gameMode === 'short') gain *= 2;
    return { gain, timingNote, extraFatigue };
  }

  // 疲労は枠ごとに逐次state.fatigueへ加算する（後続枠のrollTier/growthMultは前枠の結果を反映した状態で評価される）
  // rng消費: 1枠につきrollTier用に1回のみ
  function applyTraining(state, slots, rng) {
    rng = rng || Math.random;
    state.didStudy = false;
    const messages = [];
    const results = [];
    const outdoor = state.outdoorTurns > 0; // このセッションが屋外練習デバフ中か（枠処理中は据え置き、末尾で1消費）
    const MOT = DT.DATA.MOTIVATION;
    let noveltyGreat = false; // 新技開発で大成功したか（SNS投稿イベントのトリガー）

    slots.forEach(slot => {
      const isRoutine = slot === 'routine';
      const key = isRoutine ? 'routine' : slot.method;
      let tier = rollTier(state, rng);
      // 失敗が起きるのは新技開発(novelty)のみ。高難度技/反復練習/ルーチン構成は失敗させない
      // （rng消費順は変えないよう、ロール後に判定結果だけ「普通」へ読み替える）
      if (tier === '失敗' && key !== 'novelty') tier = '普通';

      if (isRoutine) {
        const { gain, timingNote, extraFatigue, capped } = computeSlotGain(state, 'routine', DT.DATA.SLOTS.routineGain, state.composition, tier);
        state.composition = clamp(state.composition + gain, 0, 100);
        state.fatigue = clamp(state.fatigue + DT.DATA.SLOTS.fatigue.routine + extraFatigue, 0, 100);
        state.injuryRisk = clamp(state.injuryRisk + DT.DATA.SLOTS.risk.routine, 0, 100);
        if (tier === '大成功') state.motivation = clamp(state.motivation + MOT.greatBonus, 0, 100);
        if (tier === '失敗') state.motivation = clamp(state.motivation - MOT.failPenalty, 0, 100);
        results.push({ slot, tier, gain });
        if (tier === '失敗') {
          messages.push('ルーチン構成（失敗）: うまくいかず疲れだけが残った……' + timingNote);
        } else if (capped) {
          // 構成85以上: 練習では伸びない領域（イベント＝実戦とひらめきでのみ上振れ）
          messages.push('ルーチン構成（' + tier + '）: 演技構成は円熟の域（+0）…ここから先は実戦とひらめきで磨かれる' + timingNote);
        } else {
          messages.push('ルーチン構成（' + tier + '）: 演技構成 +' + gain + timingNote);
        }
      } else {
        const method = slot.method;
        const genre = slot.genre;
        const { gain, timingNote, extraFatigue } = computeSlotGain(state, method, DT.DATA.SLOTS.gridGain, state.skills[genre][method], tier);
        state.skills[genre][method] = clamp(state.skills[genre][method] + gain, 0, 100);
        state.fatigue = clamp(state.fatigue + DT.DATA.SLOTS.fatigue[method] + extraFatigue, 0, 100);
        state.injuryRisk = clamp(state.injuryRisk + DT.DATA.SLOTS.risk[method] + DT.DATA.SLOTS.genreRisk[genre], 0, 100);
        // 大成功は全種別でやる気大幅アップ。新技開発は「成功」でも高揚（新しい技を覚えた）＋大成功でSNSイベント
        if (tier === '大成功') {
          state.motivation = clamp(state.motivation + MOT.greatBonus, 0, 100);
          if (method === 'novelty') noveltyGreat = true;
        } else if (tier === '成功' && method === 'novelty') {
          state.motivation = clamp(state.motivation + MOT.noveltySuccessBonus, 0, 100);
        }
        if (tier === '失敗') state.motivation = clamp(state.motivation - MOT.failPenalty, 0, 100);
        results.push({ slot, tier, gain });
        if (tier === '失敗') {
          messages.push(genreLabel(genre) + '×' + METHOD_LABEL[method] + '（失敗）: うまくいかず疲れだけが残った……' + timingNote);
        } else {
          messages.push(genreLabel(genre) + '×' + METHOD_LABEL[method] + '（' + tier + '）: ' + methodLabel(method) + ' +' + gain + timingNote);
        }
      }
    });

    // 解禁演出（練習直後）: 今回の練習で新しく解禁されたジャンルを一度だけ告知する。
    // イベント等で先に解禁されていた分も、未告知ならここで拾われる（単調性で重複しない）。
    state.announcedUnlocks = state.announcedUnlocks || [];
    DT.contest.newlyUnlockedGenres(state).forEach(id => {
      state.announcedUnlocks.push(id);
      messages.push('🎉 ' + genreLabel(id) + 'が解禁された！新しいジャンルを練習できる。');
    });

    // 屋外練習デバフはこのセッションで1回消費（末尾で減算し、枠ごとの評価には影響させない）
    if (outdoor) {
      state.outdoorTurns -= 1;
      messages.push('（体育館工事の影響で屋外練習… 伸びが半減した）');
    }

    state.didTrain = true;
    state.lastSlots = slots.map(slot => (slot === 'routine' ? 'routine' : { genre: slot.genre, method: slot.method }));
    return { results, messages, outdoor: outdoor, noveltyGreat: noveltyGreat };
  }

  // 怪我判定は「練習した直後」に行う（大会ターンでも大会より前に解決するため）。didTrain前提。
  //   発生時はinjuredTurns=1（来月療養）＋injuredThisTurn（当ターンでは回復させない目印）。戻り値でappに通知。
  function rollInjury(state, rng) {
    rng = rng || Math.random;
    if (!state.didTrain) return { injured: false };
    if (state.fatigue >= 60) state.injuryRisk = clamp(state.injuryRisk + 5, 0, 100);
    if (rng() < state.injuryRisk / 500) {
      const staminaAtInjury = 100 - state.fatigue;
      const riskAtInjury = state.injuryRisk;
      state.injuredTurns = 1;
      state.injuredThisTurn = true;
      state.injuryRisk = 25;
      state.injuryCount = (state.injuryCount || 0) + 1; // カード「無傷の四年間」判定用
      state.motivation = clamp(state.motivation - 8, 0, 100);
      return { injured: true, message: '怪我をしてしまった！ 来月は療養が必要だ。（発生時 体力' + staminaAtInjury + '／疲労' + state.fatigue + '／怪我リスク' + riskAtInjury + '）' };
    }
    return { injured: false };
  }

  function endTurn(state, rng) {
    rng = rng || Math.random;
    const events = [];

    // やる気の平均回帰: 毎月、初期値50へreversion率で引き戻す（整数丸めで0→+5, 100→-5, 50→0）。
    // 絶好調ボーナス×成功連鎖の正のフィードバックによる0/100二極化を防ぐ減衰項
    state.motivation = clamp(state.motivation + Math.round((DT.DATA.MOTIVATION.initial - state.motivation) * DT.DATA.MOTIVATION.reversion), 0, 100);

    if (state.banTurns > 0) {
      state.banTurns -= 1;
      if (state.banTurns === 0) events.push('補習期間が終わった！');
    }

    // 覚醒状態のカウントダウン。開始したターン(awakenJustStarted)は減らさず、翌ターン以降に月を消費する。
    // 0になったターンに終了通知フラグ(awakenEndPending)を立て、ログにも残す。
    if (state.awakenTurns > 0) {
      if (state.awakenJustStarted) { state.awakenJustStarted = false; }
      else {
        state.awakenTurns -= 1;
        if (state.awakenTurns === 0) { state.awakenEndPending = true; events.push('✨ 覚醒状態が終わった。'); }
      }
    }

    if (!state.didStudy) state.study = clamp(state.study - 2, 0, 100);
    state.fatigue = clamp(state.fatigue - 5, 0, 100);

    // 怪我の回復（発生判定はrollInjuryで練習直後に済ませている）。当ターン新規発生分(injuredThisTurn)は回復させない。
    if (state.injuredTurns > 0 && !state.injuredThisTurn) {
      state.injuredTurns -= 1;
      state.fatigue = clamp(state.fatigue - 25, 0, 100);
      if (state.injuredTurns === 0) events.push('怪我が治った！');
    }
    state.injuredThisTurn = false;

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

  // やる気帯ラベル: MOTIVATION.bandsは降順(min大→小)に並んでいる前提。値以下となる最初の帯を返す
  function motivationLabel(value) {
    const band = DT.DATA.MOTIVATION.bands.find(b => value >= b.min);
    return band ? band.label : DT.DATA.MOTIVATION.bands[DT.DATA.MOTIVATION.bands.length - 1].label;
  }

  function turnLabel(turn) {
    const year = Math.ceil(turn / 12);
    const month = ((turn - 1) % 12 + 3) % 12 + 1;
    return year + '年生 ' + month + '月';
  }

  DT.engine = { outcomeProbs, rollTier, growthMult, compositionGrowthMult, applyAction, applyTraining, rollInjury, endTurn, turnLabel, isMeetupMonth, TIER_MULT, motivationLabel };
})(typeof window !== 'undefined' ? window : globalThis);
