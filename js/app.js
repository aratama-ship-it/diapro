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
  let slotsUI = [null, null, null, null];
  let selectedGenre = null;
  const METHODS = [
    { id: 'difficulty', label: '高難度技' },
    { id: 'novelty',    label: '新技開発' },
    { id: 'control',    label: '反復練習' }
  ];

  function genreLabel(id) {
    const g = DT.DATA.GENRES.find(x => x.id === id);
    return g ? g.label : id;
  }

  function methodLabel(id) {
    const m = METHODS.find(x => x.id === id);
    return m ? m.label : id;
  }

  function slotChipLabel(slot) {
    if (slot === 'routine') return 'ルーチン構成';
    return genreLabel(slot.genre) + '×' + methodLabel(slot.method);
  }

  // 前月のスロット構成をプリフィル（不正なジャンル/メソッドは除外し空きに戻す）
  function prefillSlots() {
    const src = Array.isArray(state.lastSlots) ? state.lastSlots : [];
    slotsUI = [null, null, null, null];
    for (let i = 0; i < 4 && i < src.length; i++) {
      const s = src[i];
      if (s === 'routine') {
        slotsUI[i] = 'routine';
      } else if (s && DT.DATA.GENRES.some(g => g.id === s.genre) && METHODS.some(m => m.id === s.method)) {
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
      ...DT.DATA.STATS.map(s => statBar(s.label, c.stats[s.id])),
      el('div', 'section-label', 'ジャンル習熟'),
      ...DT.DATA.GENRES.map(g => statBar(g.label, c.genres[g.id])),
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
    const motiLabels = ['絶不調', '不調', '普通', '好調', '絶好調'];
    const condNodes = [
      statBar('疲労', state.fatigue),
      statBar('怪我リスク', state.injuryRisk),
      statBar('学力', state.study),
      textRow('やる気', motiLabels[state.motivation - 1]),
      textRow('予想スコア', expected + '点'),
      textRow('ミス率（1判定あたり）', DT.contest.missRate(state) + '%')
    ];
    if (state.study < DT.DATA.STUDY_MIN) {
      condNodes.push(el('div', 'cond-warn', '⚠ 学業警告中！'));
    }
    $('#main-cond').replaceChildren(...condNodes);

    $('#main-stats').replaceChildren(
      el('div', 'section-label', '技術'),
      ...DT.DATA.STATS.map(s => statBar(s.label, state.stats[s.id])),
      el('div', 'section-label', 'ジャンル習熟'),
      ...DT.DATA.GENRES.map(g => statBar(g.label, state.genres[g.id]))
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

    // (b) ジャンル選択行
    const genreRow = el('div', 'genre-row');
    DT.DATA.GENRES.forEach(g => {
      const b = el('button', g.id === selectedGenre ? 'primary' : '', g.label);
      b.onclick = () => {
        selectedGenre = (selectedGenre === g.id) ? null : g.id;
        renderActions();
      };
      genreRow.appendChild(b);
    });
    nodes.push(genreRow);

    // (c) メソッド行 + ルーチン構成
    const methodRow = el('div', 'method-row');
    METHODS.forEach(m => {
      const b = el('button', '', m.label);
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
    const result = DT.engine.applyTraining(state, slots);
    continueTurn(result.messages, 'training');
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
      const results = DT.contest.runAll(state, pendingContest, []);
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
    const max = DT.contest.maxSpecialists(state.turn);
    entrySelection = [];
    $('#entry-title').textContent = contest.name + ' エントリー';
    $('#entry-hint').textContent = '個人総合部門は必ず出場。スペシャリストはあと' + max + '部門まで掛け持ちできます（1演技ごとに疲労+' + DT.DATA.SCORING.entryFatigue + '）';
    if (state.injuredTurns > 0) {
      $('#entry-hint').textContent += '　⚠ 怪我の影響でミス率+15%！';
    }
    const rows = [];
    const fixed = el('button', '', '個人総合部門（必須）');
    fixed.disabled = true;
    rows.push(fixed);
    DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist').forEach(d => {
      const b = el('button', '', d.label);
      b.onclick = () => {
        const idx = entrySelection.indexOf(d.id);
        if (idx >= 0) {
          entrySelection.splice(idx, 1);
          b.classList.remove('primary');
        } else if (entrySelection.length < max) {
          entrySelection.push(d.id);
          b.classList.add('primary');
        }
      };
      rows.push(b);
    });
    $('#entry-divisions').replaceChildren(...rows);
    show('#screen-entry');
  }

  $('#btn-entry-go').onclick = () => {
    const results = DT.contest.runAll(state, pendingContest, entrySelection);
    finishTurn(pendingMessages, results);
  };

  const PARTS_LABELS = {
    difficulty: '難易度', variety: '多彩性', control: '操作安定度',
    novelty: '新奇性', composition: '演技構成', fundamentals: '基礎点'
  };

  // --- 大会結果 ---
  function renderContestResults(results) {
    $('#contest-name').textContent = results[0].name + ' 結果';
    const nodes = [];
    results.forEach((r, i) => {
      nodes.push(el('div', 'result-big', r.divisionLabel + ' ' + r.rank + '位 / ' + r.entrants + '人'));
      if (i === 0) {
        nodes.push(el('div', 'section-label', '内訳（素点）'));
        Object.keys(r.parts).forEach(id => {
          nodes.push(textRow((PARTS_LABELS[id] || id) + '点', String(r.parts[id])));
        });
        const rawTotal = Math.round(Object.values(r.parts).reduce((a, v) => a + v, 0) * 10) / 10;
        const scale = DT.DATA.SCORING.scale;
        const scaled = Math.round((scale.base + rawTotal * scale.mult) * 10) / 10;
        nodes.push(textRow('スケール換算', '素点 ' + rawTotal + ' → ' + scaled + '点'));
        nodes.push(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
        nodes.push(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
        nodes.push(textRow('特別減点', '-' + r.specialDeduction + '点'));
      }
      nodes.push(textRow('スコア', r.score + '点'));
      nodes.push(textRow('獲得ポイント', r.points + 'pt'));
      if (i === 0) {
        (r.rivalMessages || []).forEach(m => nodes.push(el('div', 'cond-warn', m)));
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
