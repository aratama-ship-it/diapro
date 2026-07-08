(function () {
  'use strict';
  const DT = window.DT;
  const $ = (sel) => document.querySelector(sel);

  // 開発用表示（DEV PARAMSパネル・大会の不振理由）は URLに ?dev を付けたときだけ表示。
  // テスターには見えないようにするための切り替え。バージョンはタイトル画面に表示。
  const APP_VERSION = 'v0.9 test1';
  const DEV = new URLSearchParams(window.location.search).has('dev');
  if (DEV) document.documentElement.classList.add('dev');

  let state = null;
  let candidate = null;
  let pendingLogs = [];
  let pendingMessages = [];
  let entrySelection = [];
  let pendingContest = null;
  let selectedBackground = 'highschool';
  let pendingActionId = null;
  let pendingScheduledPopup = null;

  // --- 練習スロット選択（UI状態。null=空き、'routine'、または{genre,method}） ---
  let slotsUI = new Array(DT.DATA.SLOTS.perMonth).fill(null);
  let selectedGenre = null;
  const METHOD_ACTION_LABEL = { difficulty: '高難度技', novelty: '新技開発', control: '反復練習' };
  const MOOD_EMOJI = { '絶好調': '🤩', '好調': '😊', '普通': '🙂', '不調': '😟', '絶不調': '😫' };
  const CONTEST_DESC = { oidc: '大阪国際ディアボロコンテスト', ajdc: '全日本選手権（頂点）', worlds: '世界の頂点', shizuoka: '静岡ディアボロコンテスト' };
  // 現在ターン以降で最も近い大会（CONTESTSは順不同のため最小turnを取る）
  function nextContestFrom(turn) {
    return DT.DATA.CONTESTS.filter(c => c.turn >= turn).sort((a, b) => a.turn - b.turn)[0] || null;
  }

  // ---- ラベルヘルパー ----
  function genreLabel(id) {
    const g = DT.DATA.GENRES.find(x => x.id === id);
    return g ? g.label : id;
  }
  function methodActionLabel(id) { return METHOD_ACTION_LABEL[id] || id; }
  function statLabelById(id) {
    const m = DT.DATA.METHODS.find(x => x.id === id);
    return m ? m.label : id;
  }
  function slotChipLabel(slot) {
    if (slot === 'routine') return 'ルーチン構成';
    return genreLabel(slot.genre) + '×' + methodActionLabel(slot.method);
  }
  function totalPoints() {
    return state.results.reduce((a, r) => a + r.points, 0);
  }

  // --- DOMヘルパー（innerHTML不使用） ---
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function svgEl(tag, attrs, children) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(k => n.setAttribute(k, attrs[k]));
    if (children) children.forEach(c => n.appendChild(c));
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

  // メーター行（label / gauge / value）。warnで疲労系の赤グラデ
  function meterRow(label, value, opts) {
    opts = opts || {};
    const row = el('div', 'meter');
    row.appendChild(el('span', 'm-label', label));
    const gauge = el('div', 'gauge' + (opts.warn ? ' warn' : ''));
    const fill = el('span');
    fill.style.width = Math.max(0, Math.min(100, value)) + '%';
    gauge.appendChild(fill);
    row.appendChild(gauge);
    const val = el('span', 'm-val num', opts.valText !== undefined ? opts.valText : String(value));
    row.appendChild(val);
    return row;
  }

  // 1ジャンル分の三角レーダーカード
  function genreRadar(genreId, cell, unlocked) {
    const CX = 50, CY = 52, R = 40;
    const rp = (v, a) => DT.radar.radarPoint(v, a, CX, CY, R);
    const ptStr = pts => pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const svg = svgEl('svg', { viewBox: '0 0 100 100', class: 'radar-svg' });

    const wm = svgEl('text', {
      x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#ffd166', 'fill-opacity': '0.18', 'font-size': '40', 'font-weight': 'bold'
    });
    wm.textContent = genreLabel(genreId);
    svg.appendChild(wm);

    [100, 75, 50, 25].forEach(level => {
      const ring = [rp(level, 0), rp(level, 1), rp(level, 2)];
      svg.appendChild(svgEl('polygon', { points: ptStr(ring), fill: 'none', stroke: '#d8ddf0', 'stroke-width': '0.8' }));
    });
    [0, 1, 2].forEach(a => {
      const o = rp(100, a);
      svg.appendChild(svgEl('line', { x1: CX, y1: CY, x2: o.x.toFixed(1), y2: o.y.toFixed(1), stroke: '#e2e6f3', 'stroke-width': '0.6' }));
    });
    if (unlocked) {
      const vpts = [rp(cell.difficulty, 0), rp(cell.novelty, 1), rp(cell.control, 2)];
      svg.appendChild(svgEl('polygon', { points: ptStr(vpts), fill: 'rgba(46,196,182,0.42)', stroke: '#2ec4b6', 'stroke-width': '1.6' }));
      vpts.forEach(p => svg.appendChild(svgEl('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: '1.6', fill: '#2ec4b6' })));
    }
    const labelOffset = [[0, -3], [0, 9], [0, 9]];
    [['難', 0], ['新', 1], ['操', 2]].forEach(function (lv) {
      const o = rp(100, lv[1]);
      const t = svgEl('text', {
        x: (o.x + labelOffset[lv[1]][0]).toFixed(1), y: (o.y + labelOffset[lv[1]][1]).toFixed(1),
        'text-anchor': 'middle', fill: '#6b7aa8', 'font-size': '8', 'font-weight': 'bold'
      });
      t.textContent = lv[0];
      svg.appendChild(t);
    });
    if (!unlocked) {
      const t = svgEl('text', { x: CX, y: CY + 4, 'text-anchor': 'middle', 'font-size': '13' });
      t.textContent = '🔒';
      svg.appendChild(t);
    }
    const card = el('div', 'radar-card');
    card.appendChild(svg);
    return card;
  }

  function skillRadarGrid(skills) {
    const grid = el('div', 'radar-grid');
    DT.DATA.GENRES.forEach(function (g) {
      const unlocked = DT.contest.isGenreUnlocked({ skills: skills }, g.id);
      grid.appendChild(genreRadar(g.id, skills[g.id], unlocked));
    });
    return grid;
  }

  function skillTable(skills) {
    const table = el('table', 'skill-table');
    const head = el('tr');
    head.appendChild(el('th', '', 'ジャンル'));
    DT.DATA.METHODS.forEach(m => head.appendChild(el('th', '', m.label)));
    head.appendChild(el('th', '', '平均'));
    table.appendChild(head);
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked({ skills: skills }, g.id);
      const tr = el('tr');
      tr.appendChild(el('td', '', unlocked ? g.label : '🔒 ' + g.label));
      DT.DATA.METHODS.forEach(m => tr.appendChild(el('td', '', unlocked ? String(skills[g.id][m.id]) : '-')));
      tr.appendChild(el('td', '', unlocked ? String(DT.contest.genreAvg({ skills: skills }, g.id)) : '-'));
      table.appendChild(tr);
    });
    return table;
  }

  // --- 画面切替（＋ボトムナビの表示/アクティブ制御・開発パネル更新） ---
  const NAV_OF = { '#screen-home': 'home', '#screen-detail': 'detail' };
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    const navKey = NAV_OF[id];
    $('#bottom-nav').classList.toggle('hidden', !navKey);
    $('#nav-home').classList.toggle('active', navKey === 'home');
    $('#nav-detail').classList.toggle('active', navKey === 'detail');
    updateDevPanel();
  }

  // --- タイトル ---
  function initTitle() {
    $('#btn-continue').disabled = !DT.state.load();
    $('#app-version').textContent = APP_VERSION + (DEV ? '（DEV表示ON）' : '');
    show('#screen-title');
  }

  $('#btn-new').onclick = () => renderCreate(DT.state.newCharacter(undefined, selectedBackground));
  $('#btn-continue').onclick = () => { state = DT.state.load(); afterTurn([]); };

  // --- キャラ作成 ---
  function renderBackgroundButtons() {
    const sel = $('#create-bg');
    sel.replaceChildren(...DT.DATA.BACKGROUNDS.map(bg => {
      const o = el('option', '', bg.label + '（' + bg.difficulty + '）');
      o.value = bg.id;
      if (bg.id === selectedBackground) o.selected = true;
      return o;
    }));
    // 経歴を変えると難易度が変わるので選手を引き直す（旧ボタンUIと同じ挙動）
    sel.onchange = () => {
      selectedBackground = sel.value;
      renderCreate(DT.state.newCharacter(undefined, selectedBackground));
    };
  }

  function renderCreate(c) {
    candidate = c;
    renderBackgroundButtons();
    $('#create-stats').replaceChildren(
      el('div', 'section-label', '能力値'),
      skillTable(c.skills),
      skillRadarGrid(c.skills),
      statBar('演技構成', c.composition),
      statBar('学力', c.study)
    );
    show('#screen-create');
  }

  $('#btn-reroll').onclick = () => renderCreate(DT.state.newCharacter(undefined, selectedBackground));
  $('#btn-start').onclick = () => {
    state = candidate;
    state.name = ($('#create-name').value || '').trim() || '主人公';
    DT.state.save(state);
    renderHome([]);
  };

  // --- ホーム ---
  function renderHome(logs) {
    // 学年ごとにホーム背景色を変える（1〜4年生で識別しやすく）
    const yr = Math.min(4, Math.max(1, Math.ceil(state.turn / 12)));
    const homeEl = $('#screen-home');
    homeEl.classList.remove('year-1', 'year-2', 'year-3', 'year-4');
    homeEl.classList.add('year-' + yr);

    // ターン帯
    const banner = $('#home-turn');
    const left = el('div');
    left.appendChild(el('div', 'turn-sub', 'TURN ' + state.turn + ' / ' + DT.DATA.TOTAL_TURNS));
    left.appendChild(el('div', 'turn-label', DT.engine.turnLabel(state.turn) + '・' + state.name));
    const pt = el('span', 'pt num', totalPoints() + 'pt');
    pt.setAttribute('role', 'button');
    pt.title = 'タップでポイント履歴';
    pt.onclick = openPoints;
    banner.replaceChildren(left, pt);

    renderHomeContest();
    renderHomeCond();
    renderHomeStatus();

    // 毎月スロットは空にリセット（前月構成の引き継ぎはしない）。怪我中はルーチン構成のみ1枠
    slotsUI = state.injuredTurns > 0 ? [null] : new Array(DT.DATA.SLOTS.perMonth).fill(null);
    selectedGenre = null;
    renderHomeActions();

    const log = $('#home-log');
    if (logs && logs.length > 0) {
      log.classList.add('multi');
      log.replaceChildren(...logs.map(l => el('div', '', l)));
    } else {
      log.classList.remove('multi');
      log.replaceChildren(el('div', '', '💬 今月はどうする？'));
    }
    show('#screen-home');
  }

  function renderHomeContest() {
    const box = $('#home-contest');
    const events = futureEvents();
    const nextContest = events.find(e => e.cls === 'contest');
    const nextOther = events.find(e => e.cls !== 'contest');
    const rows = [];
    if (nextContest) rows.push(nextContest);
    if (nextOther) rows.push(nextOther);
    box.replaceChildren(...(rows.length ? [nextEventsBox(rows)] : []));
  }

  // 次のイベント枠: 大会＋大会以外の固定イベントを1つの囲みに縦並びで表示。タップで予定一覧を開く
  function nextEventsBox(events) {
    const box = el('div', 'next-events');
    box.setAttribute('role', 'button');
    box.title = 'タップで予定一覧';
    box.onclick = openSchedule;
    const head = el('div', 'ne-head');
    head.appendChild(el('span', 'ne-title', '次のイベント'));
    head.appendChild(el('span', 'ne-hint', 'タップで予定一覧 ▸'));
    box.appendChild(head);
    events.forEach(e => {
      const row = el('div', 'ne-row ' + e.cls);
      row.appendChild(el('span', 'ne-icon', e.icon));
      row.appendChild(el('span', 'ne-name', e.name));
      const away = e.turn - state.turn;
      row.appendChild(el('span', 'ne-count', away === 0 ? '今月' : 'あと' + away + 'ヶ月'));
      box.appendChild(row);
    });
    return box;
  }

  // 今後の予定（大会・世界大会・定期テスト・練習会）を現在ターン以降で列挙
  function futureEvents() {
    const out = [];
    const nextContestTurn = (nextContestFrom(state.turn) || {}).turn;
    for (let t = state.turn; t <= DT.DATA.TOTAL_TURNS; t++) {
      const c = DT.DATA.CONTESTS.find(x => x.turn === t);
      if (c) out.push({ turn: t, icon: '🏆', name: c.name, sub: CONTEST_DESC[c.type] || '大会', cls: 'contest', isNext: t === nextContestTurn });
      const w = DT.contest.worldsContestForTurn(t);
      if (w) out.push({ turn: t, icon: '🌍', name: w.name, sub: '前年に優勝で出場権', cls: 'worlds', isNext: false });
      if (DT.DATA.EXAMS.turns.includes(t)) out.push({ turn: t, icon: '📝', name: '定期テスト', sub: '学力' + DT.DATA.EXAMS.passLine + '未満で補習2ヶ月', cls: 'exam', isNext: false });
      if (DT.DATA.JJF.qualifierTurns.includes(t)) out.push({ turn: t, icon: '🤹', name: 'JJF予選', sub: '参加は任意・バランス総合力で突破', cls: 'jjf', isNext: false });
      if (DT.DATA.JJF.finalTurns.includes(t)) out.push({ turn: t, icon: '🏅', name: 'JJF決勝', sub: '予選突破者のみ・10人で争う', cls: 'jjf', isNext: false });
      if (DT.engine.isMeetupMonth(t)) out.push({ turn: t, icon: '🤝', name: '練習会', sub: 'ルーチン構成・新技が伸びやすい', cls: 'meetup', isNext: false });
    }
    return out;
  }

  function openSchedule() {
    const rows = futureEvents().map(e => {
      const row = el('div', 'event-row ' + e.cls + (e.isNext ? ' next' : ''));
      row.appendChild(el('span', 'event-icon', e.icon));
      const meta = el('div', 'event-meta');
      const away = e.turn - state.turn;
      meta.appendChild(el('div', 'event-when', DT.engine.turnLabel(e.turn) + '（' + (away === 0 ? '今月' : 'あと' + away + 'ヶ月') + '）'));
      meta.appendChild(el('div', 'event-name', (e.isNext ? '🔥 ' : '') + e.name));
      meta.appendChild(el('div', 'event-sub', e.sub));
      row.appendChild(meta);
      if (e.isNext) row.appendChild(el('span', 'event-badge', '次'));
      return row;
    });
    if (rows.length === 0) rows.push(el('div', 'dev-note', '今後の予定はありません。'));
    $('#schedule-list').replaceChildren(...rows);
    $('#schedule-modal').classList.remove('hidden');
  }
  function closeSchedule() { $('#schedule-modal').classList.add('hidden'); }

  // ポイント履歴（大会での獲得記録）モーダル
  function openPoints() {
    const rows = [];
    if (!state.results || state.results.length === 0) {
      rows.push(el('div', 'dev-note', 'まだ大会でのポイント獲得はありません。'));
    } else {
      state.results.slice().reverse().forEach(r => {
        const row = el('div', 'event-row');
        row.appendChild(el('span', 'event-icon', r.type === 'worlds' ? '🌍' : '🏆'));
        const meta = el('div', 'event-meta');
        meta.appendChild(el('div', 'event-when', DT.engine.turnLabel(r.turn) + '・' + r.name));
        meta.appendChild(el('div', 'event-name', r.divisionLabel + '　' + r.rank + '位'));
        row.appendChild(meta);
        row.appendChild(el('span', 'event-badge', '+' + r.points + 'pt'));
        rows.push(row);
      });
    }
    $('#points-total').textContent = '通算 ' + totalPoints() + 'pt';
    $('#points-list').replaceChildren(...rows);
    $('#points-modal').classList.remove('hidden');
  }
  function closePoints() { $('#points-modal').classList.add('hidden'); }

  // 設定モーダル（ホーム右下）。リタイア＝セーブ消去してタイトルへ
  function openSettings() {
    renderSettingsMain();
    $('#settings-modal').classList.remove('hidden');
  }
  function closeSettings() { $('#settings-modal').classList.add('hidden'); }
  function renderSettingsMain() {
    const retire = el('button', 'retire', 'リタイア（最初から）');
    retire.onclick = renderSettingsConfirm;
    $('#settings-body').replaceChildren(
      el('p', 'settings-note', 'ゲームの設定'),
      retire
    );
  }
  function renderSettingsConfirm() {
    const warn = el('p', 'settings-note cond-warn', '本当にリタイアしますか？ 現在のセーブは消え、タイトルに戻ります。');
    const yes = el('button', 'retire', 'はい、リタイアする');
    yes.onclick = () => { closeSettings(); DT.state.clear(); state = null; initTitle(); };
    const no = el('button', '', 'やめる');
    no.onclick = renderSettingsMain;
    $('#settings-body').replaceChildren(warn, yes, no);
  }

  function renderHomeCond() {
    // 予想スコア・ミス率はプレイヤーには非表示（開発パネルにのみ表示）
    const moodLabel = DT.engine.motivationLabel(state.motivation);

    const top = el('div', 'cond-top');
    top.appendChild(el('div', 'mood-face', MOOD_EMOJI[moodLabel] || '🙂'));
    const meta = el('div', 'mood-meta');
    meta.appendChild(el('div', 'mood-label', moodLabel));
    meta.appendChild(el('div', 'mood-note', 'やる気 ' + state.motivation + ' / 100'));
    top.appendChild(meta);

    const nodes = [top,
      meterRow('体力', 100 - state.fatigue, { warn: state.fatigue >= 60 }),
      meterRow('学力', state.study)
    ];
    if (state.study < DT.DATA.STUDY_MIN) {
      nodes.push(el('div', 'cond-warn', '⚠ 学業警告中！（学力' + DT.DATA.STUDY_MIN + '未満）'));
    }
    if (DT.DATA.EXAMS.turns.includes(state.turn)) {
      nodes.push(el('div', 'cond-warn', '⚠ 今月末は定期テスト！（学力' + DT.DATA.EXAMS.passLine + '以上で合格）'));
    }
    $('#home-cond').replaceChildren(...nodes);
  }

  function renderHomeStatus() {
    const head = el('div', 'status-head');
    head.appendChild(el('span', 'board-label', 'ステータス'));
    const link = el('button', 'detail-link', '技術グリッド詳細 ▸');
    link.onclick = renderDetail;
    head.appendChild(link);

    const meters = el('div', 'status-meters');
    meters.appendChild(meterRow('構成', state.composition));
    meters.appendChild(meterRow('怪我', state.injuryRisk, { warn: state.injuryRisk >= 40 }));

    $('#home-status').replaceChildren(head, skillRadarGrid(state.skills), meters);
  }

  function bigAction(kind, icon, name, desc, onclick, compact) {
    const b = el('button', 'action-btn ' + kind + (compact ? ' compact' : ''));
    b.appendChild(el('span', 'icon', icon));
    const t = el('span', 't');
    t.appendChild(el('span', 'name', name));
    t.appendChild(el('span', 'desc', desc));
    b.appendChild(t);
    if (!compact) b.appendChild(el('span', 'arrow', '▶'));
    b.onclick = onclick;
    return b;
  }

  // 勉強・休養(療養)を横並びにする2列の行
  function actionRow(a, b) {
    const row = el('div', 'action-row');
    row.appendChild(a);
    row.appendChild(b);
    return row;
  }

  function renderHomeActions() {
    const box = $('#home-actions');
    const study = bigAction('study', '📖', '勉 強', '学力アップ', () => onAction('study'), true);
    if (state.injuredTurns > 0) {
      // 怪我中: 療養のほか、勉強と「ルーチン構成のみ1枠」の練習が可能
      box.replaceChildren(
        el('div', 'cond-warn', '⚠ 怪我中！練習はルーチン構成のみ（1枠）'),
        bigAction('train', '🥢', '練 習', 'ルーチン構成のみ（怪我のため軽め）', openTrainMenu),
        actionRow(study, bigAction('injured', '🩹', '療 養', '怪我を治す', () => onAction('injured'), true))
      );
      return;
    }
    if (state.banTurns > 0) {
      box.replaceChildren(
        el('div', 'cond-warn', '⚠ 補習中！練習禁止（残り' + state.banTurns + 'ヶ月）'),
        actionRow(study, bigAction('rest', '🛌', '休 養', '疲労・怪我を回復', () => onAction('rest'), true))
      );
      return;
    }
    box.replaceChildren(
      bigAction('train', '🥢', '練 習', '3枠のメニューを組んで技術アップ', openTrainMenu),
      actionRow(study, bigAction('rest', '🛌', '休 養', '疲労・怪我を回復', () => onAction('rest'), true))
    );
  }

  // --- 練習メニュー ---
  function openTrainMenu() {
    renderTrainMenu();
  }

  function firstEmptySlot() { return slotsUI.indexOf(null); }
  // 2つのスロット内容が同じ練習メニューか（ルーチン同士 or ジャンル＆種別が一致）
  function entryEquals(a, b) {
    if (a === 'routine' || b === 'routine') return a === b;
    return !!a && !!b && a.genre === b.genre && a.method === b.method;
  }
  function countSameEntry(entry) {
    return slotsUI.filter(s => s && entryEquals(s, entry)).length;
  }
  function addSlotEntry(entry) {
    const idx = firstEmptySlot();
    if (idx < 0) return;
    if (countSameEntry(entry) >= 2) return; // 同じ練習メニューは2つまで
    slotsUI[idx] = entry;
    renderTrainMenu();
  }

  function slotButton(s, idx) {
    if (!s) {
      const d = el('button', 'slot empty', '＋ 空き');
      d.disabled = true;
      return d;
    }
    // 技の種類ごとに背景色を変える（m-<method>／ルーチンはroutine）
    const d = el('button', s === 'routine' ? 'slot filled routine' : 'slot filled m-' + s.method);
    if (s === 'routine') {
      d.appendChild(el('span', 's-genre routine-tag', '構成'));
      d.appendChild(document.createTextNode('ルーチン構成'));
    } else {
      d.appendChild(el('span', 's-genre', genreLabel(s.genre)));
      d.appendChild(document.createTextNode(methodActionLabel(s.method)));
    }
    d.appendChild(el('span', 's-x', '×'));
    d.onclick = () => { slotsUI[idx] = null; renderTrainMenu(); };
    return d;
  }

  function renderTrainMenu() {
    const mood = DT.engine.motivationLabel(state.motivation);
    $('#trainmenu-mood').textContent = (MOOD_EMOJI[mood] || '🙂') + ' ' + mood;

    // 画面上部に現在の能力値を表示（何を伸ばすか判断しやすく）
    $('#trainmenu-skills').replaceChildren(
      el('div', 'board-label', '能力値'),
      skillTable(state.skills),
      meterRow('演技構成', state.composition)
    );

    $('#slot-row').replaceChildren(...slotsUI.map(slotButton));

    const injured = state.injuredTurns > 0; // 怪我中はルーチン構成のみ（ジャンル練習不可）
    const empty = firstEmptySlot();

    // ジャンル
    if (injured) {
      $('#genre-row').replaceChildren(el('div', 'train-hint', '怪我中はジャンル練習ができません（ルーチン構成のみ）'));
    } else {
      $('#genre-row').replaceChildren(...DT.DATA.GENRES.map(g => {
        const unlocked = DT.contest.isGenreUnlocked(state, g.id);
        const b = el('button', 'pick-btn' + (unlocked ? '' : ' locked') + (selectedGenre === g.id ? ' selected' : ''));
        b.appendChild(document.createTextNode(unlocked ? g.label : '🔒 ' + g.label));
        if (unlocked) {
          b.appendChild(el('small', '', selectedGenre === g.id ? '選択中' : 'タップ'));
          b.onclick = () => { selectedGenre = (selectedGenre === g.id) ? null : g.id; renderTrainMenu(); };
        } else {
          const req = DT.DATA.SKILL_TREE[g.id].requires;
          b.appendChild(el('small', '', '未解禁'));
          b.disabled = true;
          b.title = genreLabel(req.genre) + 'の習熟' + req.threshold + '超で解禁';
        }
        return b;
      }));
    }

    // メソッド。怪我中はルーチン構成のみ、通常時は3種＋ルーチン構成
    const routineMaxed = countSameEntry('routine') >= 2;
    const routineUsable = empty >= 0 && !routineMaxed;
    const routineBtn = el('button', 'pick-btn m-routine' + (routineUsable ? '' : ' locked'));
    routineBtn.appendChild(document.createTextNode('ルーチン構成'));
    routineBtn.appendChild(el('small', '', routineMaxed ? '上限（2つまで）' : '演技構成・回復'));
    if (routineUsable) { routineBtn.onclick = () => addSlotEntry('routine'); } else { routineBtn.disabled = true; }

    if (injured) {
      $('#method-row').replaceChildren(routineBtn);
    } else {
      const methodBtns = DT.DATA.METHODS.map(m => {
        const entry = selectedGenre ? { genre: selectedGenre, method: m.id } : null;
        const maxed = entry ? countSameEntry(entry) >= 2 : false; // 同じ内容は2つまで
        const usable = empty >= 0 && !!selectedGenre && !maxed;
        const b = el('button', 'pick-btn m-' + m.id + (usable ? '' : ' locked'));
        b.appendChild(document.createTextNode(methodActionLabel(m.id)));
        b.appendChild(el('small', '', maxed ? '上限（2つまで）' : m.label));
        if (usable) {
          b.onclick = () => { if (selectedGenre) addSlotEntry({ genre: selectedGenre, method: m.id }); };
        } else {
          b.disabled = true;
        }
        return b;
      });
      $('#method-row').replaceChildren(...methodBtns, routineBtn);
    }

    $('#btn-training-go').disabled = slotsUI.some(s => s === null);
    updateDevPanel();
    show('#screen-trainmenu');
  }

  $('#btn-training-go').onclick = () => {
    const slots = slotsUI.map(s => (s === 'routine' ? 'routine' : { genre: s.genre, method: s.method }));
    renderTrainingResult(DT.engine.applyTraining(state, slots));
  };

  // --- 練習結果 ---
  // 練習結果の成長対象（能力名）
  function trainTargetLabel(r) {
    return r.slot === 'routine' ? '演技構成' : statLabelById(r.slot.method);
  }

  function renderTrainingResult(tr) {
    // 上部＝スロットごとの結果。列がぴったり揃うよう1つのグリッドに
    // [メニュー][判定][増分][対象] の順で流し込む
    const grid = el('div', 'train-rows');
    tr.results.forEach(r => {
      const fail = r.tier === '失敗';
      grid.appendChild(el('span', 'tr-menu', slotChipLabel(r.slot)));
      grid.appendChild(el('span', 'tr-tier' + (fail ? ' fail' : ''), r.tier));
      grid.appendChild(el('span', 'tr-val', fail ? '—' : '+' + r.gain));
      grid.appendChild(el('span', 'tr-target', trainTargetLabel(r)));
    });
    const slotNodes = [];
    if (tr.outdoor) slotNodes.push(el('div', 'cond-warn', '⚠ 体育館工事のため屋外練習… 伸びが半減しました'));
    slotNodes.push(grid);
    $('#training-slots').replaceChildren(...slotNodes);

    const cellTotals = {};
    let compositionTotal = 0;
    tr.results.forEach(r => {
      if (r.tier === '失敗') return;
      if (r.slot === 'routine') { compositionTotal += r.gain; }
      else {
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
    if (summaryNodes.length === 0) summaryNodes.push(el('div', 'cond-warn', '今月は実りが少なかった……'));
    $('#training-summary').replaceChildren(...summaryNodes);

    // 新技開発で大成功した月はSNS投稿イベントを挟む
    $('#btn-training-ok').onclick = () => {
      if (tr.noveltyGreat) {
        showSnsEvent(extra => continueTurn(['練習を終えた。'].concat(extra ? [extra] : []), 'training'));
      } else {
        continueTurn(['練習を終えた。'], 'training');
      }
    };
    show('#screen-training');
  }

  // 新技開発の大成功で発生: SNSに動画を投稿するか？（投稿=高確率でバズ・低確率で既存技判明）
  function snsClampMot(delta) { state.motivation = Math.max(0, Math.min(100, state.motivation + delta)); }
  function showSnsEvent(onDone) {
    $('#event-char').textContent = '📱 SNS';
    $('#event-text').replaceChildren(el('p', '', '新しい技が大成功！ この技の動画をSNSに投稿する？'));
    const up = el('button', 'primary', '投稿する');
    up.onclick = () => {
      let msg;
      if (Math.random() < DT.DATA.SNS_EVENT.viralChance) {
        snsClampMot(DT.DATA.SNS_EVENT.viralMotivation);
        msg = '🎉 技がバズった！やる気が大きく上がった！';
      } else {
        snsClampMot(-DT.DATA.SNS_EVENT.existingPenalty);
        msg = '💧「それ既出の技だよ」とコメントが…既存の技だった。';
      }
      onDone(msg);
    };
    const no = el('button', '', 'やめておく');
    no.onclick = () => onDone(null);
    $('#event-choices').replaceChildren(up, no);
    show('#screen-event');
  }

  // --- 詳細画面 ---
  function renderDetail() {
    $('#detail-pt').textContent = totalPoints() + 'pt';
    $('#detail-skills').replaceChildren(skillTable(state.skills));
    $('#detail-radar').replaceChildren(skillRadarGrid(state.skills));
    $('#detail-cond').replaceChildren(
      meterRow('構成', state.composition),
      meterRow('学力', state.study),
      meterRow('怪我', state.injuryRisk, { warn: state.injuryRisk >= 40 }),
      meterRow('体力', 100 - state.fatigue, { warn: state.fatigue >= 60 })
    );
    const nextUnlock = DT.contest.nextUnlockTarget(state);
    $('#detail-unlock').textContent = nextUnlock
      ? '🔓 次の解禁: ' + genreLabel(nextUnlock.id) + '（' + genreLabel(nextUnlock.reqGenre) + 'の習熟あと' + nextUnlock.remaining + '）'
      : '🔓 全ジャンル解禁済み！';
    show('#screen-detail');
  }

  // --- ターン実行フロー ---
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
    // JJF予選（9月）: 参加するか選ぶ
    const jq = DT.contest.jjfQualifierForTurn(state.turn);
    if (jq) {
      pendingMessages = messages;
      pendingContest = jq;
      renderJjfQualifier(jq);
      return;
    }
    // JJF決勝（10月）: 予選突破していれば自動で決勝→結果画面
    const jf = DT.contest.jjfFinalForTurn(state.turn);
    if (jf && state.jjfFinalist) {
      state.jjfFinalist = 0;
      const results = DT.contest.runJjfFinal(state, jf);
      finishTurn(messages, results);
      return;
    }
    const sched = DT.events.scheduledEventFor(state);
    if (sched) {
      const sr = DT.events.applyScheduled(state, sched);
      // 定期イベントはホーム画面の上にポップアップで通知（afterTurnでホーム描画後に表示）
      pendingScheduledPopup = { sched: sched, effects: sr.messages };
      finishTurn(messages.concat(sr.messages), null);
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
    if (state.status !== 'playing') { renderEnding(); return; }
    renderHome(logs);
    // ホーム描画後に、保留中の定期イベントをポップアップ表示
    if (pendingScheduledPopup) {
      showScheduledPopup(pendingScheduledPopup);
      pendingScheduledPopup = null;
    }
  }

  function showScheduledPopup(p) {
    $('#sched-title').textContent = '🎉 ' + (p.sched.name || 'イベント');
    const body = [el('p', 'popup-text', p.sched.text)];
    // 効果メッセージは本文(sched.text)を含むことがあるので、重複部分を除いた効果だけを表示
    (p.effects || []).forEach(m => {
      let effect = m;
      if (p.sched.text && effect.indexOf(p.sched.text) === 0) {
        effect = effect.slice(p.sched.text.length).replace(/^[（(]|[）)]$/g, '').trim();
      }
      if (effect) body.push(el('p', 'popup-effect', effect));
    });
    $('#sched-body').replaceChildren(...body);
    $('#sched-ok').onclick = () => $('#sched-popup').classList.add('hidden');
    $('#sched-popup').classList.remove('hidden');
  }

  // エントリー画面上部に現在の能力値（数値テーブル＋レーダー）を表示
  function renderEntryStatus() {
    $('#entry-status').replaceChildren(
      el('div', 'board-label', '現在の能力値'),
      skillTable(state.skills),
      skillRadarGrid(state.skills),
      meterRow('演技構成', state.composition)
    );
  }

  // --- 世界大会 出場選択 ---
  function renderWorldsEntry(wc) {
    renderEntryStatus();
    $('#entry-title').textContent = wc.name + ' 出場権獲得！';
    $('#entry-hint').textContent = '直近1年の優勝実績により出場できます。相手は世界トップレベル（王者・魁人も出場）。' +
      (state.injuredTurns > 0 ? '　⚠ 怪我の影響でミス率+15%！' : '');
    const enter = el('button', 'primary', '出場する');
    enter.onclick = () => {
      const results = DT.contest.runAll(state, pendingContest, ['overall']);
      finishTurn(pendingMessages, results);
    };
    const skip = el('button', '', '見送る');
    skip.onclick = () => {
      if (pendingActionId !== 'injured') { proceedWithEvents(pendingMessages); }
      else { finishTurn(pendingMessages, null); }
    };
    $('#entry-divisions').replaceChildren(enter, skip);
    $('#btn-entry-go').classList.add('hidden');
    show('#screen-entry');
  }

  // --- JJF予選（9月）: 参加/不参加を選ぶ ---
  function renderJjfQualifier(jq) {
    renderEntryStatus();
    $('#entry-title').textContent = jq.name + '（9月）';
    $('#entry-hint').textContent = 'JJFに挑戦しますか？ 全パラメータがバランス良く高いほど予選を突破できます。';
    const join = el('button', 'primary', '参加する');
    join.onclick = () => {
      const q = DT.contest.jjfQualify(state);
      const msgs = [];
      if (q.passed) {
        state.motivation = Math.max(0, Math.min(100, state.motivation + DT.DATA.JJF.passMotivation));
        state.jjfFinalist = 1;
        // 決勝進出ポイント(+10)を記録（決勝の追加ポイントは決勝側で付与）
        state.results.push({ name: jq.name, type: 'jjf', division: 'qualifier', divisionLabel: 'JJF予選突破', rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn, standings: [], rivalMessages: [] });
        msgs.push('JJF予選突破！ 決勝進出（+' + DT.DATA.JJF.finalistPoints + 'pt・やる気アップ）');
      } else {
        msgs.push('JJF予選敗退… 総合力がまだ足りなかった。');
      }
      showJjfResult(q, () => finishTurn(pendingMessages.concat(msgs), null));
    };
    const skip = el('button', '', '参加しない');
    skip.onclick = () => finishTurn(pendingMessages, null);
    $('#entry-divisions').replaceChildren(join, skip);
    $('#btn-entry-go').classList.add('hidden');
    show('#screen-entry');
  }

  // JJF予選の結果をポップアップ表示（sched-popupを流用）
  function showJjfResult(q, onDone) {
    $('#sched-title').textContent = q.passed ? '🎉 JJF予選 突破！' : '💧 JJF予選 敗退';
    const tierNote = q.tier === 'sure' ? '（確実圏）' : (q.tier === 'half' ? '（当落線・運）' : '（実力不足）');
    $('#sched-body').replaceChildren(
      el('p', 'popup-text', q.passed ? '予選突破！ 来月の決勝に進出します。' : '予選敗退。総合バランスをさらに高めよう。'),
      el('p', 'popup-effect', 'バランス評価: 平均 ' + q.avg + ' ／ 最低 ' + q.min + ' ' + tierNote)
    );
    $('#sched-ok').onclick = () => { $('#sched-popup').classList.add('hidden'); onDone(); };
    $('#sched-popup').classList.remove('hidden');
  }

  // --- エントリー選択 ---
  function renderEntry(contest) {
    renderEntryStatus();
    $('#btn-entry-go').classList.remove('hidden');
    const max = DT.contest.maxEntries(state.turn);
    entrySelection = [];
    $('#entry-title').textContent = contest.name + ' エントリー';
    $('#entry-hint').textContent = 'エントリー枠: ' + max + '部門まで' +
      (state.injuredTurns > 0 ? '　⚠ 怪我の影響でミス率+15%！' : '');

    const emptyHint = el('div', 'entry-empty', '最低1部門を選択してください');
    const updateHint = () => { emptyHint.style.display = entrySelection.length > 0 ? 'none' : ''; };

    // 大会種別に対応する部門だけを対象に（OIDC/AJDC=総合＋スペシャ、静岡=テクニカル＋パフォーマンス）
    // スペシャリスト部門は該当ジャンルが未解禁なら出場不可（総合は常に出場可）
    const options = DT.DATA.DIVISIONS
      .filter(d => d.contests.indexOf(contest.type) >= 0)
      .filter(d => !(d.scoring === 'specialist' && !DT.contest.isGenreUnlocked(state, d.id)))
      .map(d => {
        const label = d.id === 'overall' ? '個人総合部門' : d.label;
        const b = el('button', 'entry-option');
        b.appendChild(el('span', 'entry-check', '✓'));
        b.appendChild(el('span', 'entry-label', label));
        b.onclick = () => {
          const idx = entrySelection.indexOf(d.id);
          if (idx >= 0) {
            entrySelection.splice(idx, 1);
            b.classList.remove('selected');
          } else if (entrySelection.length < max) {
            entrySelection.push(d.id);
            b.classList.add('selected');
          }
          updateHint();
        };
        return b;
      });
    updateHint();
    $('#entry-divisions').replaceChildren(emptyHint, ...options);
    show('#screen-entry');
  }

  $('#btn-entry-go').onclick = () => {
    if (entrySelection.length === 0) return;
    const results = DT.contest.runAll(state, pendingContest, entrySelection);
    finishTurn(pendingMessages, results);
  };

  const PARTS_LABELS = {
    difficulty: '難易度', variety: '多彩性', control: '操作安定度',
    novelty: '新奇性', composition: '演技構成', fundamentals: '基礎', technical: 'テクニカル'
  };

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
        nodes.push(textRow((PARTS_LABELS[id] || id) + '点', String(r.parts[id]) + '/' + maxFor(id)));
      });
      nodes.push(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
      nodes.push(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
      nodes.push(textRow('特別減点', '-' + r.specialDeduction + '点'));
      nodes.push(textRow('スコア', r.score + '点'));
      nodes.push(textRow('獲得ポイント', r.points + 'pt'));
      // 開発用: ステータス（素点）より実スコアが低かった場合、その理由を明示（?dev時のみ）
      const raw = Math.round(r.rawTotal * 10) / 10;
      const diff = Math.round((r.score - raw) * 10) / 10;
      if (DEV && diff < 0) {
        const causes = [];
        if (r.execDeduction > 0) causes.push('ミス' + r.misses + '回 −' + r.execDeduction);
        if (r.specialDeduction > 0) causes.push('特別減点 −' + r.specialDeduction);
        if (r.judgeMod < 0) causes.push('調子・審査 ' + r.judgeMod);
        nodes.push(el('div', 'dev-reason',
          '🔧DEV 実力(素点' + raw + ') → 実スコア' + r.score + '（' + diff + '） 主因: ' + (causes.join(' / ') || '軽微')));
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
    const nodes = [el('div', 'result-big', e.rank), el('p', 'center', e.title)];
    if (e.comment) nodes.push(el('p', 'center', e.comment));
    nodes.push(textRow('通算ポイント', e.totalPoints + 'pt'));
    if (e.abilityAvg !== undefined) nodes.push(textRow('最終能力平均', String(e.abilityAvg)));
    if (state.results.length > 0) nodes.push(resultsTable(state.results));
    // ライバル戦績の表示は非表示（スコア計算では引き続き対戦相手として登場）
    $('#ending-detail').replaceChildren(...nodes);
    show('#screen-ending');
  }

  $('#btn-restart').onclick = () => { DT.state.clear(); state = null; initTitle(); };

  // --- ボトムナビ・戻る ---
  $('#nav-home').onclick = () => { if (state) show('#screen-home'); };
  $('#nav-detail').onclick = () => { if (state) renderDetail(); };
  $('#nav-settings').onclick = () => { if (state) openSettings(); };
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => show('#screen-home'); });
  document.querySelectorAll('[data-close-schedule]').forEach(b => { b.onclick = closeSchedule; });
  document.querySelectorAll('[data-close-points]').forEach(b => { b.onclick = closePoints; });
  document.querySelectorAll('[data-close-settings]').forEach(b => { b.onclick = closeSettings; });

  // --- 開発用パラメータパネル ---
  function devRow(k, v, cls) {
    const row = el('div', 'dev-row');
    row.appendChild(el('span', 'k', k));
    row.appendChild(el('span', 'v' + (cls ? ' ' + cls : ''), v));
    return row;
  }
  function devSection(label, children) {
    const s = el('div', 'dev-section');
    s.appendChild(el('div', 'dev-label', label));
    children.forEach(c => s.appendChild(c));
    return s;
  }

  function updateDevPanel() {
    const body = $('#dev-body');
    if (!state) {
      body.replaceChildren(el('div', 'dev-note', 'ゲーム開始後に現在のstateを表示します。'));
      return;
    }
    const bd = DT.contest.breakdown(state, 'overall');
    const rawTotal = Object.values(bd).reduce((a, v) => a + v, 0);
    const nextContest = nextContestFrom(state.turn);
    const nextWorlds = DT.DATA.WORLDS_TURNS.find(t => t >= state.turn);
    const nextExam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
    const nextUnlock = DT.contest.nextUnlockTarget(state);

    const stateRows = [
      devRow('turn', state.turn + ' / ' + DT.DATA.TOTAL_TURNS + '（' + DT.engine.turnLabel(state.turn) + '）'),
      devRow('totalPoints', totalPoints() + 'pt'),
      devRow('motivation', state.motivation + '（' + DT.engine.motivationLabel(state.motivation) + '）', state.motivation >= 60 ? 'good' : (state.motivation < 40 ? 'warn' : '')),
      devRow('fatigue', String(state.fatigue), state.fatigue >= 55 ? 'warn' : ''),
      devRow('injuryRisk', String(state.injuryRisk), state.injuryRisk >= 40 ? 'warn' : ''),
      devRow('study', String(state.study), state.study < DT.DATA.STUDY_MIN ? 'warn' : ''),
      devRow('composition', String(state.composition)),
      devRow('banTurns', String(state.banTurns)),
      devRow('injuredTurns', String(state.injuredTurns)),
      devRow('outdoorTurns', String(state.outdoorTurns || 0), state.outdoorTurns > 0 ? 'warn' : '')
    ];

    const grid = el('table', 'dev-grid');
    const gh = el('tr');
    ['genre', 'diff', 'nov', 'ctrl', 'avg'].forEach(h => gh.appendChild(el('th', '', h)));
    grid.appendChild(gh);
    DT.DATA.GENRES.forEach(g => {
      const unlocked = DT.contest.isGenreUnlocked(state, g.id);
      const tr = el('tr', unlocked ? '' : 'locked');
      tr.appendChild(el('td', '', g.id + (unlocked ? '' : ' 🔒')));
      DT.DATA.METHODS.forEach(m => tr.appendChild(el('td', '', String(state.skills[g.id][m.id]))));
      tr.appendChild(el('td', 'avg', String(DT.contest.genreAvg(state, g.id))));
      grid.appendChild(tr);
    });

    const forecastRows = [
      devRow('next', nextContest ? nextContest.name + ' (t' + nextContest.turn + ')' : '—'),
      devRow('worldsQualified', nextWorlds && DT.contest.worldsQualified(state, nextWorlds) ? 'true' : 'false',
        nextWorlds && DT.contest.worldsQualified(state, nextWorlds) ? 'good' : 'warn'),
      devRow('expectedScore', String(Math.round((DT.DATA.SCORING.scale.base + rawTotal * DT.DATA.SCORING.scale.mult) * 10) / 10)),
      devRow('missRate', DT.contest.missRate(state, 'overall') + '%'),
      devRow('nextExam', nextExam ? 't' + nextExam : '—'),
      devRow('meetupMonth', DT.engine.isMeetupMonth(state.turn) ? 'true' : 'false', DT.engine.isMeetupMonth(state.turn) ? 'good' : ''),
      devRow('nextUnlock', nextUnlock ? nextUnlock.id + '（' + nextUnlock.reqGenre + 'あと' + nextUnlock.remaining + '）' : '全解禁')
    ];

    const uiRows = [
      devRow('slotsUI', slotsUI.map(s => !s ? 'null' : (s === 'routine' ? 'routine' : s.genre + '.' + s.method.slice(0, 4))).join(' | ')),
      devRow('selectedGenre', selectedGenre || 'null'),
      devRow('status', state.status)
    ];

    body.replaceChildren(
      devSection('STATE', stateRows),
      devSection('SKILLS（GRID 4×3）', [grid]),
      devSection('CONTEST / FORECAST', forecastRows),
      devSection('TRAINING UI STATE', uiRows),
      el('div', 'dev-note', '※ 開発用。幅1100px未満（＝スマホ実機）では非表示。')
    );
  }

  initTitle();
})();
