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
  $('#btn-continue').onclick = () => { state = DT.state.load(); renderMain([]); };

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

  // onAction・大会・エンディングは Task 8 で実装
  function onAction(actionId) {
    console.log('action:', actionId);
  }

  initTitle();
})();
