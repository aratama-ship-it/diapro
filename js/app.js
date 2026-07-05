(function () {
  'use strict';
  const DT = window.DT;
  const $ = (sel) => document.querySelector(sel);

  let state = null;
  let candidate = null;
  let pendingLogs = [];

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

  $('#btn-new').onclick = () => renderCreate(DT.state.newCharacter());
  $('#btn-continue').onclick = () => { state = DT.state.load(); afterTurn([]); };

  // --- キャラ作成（ガチャポン型） ---
  function renderCreate(c) {
    candidate = c;
    $('#create-stats').replaceChildren(
      ...DT.DATA.STATS.map(s => statBar(s.label, c.stats[s.id])),
      statBar('学力', c.study)
    );
    show('#screen-create');
  }

  $('#btn-reroll').onclick = () => renderCreate(DT.state.newCharacter());
  $('#btn-start').onclick = () => { state = candidate; DT.state.save(state); renderMain([]); };

  // --- メイン画面 ---
  function renderMain(logs) {
    const nextContest = DT.DATA.CONTESTS.find(c => c.turn >= state.turn);
    $('#main-header').textContent = DT.engine.turnLabel(state.turn) +
      (nextContest ? '｜次: ' + nextContest.name + '（' + DT.engine.turnLabel(nextContest.turn) + '）' : '');

    const d = DT.contest.derived(state);
    const motiLabels = ['絶不調', '不調', '普通', '好調', '絶好調'];
    const condNodes = [
      statBar('疲労', state.fatigue),
      statBar('怪我リスク', state.injuryRisk),
      statBar('学力', state.study),
      textRow('やる気', motiLabels[state.motivation - 1]),
      textRow('難易度/表現/ミス率', d.difficulty + ' / ' + d.expression + ' / ' + d.missRate + '%')
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
    let contestResult = null;
    if (contest) contestResult = DT.contest.run(state, contest);
    const end = DT.engine.endTurn(state);
    const logs = result.messages.concat(end.events);
    DT.state.save(state);
    if (contestResult) {
      pendingLogs = logs;
      renderContest(contestResult);
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

  // --- 大会画面 ---
  function renderContest(r) {
    $('#contest-name').textContent = r.name;
    $('#contest-result').replaceChildren(
      el('div', 'result-big', r.rank + '位 / ' + r.entrants + '人'),
      textRow('スコア', String(r.score)),
      textRow('ミス', r.misses + '回'),
      textRow('獲得ポイント', r.points + 'pt')
    );
    show('#screen-contest');
  }

  $('#btn-contest-ok').onclick = () => afterTurn(pendingLogs);

  // --- エンディング ---
  function resultsTable(results) {
    const table = el('table', 'results');
    const head = el('tr');
    ['大会', '順位', 'pt'].forEach(h => head.appendChild(el('th', '', h)));
    table.appendChild(head);
    results.forEach(r => {
      const tr = el('tr');
      tr.appendChild(el('td', '', r.name));
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
