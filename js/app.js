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
      ...DT.DATA.STATS.map(s => statBar(s.label, c.stats[s.id])),
      statBar('学力', c.study)
    );
    show('#screen-create');
  }

  $('#btn-reroll').onclick = () => renderCreate(DT.state.newCharacter(undefined, selectedBackground));
  $('#btn-start').onclick = () => { state = candidate; DT.state.save(state); renderMain([]); };

  // --- メイン画面 ---
  function renderMain(logs) {
    const nextContest = DT.DATA.CONTESTS.find(c => c.turn >= state.turn);
    $('#main-header').textContent = DT.engine.turnLabel(state.turn) +
      (nextContest ? '｜次: ' + nextContest.name + '（' + DT.engine.turnLabel(nextContest.turn) + '）' : '');

    const bd = DT.contest.breakdown(state, 'overall');
    const expected = Math.round(Object.values(bd).reduce((a, v) => a + v, 0) * 10) / 10;
    const motiLabels = ['絶不調', '不調', '普通', '好調', '絶好調'];
    const condNodes = [
      statBar('疲労', state.fatigue),
      statBar('怪我リスク', state.injuryRisk),
      statBar('学力', state.study),
      textRow('やる気', motiLabels[state.motivation - 1]),
      textRow('予想スコア', expected + '点 / 100点'),
      textRow('ミス率（1判定あたり）', DT.contest.missRate(state) + '%')
    ];
    if (state.study < DT.DATA.STUDY_MIN) {
      condNodes.push(el('div', 'cond-warn', '⚠ 学業警告中！'));
    }
    $('#main-cond').replaceChildren(...condNodes);

    $('#main-stats').replaceChildren(
      ...DT.DATA.STATS.map(s => statBar(s.label, state.stats[s.id]))
    );

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

  function renderActions() {
    const buttons = state.injuredTurns > 0
      ? [actionButton('injured', '療養する（怪我）', true)]
      : DT.DATA.TRAININGS.map(t => actionButton(t.id, t.label))
          .concat([actionButton('study', '勉強'), actionButton('rest', '休養')]);
    $('#main-actions').replaceChildren(...buttons);
  }

  // --- ターン実行 ---
  function onAction(actionId) {
    const result = DT.engine.applyAction(state, actionId);
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      pendingMessages = result.messages;
      pendingContest = contest;
      renderEntry(contest);
      return;
    }
    finishTurn(result.messages, null);
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

  // --- エントリー選択 ---
  function renderEntry(contest) {
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

  // --- 大会結果 ---
  function renderContestResults(results) {
    $('#contest-name').textContent = results[0].name + ' 結果';
    const nodes = [];
    results.forEach((r, i) => {
      nodes.push(el('div', 'result-big', r.divisionLabel + ' ' + r.rank + '位 / ' + r.entrants + '人'));
      if (i === 0) {
        DT.DATA.STATS.forEach(s => {
          if (r.parts[s.id] !== undefined) nodes.push(textRow(s.label + '点', String(r.parts[s.id])));
        });
        nodes.push(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
        nodes.push(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
        nodes.push(textRow('特別減点', '-' + r.specialDeduction + '点'));
      }
      nodes.push(textRow('スコア', r.score + '点'));
      nodes.push(textRow('獲得ポイント', r.points + 'pt'));
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
    $('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : '卒業！';
    const nodes = [
      el('div', 'result-big', e.rank),
      el('p', 'center', e.title)
    ];
    if (e.comment) nodes.push(el('p', 'center', e.comment));
    nodes.push(textRow('通算ポイント', e.totalPoints + 'pt'));
    if (e.abilityAvg !== undefined) nodes.push(textRow('最終能力平均', String(e.abilityAvg)));
    if (state.results.length > 0) nodes.push(resultsTable(state.results));
    $('#ending-detail').replaceChildren(...nodes);
    show('#screen-ending');
  }

  $('#btn-restart').onclick = () => { DT.state.clear(); state = null; initTitle(); };

  initTitle();
})();
