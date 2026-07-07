(function () {
  'use strict';
  const DT = window.DT;
  const $ = (sel) => document.querySelector(sel);

  let state = null;
  let candidate = null;
  let pendingLogs = [];
  let pendingMessages = [];
  let entrySelection = [];
  let pendingContest = null;
  let selectedBackground = 'highschool';
  let pendingActionId = null;

  // --- 練習スロット選択（UI状態。null=空き、'routine'、または{genre,method}） ---
  // 枠数は DT.DATA.SLOTS.perMonth に従う（4→3等の変更に追従）
  let slotsUI = new Array(DT.DATA.SLOTS.perMonth).fill(null);
  let selectedGenre = null;
  // メソッドの練習アクション名（DT.DATA.METHODSのid/labelとは別に、練習ボタン用の表示名を持つ）
  const METHOD_ACTION_LABEL = { difficulty: '高難度技', novelty: '新技開発', control: '反復練習' };

  function genreLabel(id) {
    const g = DT.DATA.GENRES.find(x => x.id === id);
    return g ? g.label : id;
  }

  function methodLabel(id) {
    const m = DT.DATA.METHODS.find(x => x.id === id);
    return m ? m.label : id;
  }

  function methodActionLabel(id) {
    return METHOD_ACTION_LABEL[id] || id;
  }

  function slotChipLabel(slot) {
    if (slot === 'routine') return 'ルーチン構成';
    return genreLabel(slot.genre) + '×' + methodActionLabel(slot.method);
  }

  function statLabelById(id) {
    const m = DT.DATA.METHODS.find(x => x.id === id);
    return m ? m.label : id;
  }

  // 前月のスロット構成をプリフィル（不正なジャンル/メソッドは除外し空きに戻す）
  function prefillSlots() {
    const src = Array.isArray(state.lastSlots) ? state.lastSlots : [];
    slotsUI = new Array(DT.DATA.SLOTS.perMonth).fill(null);
    for (let i = 0; i < DT.DATA.SLOTS.perMonth && i < src.length; i++) {
      const s = src[i];
      if (s === 'routine') {
        slotsUI[i] = 'routine';
      } else if (s && DT.DATA.GENRES.some(g => g.id === s.genre) && DT.DATA.METHODS.some(m => m.id === s.method)) {
        slotsUI[i] = { genre: s.genre, method: s.method };
      }
    }
  }

  // --- DOMヘルパー（innerHTML不使用） ---
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function statBar(label, value) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', 'label', label));
    const bg = el('span', 'bar-bg');
    const bar = el('span', 'bar');
    bar.style.width = value + '%';
    bg.appendChild(bar);
    row.appendChild(bg);
    row.appendChild(el('span', 'val', String(value)));
    return row;
  }

  function textRow(label, value) {
    const row = el('div', 'stat-row');
    row.appendChild(el('span', 'label', label));
    row.appendChild(el('span', '', value));
    return row;
  }

  // 「技術」テーブル: 行=ジャンル(GENRES順)、列=難/新/操の数値＋ジャンル平均
  function skillTable(skills) {
    const table = el('table', 'skill-table');
    const head = el('tr');
    head.appendChild(el('th', '', 'ジャンル'));
    DT.DATA.METHODS.forEach(m => head.appendChild(el('th', '', m.label)));
    head.appendChild(el('th', '', '平均'));
    table.appendChild(head);
    DT.DATA.GENRES.forEach(g => {
      const tr = el('tr');
      tr.appendChild(el('td', '', g.label));
      DT.DATA.METHODS.forEach(m => tr.appendChild(el('td', '', String(skills[g.id][m.id]))));
      tr.appendChild(el('td', '', String(DT.contest.genreAvg({ skills: skills }, g.id))));
      table.appendChild(tr);
    });
    return table;
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  // --- タイトル ---
  function initTitle() {
    $('#btn-continue').disabled = !DT.state.load();
    show('#screen-title');
  }

  $('#btn-new').onclick = () => renderCreate(DT.state.newCharacter(undefined, selectedBackground));
  $('#btn-continue').onclick = () => { state = DT.state.load(); afterTurn([]); };

  // --- キャラ作成（ガチャポン型） ---
  function renderBackgroundButtons() {
    const buttons = DT.DATA.BACKGROUNDS.map(bg => {
      const b = el('button', bg.id === selectedBackground ? 'primary' : '', bg.label + '（' + bg.difficulty + '）');
      b.onclick = () => {
        selectedBackground = bg.id;
        renderCreate(DT.state.newCharacter(undefined, selectedBackground));
      };
      return b;
    });
    $('#create-bg').replaceChildren(...buttons);
  }

  function renderCreate(c) {
    candidate = c;
    renderBackgroundButtons();
    $('#create-stats').replaceChildren(
      el('div', 'section-label', '技術'),
      skillTable(c.skills),
      el('div', 'section-label', '演技構成'),
      statBar('演技構成', c.composition),
      el('div', 'section-label', '学力'),
      statBar('学力', c.study)
    );
    show('#screen-create');
  }

  $('#btn-reroll').onclick = () => renderCreate(DT.state.newCharacter(undefined, selectedBackground));
  $('#btn-start').onclick = () => {
    state = candidate;
    state.name = ($('#create-name').value || '').trim() || '主人公';
    DT.state.save(state);
    renderMain([]);
  };

  // --- メイン画面 ---
  function renderMain(logs) {
    const nextContest = DT.DATA.CONTESTS.find(c => c.turn >= state.turn);
    const nextWorlds = DT.DATA.WORLDS_TURNS.find(t => t >= state.turn);
    const worldsNote = (nextWorlds && DT.contest.worldsQualified(state, nextWorlds)) ? '｜世界大会出場権あり！' : '';
    const meetupNote = DT.engine.isMeetupMonth(state.turn) ? '｜' + DT.DATA.MEETUP.label : '';
    $('#main-header').textContent = DT.engine.turnLabel(state.turn) +
      (nextContest ? '｜次: ' + nextContest.name + '（' + DT.engine.turnLabel(nextContest.turn) + '）' : '') +
      worldsNote + meetupNote;

    const bd = DT.contest.breakdown(state, 'overall');
    const rawTotal = Object.values(bd).reduce((a, v) => a + v, 0);
    const scale = DT.DATA.SCORING.scale;
    const expected = Math.round((scale.base + rawTotal * scale.mult) * 10) / 10;
    const motiRow = statBar('やる気', state.motivation);
    motiRow.querySelector('.val').textContent = state.motivation + '（' + DT.engine.motivationLabel(state.motivation) + '）';
    const condNodes = [
      statBar('疲労', state.fatigue),
      statBar('怪我リスク', state.injuryRisk),
      statBar('学力', state.study),
      motiRow,
      textRow('予想スコア', expected + '点'),
      textRow('ミス率（1判定あたり）', DT.contest.missRate(state, 'overall') + '%')
    ];
    if (state.study < DT.DATA.STUDY_MIN) {
      condNodes.push(el('div', 'cond-warn', '⚠ 学業警告中！'));
    }
    if (DT.DATA.EXAMS.turns.includes(state.turn)) {
      condNodes.push(el('div', 'cond-warn', '⚠ 今月末は定期テスト！（学力' + DT.DATA.EXAMS.passLine + '以上で合格）'));
    } else if (state.banTurns > 0) {
      condNodes.push(el('div', 'cond-warn', '補習中！練習禁止（残り' + state.banTurns + 'ヶ月）'));
    }
    const nextUnlock = DT.contest.nextUnlockTarget(state);
    if (nextUnlock) {
      condNodes.push(textRow('次の解禁',
        genreLabel(nextUnlock.id) + '（' + genreLabel(nextUnlock.reqGenre) + 'の習熟あと' + nextUnlock.remaining + '）'));
    }
    $('#main-cond').replaceChildren(...condNodes);

    $('#main-stats').replaceChildren(
      el('div', 'section-label', '技術'),
      skillTable(state.skills),
      el('div', 'section-label', '演技構成'),
      statBar('演技構成', state.composition)
    );

    if (state.injuredTurns <= 0) {
      prefillSlots();
      selectedGenre = null;
    }
    renderActions();

    if (logs.length > 0) {
      $('#main-log').replaceChildren(...logs.map(l => el('div', '', l)));
    } else {
      $('#main-log').replaceChildren(el('div', '', 'どうする？'));
    }
    show('#screen-main');
  }

  function actionButton(id, label, span2) {
    const b = el('button', '', label);
    if (span2) b.style.gridColumn = 'span 2';
    b.onclick = () => onAction(id);
    return b;
  }

  // 空きスロットのインデックス（無ければ-1）
  function firstEmptySlot() {
    return slotsUI.indexOf(null);
  }

  function addSlotEntry(entry) {
    const idx = firstEmptySlot();
    if (idx < 0) return;
    slotsUI[idx] = entry;
    renderActions();
  }

  function removeSlotEntry(idx) {
    slotsUI[idx] = null;
    renderActions();
  }

  function renderActions() {
    if (state.injuredTurns > 0) {
      $('#main-actions').replaceChildren(actionButton('injured', '療養する（怪我）', true));
      return;
    }

    if (state.banTurns > 0) {
      const studyRestRow = el('div', 'method-row');
      studyRestRow.appendChild(actionButton('study', '勉強'));
      studyRestRow.appendChild(actionButton('rest', '休養'));
      $('#main-actions').replaceChildren(
        el('div', 'cond-warn', '補習中！練習禁止（残り' + state.banTurns + 'ヶ月）'),
        studyRestRow
      );
      return;
    }

    const nodes = [];

    // (a) スロットチップ行
    const slotRow = el('div', 'slot-row');
    slotsUI.forEach((slot, idx) => {
      const chip = el('button', slot ? 'slot-chip filled' : 'slot-chip empty', slot ? slotChipLabel(slot) + ' ×' : '＋');
      if (slot) {
        chip.onclick = () => removeSlotEntry(idx);
      } else {
        chip.disabled = true;
      }
      slotRow.appendChild(chip);
    });
    nodes.push(slotRow);

    // (b) ジャンル選択行（未解禁ジャンルはロック表示・選択不可）
    const genreRow = el('div', 'genre-row');
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const b = el('button', g.id === selectedGenre ? 'primary' : '', unlocked ? g.label : '🔒 ' + g.label);
      if (!unlocked) {
        const req = DT.DATA.SKILL_TREE[g.id].requires;
        b.disabled = true;
        b.title = genreLabel(req.genre) + 'の習熟' + req.threshold + '超で解禁';
      } else {
        b.onclick = () => {
          selectedGenre = (selectedGenre === g.id) ? null : g.id;
          renderActions();
        };
      }
      genreRow.appendChild(b);
    });
    nodes.push(genreRow);

    // (c) メソッド行 + ルーチン構成
    const methodRow = el('div', 'method-row');
    DT.DATA.METHODS.forEach(m => {
      const b = el('button', '', methodActionLabel(m.id));
      b.disabled = !selectedGenre || firstEmptySlot() < 0;
      b.onclick = () => {
        if (!selectedGenre) return;
        addSlotEntry({ genre: selectedGenre, method: m.id });
      };
      methodRow.appendChild(b);
    });
    const routineBtn = el('button', '', 'ルーチン構成');
    routineBtn.disabled = firstEmptySlot() < 0;
    routineBtn.onclick = () => addSlotEntry('routine');
    methodRow.appendChild(routineBtn);
    nodes.push(methodRow);

    // (d) この内容で練習する
    const submitBtn = el('button', 'primary', 'この内容で練習する');
    submitBtn.disabled = slotsUI.some(s => s === null);
    submitBtn.onclick = () => onTrainingSubmit();
    nodes.push(submitBtn);

    // (e) 勉強・休養
    const studyRestRow = el('div', 'method-row');
    studyRestRow.appendChild(actionButton('study', '勉強'));
    studyRestRow.appendChild(actionButton('rest', '休養'));
    nodes.push(studyRestRow);

    $('#main-actions').replaceChildren(...nodes);
  }

  function onTrainingSubmit() {
    const slots = slotsUI.map(s => (s === 'routine' ? 'routine' : { genre: s.genre, method: s.method }));
    const tr = DT.engine.applyTraining(state, slots);
    renderTrainingResult(tr);
  }

  // --- 練習結果画面 ---
  function trainingRowGainText(r) {
    if (r.tier === '失敗') return 'ゼロ';
    if (r.slot === 'routine') {
      return '+' + r.gain + ' 演技構成';
    }
    return '+' + r.gain + ' ' + genreLabel(r.slot.genre) + '×' + statLabelById(r.slot.method);
  }

  function renderTrainingResult(tr) {
    const rows = tr.results.map(r => {
      const row = el('div', 'stat-row');
      row.appendChild(el('span', 'label', slotChipLabel(r.slot)));
      row.appendChild(el('span', r.tier === '失敗' ? 'cond-warn' : '', r.tier));
      row.appendChild(el('span', '', trainingRowGainText(r)));
      return row;
    });
    $('#training-slots').replaceChildren(...rows);

    // 集計: マス(genre×method)/compositionごとの合計デルタ（0は表示しない）
    const cellTotals = {};
    let compositionTotal = 0;
    tr.results.forEach(r => {
      if (r.tier === '失敗') return;
      if (r.slot === 'routine') {
        compositionTotal += r.gain;
      } else {
        const key = r.slot.genre + '.' + r.slot.method;
        cellTotals[key] = (cellTotals[key] || 0) + r.gain;
      }
    });
    const summaryNodes = [];
    Object.keys(cellTotals).forEach(key => {
      if (cellTotals[key] === 0) return;
      const [genre, method] = key.split('.');
      summaryNodes.push(textRow(genreLabel(genre) + '×' + statLabelById(method), '+' + cellTotals[key]));
    });
    if (compositionTotal !== 0) summaryNodes.push(textRow('演技構成', '+' + compositionTotal));
    $('#training-summary').replaceChildren(...summaryNodes);

    $('#btn-training-ok').onclick = () => continueTurn(['練習を終えた。'], 'training');
    show('#screen-training');
  }

  // --- ターン実行 ---
  function proceedWithEvents(messages) {
    const ev = DT.events.roll(state);
    if (ev && ev.kind === 'char') {
      pendingMessages = messages;
      renderEvent(ev.event);
      return;
    }
    if (ev) {
      const h = DT.events.applyHappening(state, ev.event);
      finishTurn(messages.concat(h.messages), null);
      return;
    }
    finishTurn(messages, null);
  }

  function onAction(actionId) {
    const result = DT.engine.applyAction(state, actionId);
    continueTurn(result.messages, actionId);
  }

  // actionId: 'study' | 'rest' | 'injured' | 'training'（大会/世界大会エントリー分岐は共通）
  function continueTurn(messages, actionId) {
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      pendingMessages = messages;
      pendingContest = contest;
      renderEntry(contest);
      return;
    }
    const wc = DT.contest.worldsContestForTurn(state.turn);
    if (wc && DT.contest.worldsQualified(state, state.turn)) {
      pendingMessages = messages;
      pendingContest = wc;
      pendingActionId = actionId;
      renderWorldsEntry(wc);
      return;
    }
    if (actionId !== 'injured') {
      proceedWithEvents(messages);
      return;
    }
    finishTurn(messages, null);
  }

  function renderEvent(event) {
    const chara = DT.DATA.CHARACTERS.find(c => c.id === event.char);
    $('#event-char').textContent = chara.name;
    $('#event-text').replaceChildren(el('p', '', event.text));
    const buttons = event.choices.map((c, i) => {
      const b = el('button', i === 0 ? 'primary' : '', c.label);
      b.onclick = () => {
        const r = DT.events.applyChoice(state, event, i);
        finishTurn(pendingMessages.concat(r.messages), null);
      };
      return b;
    });
    $('#event-choices').replaceChildren(...buttons);
    show('#screen-event');
  }

  function finishTurn(messages, contestResults) {
    const end = DT.engine.endTurn(state);
    const logs = messages.concat(end.events);
    DT.state.save(state);
    pendingContest = null;
    pendingMessages = [];
    if (contestResults) {
      pendingLogs = logs;
      renderContestResults(contestResults);
      return;
    }
    afterTurn(logs);
  }

  function afterTurn(logs) {
    if (state.status !== 'playing') {
      renderEnding();
      return;
    }
    renderMain(logs);
  }

  // --- 世界大会出場選択 ---
  function renderWorldsEntry(wc) {
    $('#entry-title').textContent = wc.name + ' 出場権獲得！';
    $('#entry-hint').textContent = '直近1年の優勝実績により出場できます。相手は世界トップレベル（王者・魁人も出場）。';
    if (state.injuredTurns > 0) {
      $('#entry-hint').textContent += '　⚠ 怪我の影響でミス率+15%！';
    }
    const enter = el('button', 'primary', '出場する');
    enter.onclick = () => {
      const results = DT.contest.runAll(state, pendingContest, ['overall']);
      finishTurn(pendingMessages, results);
    };
    const skip = el('button', '', '見送る');
    skip.onclick = () => {
      if (pendingActionId !== 'injured') {
        proceedWithEvents(pendingMessages);
      } else {
        finishTurn(pendingMessages, null);
      }
    };
    $('#entry-divisions').replaceChildren(enter, skip);
    $('#btn-entry-go').classList.add('hidden');
    show('#screen-entry');
  }

  // --- エントリー選択 ---
  function renderEntry(contest) {
    $('#btn-entry-go').classList.remove('hidden');
    const max = DT.contest.maxEntries(state.turn);
    entrySelection = [];
    $('#entry-title').textContent = contest.name + ' エントリー';
    $('#entry-hint').textContent = 'エントリー枠: ' + max + '部門まで（総合は配点が高い）';
    if (state.injuredTurns > 0) {
      $('#entry-hint').textContent += '　⚠ 怪我の影響でミス率+15%！';
    }
    const rows = [];
    const emptyHint = el('div', 'cond-warn', '最低1部門を選択してください');
    DT.DATA.DIVISIONS.forEach(d => {
      // スペシャリスト部門は該当ジャンルが未解禁なら出場不可（総合は常に出場可）
      if (d.scoring === 'specialist' && !DT.contest.isGenreUnlocked(state, d.id)) return;
      const label = d.id === 'overall' ? '個人総合部門' : d.label;
      const b = el('button', '', label);
      b.onclick = () => {
        const idx = entrySelection.indexOf(d.id);
        if (idx >= 0) {
          entrySelection.splice(idx, 1);
          b.classList.remove('primary');
        } else if (entrySelection.length < max) {
          entrySelection.push(d.id);
          b.classList.add('primary');
        }
        emptyHint.classList.toggle('hidden', entrySelection.length > 0);
      };
      rows.push(b);
    });
    emptyHint.classList.toggle('hidden', entrySelection.length > 0);
    rows.push(emptyHint);
    $('#entry-divisions').replaceChildren(...rows);
    show('#screen-entry');
  }

  $('#btn-entry-go').onclick = () => {
    if (entrySelection.length === 0) return;
    const results = DT.contest.runAll(state, pendingContest, entrySelection);
    finishTurn(pendingMessages, results);
  };

  const PARTS_LABELS = {
    difficulty: '難易度', variety: '多彩性', control: '操作安定度',
    novelty: '新奇性', composition: '演技構成', fundamentals: '基礎'
  };

  // 順位表ミニテーブル（順位/名前/スコア）。自分の行を強調
  function standingsTable(standings) {
    const table = el('table', 'results');
    const head = el('tr');
    ['順位', '名前', 'スコア'].forEach(h => head.appendChild(el('th', '', h)));
    table.appendChild(head);
    standings.forEach(s => {
      const tr = el('tr', s.isPlayer ? 'me-row' : '');
      tr.appendChild(el('td', '', s.rank + '位'));
      tr.appendChild(el('td', '', s.name + (s.isPlayer ? '（あなた）' : '')));
      tr.appendChild(el('td', '', String(s.score)));
      table.appendChild(tr);
    });
    return table;
  }

  // --- 大会結果 ---
  function renderContestResults(results) {
    $('#contest-name').textContent = results[0].name + ' 結果';
    const nodes = [];
    results.forEach((r) => {
      const isOverall = r.division === 'overall';
      nodes.push(el('div', 'result-big', r.divisionLabel + ' ' + r.rank + '位 / ' + r.entrants + '人'));
      nodes.push(el('div', 'section-label', '内訳（素点）'));
      const div = DT.DATA.DIVISIONS.find(d => d.id === r.division);
      const weights = DT.DATA.SCORING[div.scoring].weights;
      const maxFor = (key) => key === 'fundamentals'
        ? DT.DATA.SCORING.base.elements * DT.DATA.SCORING.base.perElement
        : weights[key];
      Object.keys(r.parts).forEach(id => {
        const value = r.parts[id];
        const max = maxFor(id);
        nodes.push(textRow((PARTS_LABELS[id] || id) + '点', String(value) + '/' + max));
      });
      const scale = DT.DATA.SCORING.scale;
      const scaled = Math.round((scale.base + r.rawTotal * scale.mult) * 10) / 10;
      nodes.push(textRow('スケール換算', '素点 ' + r.rawTotal + ' → ' + scaled + '点'));
      nodes.push(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
      nodes.push(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
      nodes.push(textRow('特別減点', '-' + r.specialDeduction + '点'));
      nodes.push(textRow('スコア', r.score + '点'));
      nodes.push(textRow('獲得ポイント', r.points + 'pt'));
      if (isOverall) {
        (r.rivalMessages || []).forEach(m => nodes.push(el('div', 'cond-warn', m)));
      }
      if (Array.isArray(r.standings) && r.standings.length > 0) {
        nodes.push(el('div', 'section-label', '順位表'));
        nodes.push(standingsTable(r.standings));
      }
    });
    $('#contest-result').replaceChildren(...nodes);
    show('#screen-contest');
  }

  $('#btn-contest-ok').onclick = () => afterTurn(pendingLogs);

  // --- エンディング ---
  function resultsTable(results) {
    const table = el('table', 'results');
    const head = el('tr');
    ['部門', '順位', 'pt'].forEach(h => head.appendChild(el('th', '', h)));
    table.appendChild(head);
    let lastName = null;
    results.forEach(r => {
      if (r.name !== lastName) {
        lastName = r.name;
        const group = el('tr');
        const th = el('th', '', r.name);
        th.colSpan = 3;
        group.appendChild(th);
        table.appendChild(group);
      }
      const tr = el('tr');
      tr.appendChild(el('td', '', r.divisionLabel));
      tr.appendChild(el('td', '', r.rank + '位'));
      tr.appendChild(el('td', '', r.points + 'pt'));
      table.appendChild(tr);
    });
    return table;
  }

  function renderEnding() {
    const e = DT.ending.evaluate(state);
    $('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : state.name + '、卒業！';
    const nodes = [
      el('div', 'result-big', e.rank),
      el('p', 'center', e.title)
    ];
    if (e.comment) nodes.push(el('p', 'center', e.comment));
    nodes.push(textRow('通算ポイント', e.totalPoints + 'pt'));
    if (e.abilityAvg !== undefined) nodes.push(textRow('最終能力平均', String(e.abilityAvg)));
    if (state.results.length > 0) nodes.push(resultsTable(state.results));
    DT.DATA.RIVALS.forEach(rv => {
      const rec = state.rivalRecord[rv.id];
      nodes.push(textRow(rv.name + '戦', rec.win + '勝' + rec.lose + '敗'));
    });
    $('#ending-detail').replaceChildren(...nodes);
    show('#screen-ending');
  }

  $('#btn-restart').onclick = () => { DT.state.clear(); state = null; initTitle(); };

  initTitle();
})();
