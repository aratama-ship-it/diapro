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
  let pendingSlots = null;          // 練習ターンのスロット構成（前スロット→練習実行まで保持）
  let pendingSkipAction = false;    // 過労で倒れる等で当ターンの行動をキャンセルするか
  let pendingScheduledPopup = null;
  let pendingPopularity = null;

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

  // 三角レーダーの軸カラー（軸番号順: 0=難易度 / 1=新奇性 / 2=操作安定度）。
  // 空色背景と喧嘩する青は避け、青の補色にあたる暖色＋アクセントのティールで色分け。
  const AXIS_COLORS = ['#ff6b6b', '#f0a825', '#2ec4b6'];

  // ジャンルのフルネーム（ポップアップ見出し用）
  const GENRE_FULL = { h1d: '1ディアボロ・水平軸', v1d: '1ディアボロ・垂直軸', d2: '2ディアボロ', d3: '3ディアボロ以上' };

  // 三角レーダーのSVGを生成（小カードでも拡大ポップアップでも共通で使う。viewBox基準なのでCSSで拡縮）
  function buildRadarSvg(genreId, cell, unlocked) {
    const CX = 50, CY = 52, R = 40;
    const rp = (v, a) => DT.radar.radarPoint(v, a, CX, CY, R);
    const ptStr = pts => pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    // viewBoxの下側を詰める（内容は y=0〜約84。下部の空きをカットしてボックスの縦を節約）
    const svg = svgEl('svg', { viewBox: '0 0 100 86', class: 'radar-svg' });
    // 未解禁ジャンルはチャート本体を <g class="radar-dim"> にまとめてグレースケール＋淡色化。
    // 大きな鍵アイコンはこのグループの外に描いて鮮明なまま前面に出す。
    const bg = unlocked ? svg : svgEl('g', { class: 'radar-dim' });

    const wm = svgEl('text', {
      x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: '#ffd166', 'fill-opacity': '0.18', 'font-size': '40', 'font-weight': 'bold'
    });
    wm.textContent = genreLabel(genreId);
    bg.appendChild(wm);

    [100, 75, 50, 25].forEach(level => {
      const ring = [rp(level, 0), rp(level, 1), rp(level, 2)];
      bg.appendChild(svgEl('polygon', { points: ptStr(ring), fill: 'none', stroke: '#d8ddf0', 'stroke-width': '0.8' }));
    });
    // 軸スポークは各軸カラーの淡色に（どの方向がどの評価軸か色でも伝える）
    [0, 1, 2].forEach(a => {
      const o = rp(100, a);
      bg.appendChild(svgEl('line', {
        x1: CX, y1: CY, x2: o.x.toFixed(1), y2: o.y.toFixed(1),
        stroke: AXIS_COLORS[a], 'stroke-opacity': '0.35', 'stroke-width': '0.7'
      }));
    });
    if (unlocked) {
      const vpts = [rp(cell.difficulty, 0), rp(cell.novelty, 1), rp(cell.control, 2)];
      // 塗りは中立色（特定軸に偏らせない）。頂点ドットを軸カラーで色分けして識別性を上げる
      bg.appendChild(svgEl('polygon', { points: ptStr(vpts), fill: 'rgba(43,58,103,0.10)', stroke: '#9aa4c8', 'stroke-width': '1.3' }));
      vpts.forEach((p, a) => {
        bg.appendChild(svgEl('circle', {
          cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: '2.1',
          fill: AXIS_COLORS[a], stroke: '#fff', 'stroke-width': '0.7'
        }));
      });
    }
    const labelOffset = [[0, -3], [0, 9], [0, 9]];
    [['難', 0], ['新', 1], ['操', 2]].forEach(function (lv) {
      const o = rp(100, lv[1]);
      const t = svgEl('text', {
        x: (o.x + labelOffset[lv[1]][0]).toFixed(1), y: (o.y + labelOffset[lv[1]][1]).toFixed(1),
        'text-anchor': 'middle', fill: AXIS_COLORS[lv[1]], 'font-size': '8.5', 'font-weight': 'bold'
      });
      t.textContent = lv[0];
      bg.appendChild(t);
    });
    if (!unlocked) {
      svg.appendChild(bg);
      // 未解禁は大きな鍵アイコンで中央にドンと表示（一目で「まだ使えない」と分かるように）
      const t = svgEl('text', {
        x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': '46'
      });
      t.textContent = '🔒';
      svg.appendChild(t);
    }
    return svg;
  }

  // 1ジャンル分の三角レーダーカード（タップで拡大ポップアップを開く）
  function genreRadar(genreId, cell, unlocked) {
    const card = el('div', 'radar-card');
    card.appendChild(buildRadarSvg(genreId, cell, unlocked));
    card.setAttribute('role', 'button');
    card.title = 'タップで拡大';
    card.onclick = () => openRadar(genreId);
    return card;
  }

  // レーダー拡大ポップアップ。ジャンルの3軸を色分けした大きなレーダー＋数値内訳を表示
  function openRadar(genreId) {
    const unlocked = DT.contest.isGenreUnlocked(state, genreId);
    const cell = state.skills[genreId];
    $('#radar-title').textContent = '📊 ' + genreLabel(genreId) + '（' + (GENRE_FULL[genreId] || '') + '）';

    $('#radar-big').replaceChildren(buildRadarSvg(genreId, cell, unlocked));

    // 他ジャンルのサムネイル（タップでそのジャンルをメインに切替）
    const thumbs = DT.DATA.GENRES.filter(g => g.id !== genreId).map(function (g) {
      const un = DT.contest.isGenreUnlocked(state, g.id);
      const t = el('div', 'radar-thumb');
      t.appendChild(buildRadarSvg(g.id, state.skills[g.id], un));
      t.appendChild(el('div', 'radar-thumb-label', genreLabel(g.id)));
      t.setAttribute('role', 'button');
      t.title = genreLabel(g.id) + 'を拡大';
      t.onclick = () => openRadar(g.id);
      return t;
    });
    $('#radar-thumbs').replaceChildren(...thumbs);

    const legend = [];
    if (unlocked) {
      const rows = [['難易度', cell.difficulty, 0], ['新奇性', cell.novelty, 1], ['操作安定度', cell.control, 2]];
      rows.forEach(function (r) {
        const row = el('div', 'radar-leg-row');
        const dot = el('span', 'radar-leg-dot');
        dot.style.background = AXIS_COLORS[r[2]];
        row.appendChild(dot);
        row.appendChild(el('span', 'radar-leg-label', r[0]));
        row.appendChild(el('span', 'radar-leg-val num', String(r[1])));
        legend.push(row);
      });
      const avg = el('div', 'radar-leg-avg');
      avg.appendChild(el('span', 'radar-leg-label', '平均'));
      avg.appendChild(el('span', 'radar-leg-val num', String(DT.contest.genreAvg(state, genreId))));
      legend.push(avg);
    } else {
      const req = DT.DATA.SKILL_TREE[genreId].requires;
      legend.push(el('div', 'radar-leg-locked', '🔒 未解禁：' + genreLabel(req.genre) + 'の習熟' + req.threshold + '超で解禁'));
    }
    $('#radar-legend').replaceChildren(...legend);
    $('#radar-modal').classList.remove('hidden');
  }
  function closeRadar() { $('#radar-modal').classList.add('hidden'); }

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

    renderHomeContest();
    renderPlayerBoard();

    // 毎月スロットは空にリセット（前月構成の引き継ぎはしない）。怪我中はルーチン構成のみ1枠
    slotsUI = state.injuredTurns > 0 ? [null] : new Array(DT.DATA.SLOTS.perMonth).fill(null);
    selectedGenre = null;
    renderHomeActions();

    const log = $('#home-log');
    const body = [];
    if (logs && logs.length > 0) {
      log.classList.add('multi');
      logs.forEach(l => body.push(el('div', '', l)));
    } else {
      log.classList.remove('multi');
      body.push(el('div', '', '💬 今月はどうする？'));
    }
    // ログ帯タップで記録ログを開ける（後から見返せる）
    body.push(el('div', 'log-more', '📖 これまでの記録ログ ▸'));
    log.replaceChildren(...body);
    log.setAttribute('role', 'button');
    log.title = 'タップで記録ログ';
    log.onclick = openLog;
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

  // 記録ログモーダル（各ターンのイベント・ステータス変化を新しい順に表示）
  function openLog() {
    const hist = (state && state.logHistory) || [];
    const rows = [];
    if (hist.length === 0) {
      rows.push(el('div', 'dev-note', 'まだ記録はありません。行動するとここに残ります。'));
    } else {
      hist.slice().reverse().forEach(entry => {
        const box = el('div', 'log-entry');
        box.appendChild(el('div', 'log-entry-turn', DT.engine.turnLabel(entry.turn)));
        entry.messages.forEach(m => box.appendChild(el('div', 'log-entry-msg', m)));
        rows.push(box);
      });
    }
    $('#log-list').replaceChildren(...rows);
    $('#log-modal').classList.remove('hidden');
  }
  function closeLog() { $('#log-modal').classList.add('hidden'); }

  // 個人記録（自己ベスト）モーダル。通算ポイント降順の一覧を表示
  function openRecords() {
    const list = DT.state.loadRecords();
    const rows = [];
    if (!list.length) {
      rows.push(el('div', 'dev-note', 'まだ記録がありません。1周プレイ（卒業/退学）すると記録されます。'));
      $('#records-sub').textContent = '';
    } else {
      $('#records-sub').textContent = '自己ベスト ' + (list[0].totalPoints || 0) + 'pt（' + list.length + '件）';
      list.forEach((r, i) => {
        const row = el('div', 'event-row' + (i === 0 ? ' next' : ''));
        row.appendChild(el('span', 'event-icon', i === 0 ? '👑' : String(i + 1)));
        const meta = el('div', 'event-meta');
        const d = new Date(r.date);
        const dateStr = isNaN(d) ? '' : (d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate());
        meta.appendChild(el('div', 'event-when', (r.name || '主人公') + '・' + (r.background || '') + (dateStr ? '・' + dateStr : '')));
        meta.appendChild(el('div', 'event-name', '卒業ランク ' + r.rank + (r.status === 'expelled' ? '（退学）' : '') + (r.abilityAvg !== undefined ? '／能力' + r.abilityAvg : '')));
        row.appendChild(meta);
        row.appendChild(el('span', 'event-badge', (r.totalPoints || 0) + 'pt'));
        rows.push(row);
      });
    }
    $('#records-list').replaceChildren(...rows);
    $('#records-modal').classList.remove('hidden');
  }
  function closeRecords() { $('#records-modal').classList.add('hidden'); }

  // 設定モーダル（ホーム右下）。リタイア＝セーブ消去してタイトルへ
  function openSettings() {
    renderSettingsMain();
    $('#settings-modal').classList.remove('hidden');
  }
  function closeSettings() { $('#settings-modal').classList.add('hidden'); }
  function renderSettingsMain() {
    const records = el('button', '', '🏅 これまでの記録');
    records.onclick = () => { closeSettings(); openRecords(); };
    const retire = el('button', 'retire', 'リタイア（最初から）');
    retire.onclick = renderSettingsConfirm;
    $('#settings-body').replaceChildren(
      el('p', 'settings-note', 'ゲームの設定'),
      records,
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

  // 名前・やる気・ステータス（体力/学力/構成/怪我）・技術レーダーを1枠に集約した「選手ボード」
  function renderPlayerBoard() {
    const board = $('#home-board');

    // ヘッダー帯（学年月・名前・TURN・ポイント）
    const head = el('div', 'pb-head');
    const hl = el('div', 'pb-head-l');
    hl.appendChild(el('div', 'pb-turn', 'TURN ' + state.turn + ' / ' + DT.DATA.TOTAL_TURNS));
    hl.appendChild(el('div', 'pb-name', DT.engine.turnLabel(state.turn) + '・' + state.name));
    head.appendChild(hl);
    const pt = el('span', 'pt num', totalPoints() + 'pt');
    pt.setAttribute('role', 'button');
    pt.title = 'タップでポイント履歴';
    pt.onclick = openPoints;
    head.appendChild(pt);

    // コンディション行（やる気の顔＋メーター2×2グリッド）
    const moodLabel = DT.engine.motivationLabel(state.motivation);
    const cond = el('div', 'pb-cond');
    const mood = el('div', 'pb-mood');
    mood.appendChild(el('div', 'mood-face', MOOD_EMOJI[moodLabel] || '🙂'));
    mood.appendChild(el('div', 'mood-label', moodLabel));
    mood.appendChild(el('div', 'mood-note', 'やる気 ' + state.motivation));
    // 覚醒中バッジ（やる気の直下に「覚醒」漢字＋残り月数）
    if (state.awakenTurns > 0) mood.appendChild(el('div', 'mood-awaken', '🔥覚醒 あと' + state.awakenTurns + 'ヶ月'));
    cond.appendChild(mood);
    const meters = el('div', 'pb-meters');
    meters.appendChild(meterRow('体力', 100 - state.fatigue, { warn: state.fatigue >= 60 }));
    meters.appendChild(meterRow('学力', state.study));
    // 構成（演技構成）はレーダーの下に配置。怪我（injuryRisk）はプレイヤー非表示（ロジックは継続）
    cond.appendChild(meters);

    // 学業・定期テストの警告
    const warns = [];
    if (state.study < DT.DATA.STUDY_MIN) {
      warns.push(el('div', 'cond-warn', '⚠ 学業警告中！（学力' + DT.DATA.STUDY_MIN + '未満）'));
    }
    if (DT.DATA.EXAMS.turns.includes(state.turn)) {
      warns.push(el('div', 'cond-warn', '⚠ 今月末は定期テスト！（学力' + DT.DATA.EXAMS.passLine + '以上で合格）'));
    }

    // 技術（レーダーグリッド＋詳細リンク）
    const techHead = el('div', 'pb-tech-head');
    techHead.appendChild(el('span', 'board-label', '技術'));
    const link = el('button', 'detail-link', '技術グリッド詳細 ▸');
    link.onclick = renderDetail;
    techHead.appendChild(link);

    // 構成（演技構成）メーターをレーダーチャートの下に配置
    const compBox = el('div', 'pb-comp');
    compBox.appendChild(meterRow('構成', state.composition));

    board.replaceChildren(head, cond, ...warns, techHead, skillRadarGrid(state.skills), compBox);
  }

  // アクションボタンのアイコン画像（絵文字の代わり）。無い種別は絵文字にフォールバック
  const ACTION_ICON = { train: 'train.png', study: 'study.png', rest: 'rest.png', injured: 'injured.png' };
  function bigAction(kind, icon, name, desc, onclick, compact) {
    const b = el('button', 'action-btn ' + kind + (compact ? ' compact' : ''));
    const iconBox = el('span', 'icon');
    if (ACTION_ICON[kind]) {
      const img = el('img');
      img.src = 'assets/icons/' + ACTION_ICON[kind];
      img.alt = name;
      iconBox.classList.add('has-img');
      iconBox.appendChild(img);
    } else {
      iconBox.textContent = icon;
    }
    b.appendChild(iconBox);
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
    startTurn('training', slots);
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

    // その月の練習で変化したパラメーターの数値を記録ログにも残す
    const changeMsgs = [];
    Object.keys(cellTotals).forEach(key => {
      if (cellTotals[key] === 0) return;
      const [genre, method] = key.split('.');
      changeMsgs.push('📈 ' + genreLabel(genre) + '×' + statLabelById(method) + ' +' + cellTotals[key]);
    });
    if (compositionTotal !== 0) changeMsgs.push('📈 演技構成 +' + compositionTotal);

    // 練習の結果として、怪我判定→SNS投稿の順で処理（怪我は練習の直接結果なのでSNSより先）。その後に練習後スロットへ。
    $('#btn-training-ok').onclick = () => {
      pendingMessages.push('練習を終えた。');
      changeMsgs.forEach(m => pendingMessages.push(m));
      const inj = DT.engine.rollInjury(state);
      // 新技開発で大成功した月のみSNS投稿イベントを挟む
      const doSns = () => {
        if (tr.noveltyGreat) {
          showSnsEvent(extra => { if (extra) pendingMessages.push(extra); runPostSlot(); });
        } else {
          runPostSlot();
        }
      };
      if (inj.injured) {
        showInjurySplash(() => { pendingMessages.push(inj.message); doSns(); });
      } else {
        doSns();
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
      meterRow('体力', 100 - state.fatigue, { warn: state.fatigue >= 60 })
    );
    const nextUnlock = DT.contest.nextUnlockTarget(state);
    $('#detail-unlock').textContent = nextUnlock
      ? '🔓 次の解禁: ' + genreLabel(nextUnlock.id) + '（' + genreLabel(nextUnlock.reqGenre) + 'の習熟あと' + nextUnlock.remaining + '）'
      : '🔓 全ジャンル解禁済み！';
    show('#screen-detail');
  }

  // --- ターン実行フロー ---
  // 1ターンの流れ: startTurn → ①練習前スロット(runPreSlot) → ②行動実行(runActionPhase: 練習は怪我・SNS込み)
  //                → ③練習後スロット(runPostSlot: 大会・固定イベント) → finishTurn
  //   イベント枠は「練習前=状態/ランダム」「練習後=固定/大会」。怪我・SNSは練習の一部（枠外）。
  const pushMsgs = arr => arr.forEach(m => pendingMessages.push(m));

  function startTurn(actionId, slots) {
    pendingMessages = [];
    pendingActionId = actionId;
    pendingSlots = slots || null;
    pendingSkipAction = false;
    if (actionId === 'injured') { runActionPhase(); return; } // 療養ターンは前スロット無し
    runPreSlot();
  }

  // ① 練習前スロット: 1月=初詣おみくじ（固定・全モード）＞状態イベント（過労/覚醒/励まし）＞ランダム。最大1件。
  function runPreSlot() {
    if (DT.events.isOmikujiTurn(state.turn)) { renderOmikuji(); return; }
    const cond = DT.events.conditionalEventFor(state);
    if (cond) {
      if (cond.choices) { renderEvent(cond, afterPreSlot); return; } // 覚醒のきざし・連敗の励まし等
      // 選択肢なしの状態イベント（過労で倒れる）。倒れた場合は当ターンの行動をキャンセル（強制休養）
      const cr = DT.events.applyConditional(state, cond);
      pushMsgs(cr.messages);
      if (cond.id === 'collapse') pendingSkipAction = true;
      showEventNotice(cond.speaker || '💫 できごと', cond.text, cr.messages.slice(1), afterPreSlot);
      return;
    }
    const ev = DT.events.roll(state);
    if (ev && ev.kind === 'char') { renderEvent(ev.event, afterPreSlot); return; }
    if (ev) { // ハプニング
      const h = DT.events.applyHappening(state, ev.event);
      pushMsgs(h.messages);
      showEventNotice('📓 今月のできごと', ev.event.text, h.messages.slice(1), afterPreSlot);
      return;
    }
    afterPreSlot();
  }

  // 初詣おみくじ（毎年1月の頭・全モード共通）。「引く」で抽選→結果ページ（大吉〜大凶で能力・やる気が上下）→行動へ
  function renderOmikuji() {
    $('#event-char').textContent = '⛩ 初詣';
    $('#event-text').replaceChildren(el('p', '', '新年あけましておめでとう！ 部のみんなと初詣に来た。今年の運勢を占ってみよう。'));
    const b = el('button', 'primary', 'おみくじを引く');
    b.onclick = () => {
      const r = DT.events.drawOmikuji(state);
      pushMsgs(r.messages);
      showEventNotice('⛩ おみくじ「' + r.fortune.label + '」', r.fortune.text, r.messages.slice(1), afterPreSlot);
    };
    $('#event-choices').replaceChildren(b);
    show('#screen-event');
  }

  function afterPreSlot() {
    if (pendingSkipAction) {
      // 過労で倒れた→当ターンの行動をスキップ（前ターンのdidTrain/didStudyが残らないようリセット）
      state.didTrain = false;
      state.didStudy = false;
      runPostSlot();
      return;
    }
    runActionPhase();
  }

  // ② 行動実行。練習は結果画面→怪我→SNSの順（renderTrainingResultのOKでrunPostSlotへ）。休養/勉強/療養は即runPostSlot。
  function runActionPhase() {
    if (pendingActionId === 'training') {
      renderTrainingResult(DT.engine.applyTraining(state, pendingSlots));
      return;
    }
    const r = DT.engine.applyAction(state, pendingActionId);
    pushMsgs(r.messages);
    runPostSlot();
  }

  // 選択肢のないイベント/ハプニング/状態イベントを1ページ挟んで表示（OKで続行）。効果の増減も一緒に見せる。
  function showEventNotice(header, text, effectLines, onContinue) {
    $('#event-char').textContent = header;
    const nodes = [el('p', '', text)];
    (effectLines || []).forEach(m => nodes.push(el('div', 'notice-effect', m)));
    $('#event-text').replaceChildren(...nodes);
    const b = el('button', 'primary', 'OK');
    b.onclick = onContinue;
    $('#event-choices').replaceChildren(b);
    show('#screen-event');
  }

  function onAction(actionId) {
    startTurn(actionId, null);
  }

  // ③ 練習後スロット: 大会（通常大会/世界大会/JJF）→ 固定イベント の順で1件処理し、無ければターン終了。
  //   ランダム・状態イベントは練習前スロット(runPreSlot)で処理済みなのでここでは扱わない。
  function runPostSlot() {
    const contest = DT.contest.contestForTurn(state.turn);
    if (contest) {
      pendingContest = contest;
      renderEntry(contest);
      return;
    }
    const wc = DT.contest.worldsContestForTurn(state.turn);
    if (wc && DT.contest.worldsQualified(state, state.turn)) {
      pendingContest = wc;
      renderWorldsEntry(wc);
      return;
    }
    // JJF予選（9月）: 参加するか選ぶ
    const jq = DT.contest.jjfQualifierForTurn(state.turn);
    if (jq) {
      pendingContest = jq;
      renderJjfQualifier(jq);
      return;
    }
    // JJF決勝（10月）: 予選突破していれば自動で決勝→結果画面
    const jf = DT.contest.jjfFinalForTurn(state.turn);
    if (jf && state.jjfFinalist) {
      state.jjfFinalist = 0;
      const results = DT.contest.runJjfFinal(state, jf);
      finishTurn(pendingMessages, results);
      return;
    }
    const sched = DT.events.scheduledEventFor(state);
    if (sched) {
      // 選択肢つきの固定イベント（大会前の緊張・後輩入部・進路の悩み等）はイベント画面へ
      if (sched.choices) {
        renderEvent(sched, () => finishTurn(pendingMessages, null));
        return;
      }
      const sr = DT.events.applyScheduled(state, sched);
      // 固定イベントはホーム画面の上にポップアップで通知（afterTurnでホーム描画後に表示）
      pendingScheduledPopup = { sched: sched, effects: sr.messages };
      finishTurn(pendingMessages.concat(sr.messages), null);
      return;
    }
    finishTurn(pendingMessages, null);
  }

  // 台湾合宿「行く」で低確率発生するコミカル分岐（トイレ事件→やる気-20だが覚醒）
  const TAIWAN_TOILET_CHANCE = 0.5;

  // イベント(選択肢あり)を表示。解決後にonDone()を呼ぶ（練習前スロット→行動 / 練習後スロット→ターン終了 を継続）。
  function renderEvent(event, onDone) {
    // speaker指定があれば優先（CHARACTERSに居ない一度きりのゲストNPC用。例: 斉藤会長）
    const chara = DT.DATA.CHARACTERS.find(c => c.id === event.char);
    $('#event-char').textContent = event.speaker || (chara ? chara.name : '');
    $('#event-text').replaceChildren(el('p', '', event.text));
    const buttons = event.choices.map((c, i) => {
      const b = el('button', i === 0 ? 'primary' : '', c.label);
      b.onclick = () => {
        // 覚醒のきざし: 通常のapplyChoice(既読管理)を通さず専用処理（50%成功／失敗でやる気-10）
        if (event.awakenTrigger) { handleAwakenChoice(event, i, onDone); return; }
        const r = DT.events.applyChoice(state, event, i);
        // 合宿に「行く」(i===0)を選んだら一定確率でトイレ事件に突入（そのページで結果を見せる）
        if (event.id === 'taiwan_camp' && i === 0 && Math.random() < TAIWAN_TOILET_CHANCE) {
          showTaiwanToilet(extra => { pushMsgs(r.messages); pushMsgs(extra); onDone(); });
          return;
        }
        // 選択の結果（結果文＋効果）を専用ページで表示してから続行（ログだけにしない）
        const header = event.speaker || (chara ? chara.name : '結果');
        showEventNotice(header, r.messages[0], r.messages.slice(1), () => { pushMsgs(r.messages); onDone(); });
      };
      return b;
    });
    $('#event-choices').replaceChildren(...buttons);
    show('#screen-event');
  }

  // 覚醒のきざしイベントの選択処理。「波に乗る」=50%で覚醒モード開始／失敗はやる気-20（再到達を遅らせ頻発を防ぐ）。「落ち着く」=やる気小減。onDoneで続行。
  const AWAKEN_FAIL_MOT = 20;
  function handleAwakenChoice(event, i, onDone) {
    const choice = event.choices[i];
    if (choice.awaken) {
      if (Math.random() < 0.5) {
        const dur = DT.events.startAwakening(state);
        const mult = DT.events.awakenConf(state).mult; // 標準1.5 / ハード(大学から)2.0
        const line = '✨ 覚醒モードに入った！（今後' + dur + 'ヶ月間、練習・イベントでの能力の伸びが' + mult + '倍）';
        showAwakenSplash(() => showEventNotice('✨ 覚醒', '波に完全に乗った——感覚が研ぎ澄まされ、覚醒モードに入った！',
          ['今後' + dur + 'ヶ月間 能力の伸び ×' + mult], () => { pendingMessages.push(line); onDone(); }));
      } else {
        state.motivation = Math.max(0, state.motivation - AWAKEN_FAIL_MOT);
        showEventNotice('✨ 覚醒のきざし', '波に乗ろうとしたが、力が入りすぎて呑まれてしまった……惜しくも覚醒には至らなかった。反動でどっと気持ちが萎えた。',
          ['やる気 -' + AWAKEN_FAIL_MOT], () => { pendingMessages.push('覚醒に失敗… やる気 -' + AWAKEN_FAIL_MOT); onDone(); });
      }
    } else {
      const d = choice.declineMot || 0;
      if (d) state.motivation = Math.max(0, Math.min(100, state.motivation + d));
      const effectLines = d ? ['やる気 ' + d] : [];
      showEventNotice('✨ 覚醒のきざし', choice.result, effectLines, () => { if (d) pendingMessages.push('やる気 ' + d); onDone(); });
    }
  }

  // 台湾合宿・トイレ事件: やる気-20だが「覚醒モード」で難易度+4・操作安定度+3（合宿ベースの新奇性+8と重複しない軸で表現）
  function showTaiwanToilet(onDone) {
    $('#event-char').textContent = '🚽 台湾合宿・珍事件';
    $('#event-text').replaceChildren(el('p', '',
      '合宿中、宿舎のトイレが詰まってしまった……！ 言葉も通じない中、助けを求めて必死に走り回る。極限の焦りが、なぜか集中を研ぎ澄ませ——覚醒モードに入った！'));
    const b = el('button', 'primary', '覚醒する');
    b.onclick = () => {
      // 覚醒＝難しい技が急にできる（難易度+4のみ）。ベースの合宿(新奇性+8/操作+3)と役割を分け重複させない
      const ev = { id: 'taiwan_toilet',
        text: 'パニックの果てに何かが弾けた。難しい技も体が勝手に動く……覚醒だ！（やる気は落ちたが……）',
        effects: { motivation: -20, stat: { id: 'difficulty', amount: 4 } } };
      const r = DT.events.applyConditional(state, ev);
      // 「覚醒！」エフェクト→結果ページ→続行
      showAwakenSplash(() => showEventNotice('✨ 覚醒', r.messages[0], r.messages.slice(1), () => onDone(r.messages)));
    };
    $('#event-choices').replaceChildren(b);
    show('#screen-event');
  }

  // 全画面エフェクトを一度ドンと表示（タップ or 約1.4秒で続行）。variant='' 覚醒(金) / 'injury' 怪我(赤)
  function playSplash(word, variant, onDone) {
    const s = $('#awaken-splash');
    s.querySelector('.awaken-word').textContent = word;
    s.classList.remove('hidden', 'play', 'injury');
    if (variant) s.classList.add(variant);
    void s.offsetWidth; // アニメ再生をリスタート
    s.classList.add('play');
    let done = false;
    const finish = () => { if (done) return; done = true; s.onclick = null; s.classList.add('hidden'); onDone(); };
    s.onclick = finish;
    setTimeout(finish, 1400);
  }
  function showAwakenSplash(onDone) { playSplash('覚醒！', '', onDone); }
  function showInjurySplash(onDone) { playSplash('怪我！', 'injury', onDone); }

  // 人気者イベント: OIDC/AJDCで「3位以内 かつ その部門の新奇性が90超」の部門があれば発火。
  //   ※本来は対戦相手の新奇性スコアと比べて"トップ"だが、相手の項目別スコアはゲーム内に無いため代替条件=新奇性>90。
  //   ★1ゲームで最大1回のみ（state.popularitySeenで管理）。効果はstateに適用し、複数部門で成立したら数値を部門数ぶん重ねる。
  function evaluatePopularity(state, results) {
    const type = results[0] && results[0].type;
    if (type !== 'oidc' && type !== 'ajdc') return null;
    if (state.popularitySeen) return null; // 既に一度発生していれば起きない
    const clamp01 = v => Math.max(0, Math.min(100, v));
    const avg = id => DT.DATA.GENRES.reduce((a, g) => a + state.skills[g.id][id], 0) / DT.DATA.GENRES.length;
    const noveltyTop = r => {
      if (r.division === 'overall') return avg('novelty') > 90;
      const c = state.skills[r.division];
      return c && c.novelty > 90;
    };
    const qualifying = results.filter(r => r.rank <= 3 && noveltyTop(r));
    if (qualifying.length === 0) return null;
    state.popularitySeen = true; // 発火＝以降は二度と起きない

    const n = qualifying.length;
    state.motivation = clamp01(state.motivation + 5 * n); // やる気 +5 ×部門数
    const effectLines = ['やる気 +' + (5 * n)];
    qualifying.forEach(r => {
      if (r.division === 'overall') {
        DT.DATA.GENRES.forEach(g => { state.skills[g.id].control = clamp01(state.skills[g.id].control + 3); });
        effectLines.push('全ジャンル×操作安定度 +3');
      } else {
        state.skills[r.division].control = clamp01(state.skills[r.division].control + 3);
        effectLines.push(genreLabel(r.division) + '×操作安定度 +3');
      }
    });
    const divs = qualifying.map(r => r.divisionLabel).join('・');
    const text = '大会後、「その技どうやるんですか！？」と質問攻めに！ 新奇性が評価され、一躍人気者になった。（' + divs + '）';
    return { text: text, effectLines: effectLines, count: n };
  }

  function finishTurn(messages, contestResults) {
    const end = DT.engine.endTurn(state);
    const logs = messages.concat(end.events);
    // このターンの記録を履歴に残す（endTurnでturnは進んでいるので完了ターン=state.turn-1）。あとから見返せるように保存
    const histMsgs = logs.slice();
    pendingPopularity = null;
    if (contestResults && contestResults.length) {
      contestResults.forEach(r => {
        const pts = r.points ? '・+' + r.points + 'pt' : '';
        const nums = (r.entrants ? '位/' + r.entrants + '人' : '位') + '（' + r.score + '点' + pts + '）';
        histMsgs.push('🏆 ' + r.name + '　' + r.divisionLabel + '　' + r.rank + nums);
      });
      // 人気者イベント（確定発火）。効果適用＋ログ記録し、大会結果の後に専用ページで表示
      pendingPopularity = evaluatePopularity(state, contestResults);
      if (pendingPopularity) histMsgs.push('🌟 人気者になった！', ...pendingPopularity.effectLines);
    }
    if (histMsgs.length) {
      state.logHistory = state.logHistory || [];
      state.logHistory.push({ turn: state.turn - 1, messages: histMsgs });
    }
    DT.state.save(state);
    pendingContest = null;
    pendingMessages = [];
    // 怪我判定は練習直後(rollInjury)に移したため、ここでは分岐不要
    if (contestResults) {
      pendingLogs = logs;
      renderContestResults(contestResults);
    } else {
      afterTurn(logs);
    }
  }

  function afterTurn(logs) {
    if (state.status !== 'playing') { renderEnding(); return; }
    renderHome(logs);
    // ホーム描画後に、保留中の定期イベントをポップアップ表示。無ければ覚醒終了通知（同じ枠を使うので同時は次ターンへ持ち越し）
    if (pendingScheduledPopup) {
      showScheduledPopup(pendingScheduledPopup);
      pendingScheduledPopup = null;
    } else if (state.awakenEndPending) {
      state.awakenEndPending = false;
      DT.state.save(state); // 通知済みを保存に反映（リロードで再表示しない）
      showAwakenEndPopup();
    }
  }

  // 覚醒状態が終わったことを知らせるポップアップ（定期イベントと同じ#sched-popup枠を流用）
  function showAwakenEndPopup() {
    $('#sched-title').textContent = '✨ 覚醒 終了';
    $('#sched-body').replaceChildren(el('p', 'popup-text', '研ぎ澄まされていた感覚が、すっと引いていった。覚醒状態が終わった。'));
    $('#sched-ok').onclick = () => $('#sched-popup').classList.add('hidden');
    $('#sched-popup').classList.remove('hidden');
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
    // 世界大会は練習後スロット。ランダム/状態イベントは練習前スロットで処理済みなので、見送り時はそのままターン終了。
    skip.onclick = () => { finishTurn(pendingMessages, null); };
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
        showJjfResult(q, () => finishTurn(pendingMessages.concat(msgs), null));
      } else {
        // 敗退: 専用ページは出すが理由は書かず簡潔に。やる気だけ下げる
        state.motivation = Math.max(0, state.motivation - 8);
        msgs.push('JJF予選敗退… やる気が下がった。');
        showEventNotice('💧 JJF予選 敗退', '予選敗退……', ['やる気 -8'], () => finishTurn(pendingMessages.concat(msgs), null));
      }
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
    const nodes = [el('p', 'popup-text', q.passed ? '予選突破！ 来月の決勝に進出します。' : '予選敗退。総合バランスをさらに高めよう。')];
    // 突破時のみバランス評価を表示（敗退時は理由を出さない）
    if (q.passed) {
      const tierNote = q.tier === 'sure' ? '（確実圏）' : (q.tier === 'half' ? '（当落線・運）' : '（実力不足）');
      nodes.push(el('p', 'popup-effect', 'バランス評価: 平均 ' + q.avg + ' ／ 最低 ' + q.min + ' ' + tierNote));
    }
    $('#sched-body').replaceChildren(...nodes);
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

  // 部門の発表順（迫力の部門別リザルト）。指定外(JJF決勝/世界大会等)は末尾に単独表示
  const REVEAL_ORDER = ['h1d', 'v1d', 'd2', 'd3', 'overall', 'technical', 'performance'];
  const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
  let contestReveal = null;

  function renderContestResults(results) {
    $('#contest-name').textContent = results[0].name + ' 結果';
    const orderOf = (r) => { const i = REVEAL_ORDER.indexOf(r.division); return i < 0 ? 99 : i; };
    const ordered = results.slice().sort((a, b) => orderOf(a) - orderOf(b));
    contestReveal = { ordered: ordered, i: 0 };
    renderRevealStage();
    show('#screen-contest');
  }

  // 1部門ぶんの発表ステージ。部門名→順位ドン→スコア→内訳の順にCSSで段階表示（再描画で毎回アニメ再生）
  function renderRevealStage() {
    const r = contestReveal.ordered[contestReveal.i];
    const total = contestReveal.ordered.length;
    const isLast = contestReveal.i === total - 1;
    const stage = el('div', 'reveal-stage');

    if (total > 1) stage.appendChild(el('div', 'reveal-progress', '発表 ' + (contestReveal.i + 1) + ' / ' + total + ' 部門'));
    stage.appendChild(el('div', 'reveal-divname', r.divisionLabel));

    // 順位（主役）
    const rankBox = el('div', 'reveal-rank rank-' + (r.rank <= 3 ? r.rank : 'x'));
    if (RANK_MEDAL[r.rank]) rankBox.appendChild(el('div', 'reveal-medal', RANK_MEDAL[r.rank]));
    const num = el('div', 'reveal-rank-num');
    num.appendChild(el('span', 'rn-side', '第'));
    num.appendChild(el('span', 'rn-n', String(r.rank)));
    num.appendChild(el('span', 'rn-side', '位'));
    rankBox.appendChild(num);
    rankBox.appendChild(el('div', 'reveal-entrants', r.entrants + '人中'));
    if (r.rank === 1) rankBox.appendChild(el('div', 'reveal-champ', '🎉 優勝！ 🎉'));
    stage.appendChild(rankBox);

    // スコア・獲得ポイント
    const scoreLine = el('div', 'reveal-scoreline');
    scoreLine.appendChild(el('span', 'rs-score', r.score + '点'));
    scoreLine.appendChild(el('span', 'rs-pt', '+' + r.points + 'pt'));
    stage.appendChild(scoreLine);

    // 内訳・順位表（情報量は維持）
    const detail = el('div', 'reveal-detail');
    detail.appendChild(el('div', 'section-label', '内訳（素点）'));
    const div = DT.DATA.DIVISIONS.find(d => d.id === r.division);
    const weights = div ? DT.DATA.SCORING[div.scoring].weights : {};
    const maxFor = (key) => key === 'fundamentals'
      ? DT.DATA.SCORING.base.elements * DT.DATA.SCORING.base.perElement
      : weights[key];
    Object.keys(r.parts).forEach(id => {
      detail.appendChild(textRow((PARTS_LABELS[id] || id) + '点', String(r.parts[id]) + '/' + maxFor(id)));
    });
    detail.appendChild(textRow('調子・審査', (r.judgeMod >= 0 ? '+' : '') + r.judgeMod + '点'));
    detail.appendChild(textRow('実施減点（ミス' + r.misses + '回）', '-' + r.execDeduction + '点'));
    detail.appendChild(textRow('特別減点', '-' + r.specialDeduction + '点'));
    // 開発用: ステータス（素点）より実スコアが低かった場合、その理由を明示（?dev時のみ）
    const raw = Math.round(r.rawTotal * 10) / 10;
    const diff = Math.round((r.score - raw) * 10) / 10;
    if (DEV && diff < 0) {
      const causes = [];
      if (r.execDeduction > 0) causes.push('ミス' + r.misses + '回 −' + r.execDeduction);
      if (r.specialDeduction > 0) causes.push('特別減点 −' + r.specialDeduction);
      if (r.judgeMod < 0) causes.push('調子・審査 ' + r.judgeMod);
      detail.appendChild(el('div', 'dev-reason',
        '🔧DEV 実力(素点' + raw + ') → 実スコア' + r.score + '（' + diff + '） 主因: ' + (causes.join(' / ') || '軽微')));
    }
    if (Array.isArray(r.standings) && r.standings.length > 0) {
      detail.appendChild(el('div', 'section-label', '順位表'));
      detail.appendChild(standingsTable(r.standings));
    }
    stage.appendChild(detail);

    $('#contest-result').replaceChildren(stage);
    $('#screen-contest').scrollTop = 0;
    $('#btn-contest-ok').textContent = isLast ? '結果を受け止める' : '次の部門へ ▸';
  }

  $('#btn-contest-ok').onclick = () => {
    if (contestReveal && contestReveal.i < contestReveal.ordered.length - 1) {
      contestReveal.i++;
      renderRevealStage();
    } else {
      contestReveal = null;
      // 人気者イベントが成立していれば、大会結果の後に専用ページを挟む
      if (pendingPopularity) {
        const p = pendingPopularity; pendingPopularity = null;
        showEventNotice('🌟 人気者！', p.text, p.effectLines, () => afterTurn(pendingLogs));
      } else {
        afterTurn(pendingLogs);
      }
    }
  };

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
    const card = DT.cards.pickCard(state); // カード排出（stateクリア前に判定）
    // 個人記録を保存（この周回で一度だけ）。終了したセーブは消して「つづきから」不可＆二重記録防止
    let bestNote = null;
    let cardNo = DT.state.loadRecords().length + 1; // 何人目の卒業生か（カードNo.）
    if (!state.recorded) {
      const prev = DT.state.loadRecords();
      const prevBest = prev.length ? Math.max.apply(null, prev.map(r => r.totalPoints || 0)) : -1;
      DT.state.addRecord({
        date: Date.now(),
        name: state.name,
        background: (DT.DATA.BACKGROUNDS.find(b => b.id === state.background) || {}).label || '',
        status: state.status,
        rank: e.rank,
        title: e.title,
        totalPoints: e.totalPoints,
        abilityAvg: e.abilityAvg,
        // カード情報（図鑑/一覧のミニカード表示用・Phase3で使用）
        cardId: card.id, cardTitle: card.title, cardType: card.type, cardCp: card.cp, cardNo: cardNo
      });
      if (state.status !== 'expelled' && e.totalPoints > prevBest) bestNote = '🎉 自己ベスト更新！';
      state.recorded = true;
      DT.state.clear();
    }
    $('#ending-title').textContent = state.status === 'expelled' ? 'GAME OVER' : state.name + '、卒業！';
    // パック開封演出（Phase2）: パック(裏面)→タップ開封→バースト→カード出現→数値カウントアップ→成績表フェードイン
    const cardEl = buildPlayerCard(card, cardNo);
    cardEl.classList.add('hidden');
    const rest = el('div', 'ending-rest hidden');
    if (bestNote) rest.appendChild(el('p', 'center best-note', bestNote));
    if (e.comment) rest.appendChild(el('p', 'center', e.comment));
    if (state.results.length > 0) rest.appendChild(resultsTable(state.results));
    // ライバル戦績の表示は非表示（スコア計算では引き続き対戦相手として登場）
    const stage = el('div', 'pack-stage');
    const pack = buildCardPack(card);
    stage.appendChild(pack);
    stage.appendChild(cardEl);
    pack.onclick = () => openPack(stage, pack, cardEl, rest, card);
    $('#ending-detail').replaceChildren(stage, rest);
    show('#screen-ending');
  }

  // カードパック（裏面）。レア度の気配だけ滲ませる（枠色は開封まで伏せ、発光色のみ）
  function buildCardPack(card) {
    const rankKey = card.expelled ? 'X' : card.rank;
    const pack = el('div', 'card-pack glow-' + rankKey);
    const inner = el('div', 'card-pack-inner');
    const logo = el('div', 'pack-logo');
    logo.innerHTML = '<svg viewBox="0 0 200 180">' + CARD_ART.allround + '</svg>';
    inner.appendChild(logo);
    inner.appendChild(el('div', 'pack-q', '?'));
    inner.appendChild(el('div', 'pack-tap', 'タップして開封'));
    pack.appendChild(inner);
    return pack;
  }

  // 開封: パックを震わせ→バースト→カード出現(reveal)→CP/pt/ステータスをカウントアップ→成績表を表示
  function openPack(stage, pack, cardEl, rest, card) {
    if (pack.classList.contains('opening')) return;
    pack.classList.add('opening');
    setTimeout(() => {
      spawnBurst(stage, card);
      pack.classList.add('hidden');
      cardEl.classList.remove('hidden');
      cardEl.classList.add('reveal');
      countUpCardNumbers(cardEl);
      setTimeout(() => rest.classList.remove('hidden'), 800);
    }, 700);
  }

  // レア度色のパーティクルを放射（CSSアニメ。S=虹/A=金/B=銀/他=淡青/X=灰少なめ）
  function spawnBurst(stage, card) {
    const rankKey = card.expelled ? 'X' : card.rank;
    const colors = {
      S: ['#67e8f9', '#c084fc', '#ff8ad4', '#ffd76a', '#818cf8'],
      A: ['#ffd76a', '#fff3c4', '#e8a12b'],
      B: ['#c3d0de', '#eef4fa', '#8fa8c8'],
      X: ['#9ca3af', '#6b7280']
    }[rankKey] || ['#9fc8ee', '#dceafc'];
    const n = rankKey === 'S' ? 26 : (rankKey === 'A' ? 20 : (rankKey === 'X' ? 8 : 14));
    const burst = el('div', 'pack-burst');
    for (let i = 0; i < n; i++) {
      const p = el('span', 'pk-particle');
      const ang = (360 / n) * i + (i % 3) * 9;
      p.style.setProperty('--a', ang + 'deg');
      p.style.setProperty('--d', (70 + (i % 5) * 26) + 'px');
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.animationDelay = (i % 4) * 40 + 'ms';
      burst.appendChild(p);
    }
    stage.appendChild(burst);
    setTimeout(() => burst.remove(), 1400);
  }

  // .pcard内の数値(CP/通算pt/4系統)を0から目標値へカウントアップ（約0.9秒・easeOut）
  function countUpCardNumbers(cardEl) {
    const targets = [];
    cardEl.querySelectorAll('.pcard-num b, .pcard-stat b').forEach(b => {
      const v = parseInt(b.textContent, 10);
      if (!isNaN(v)) { targets.push({ eln: b, v }); b.textContent = '0'; }
    });
    const t0 = performance.now();
    const DUR = 900;
    function tick(now) {
      const k = Math.min(1, (now - t0) / DUR);
      const ease = 1 - Math.pow(1 - k, 3);
      targets.forEach(t => { t.eln.textContent = String(Math.round(t.v * ease)); });
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---- 選手カード描画（Phase1: 静的表示。開封演出はPhase2） ----
  const CARD_RARITY = {
    S: { label: 'ULTRA RARE', stars: 6 }, A: { label: 'SUPER RARE', stars: 5 },
    B: { label: 'RARE', stars: 4 }, C: { label: 'NORMAL+', stars: 3 },
    D: { label: 'NORMAL', stars: 2 }, E: { label: 'NORMAL', stars: 1 },
    退学: { label: 'GAME OVER', stars: 0 }
  };
  // 中央アート: 属性Typeごとの署名ディアボロ（SVG作り置き5種、色はCSSのcurrentColor）
  const CARD_ART = {
    power: '<path d="M96 82 L52 58 L58 74 L40 72 L50 88 L36 100 L50 112 L40 128 L58 126 L52 142 L96 118 Z" fill="currentColor"/><path d="M104 82 L148 58 L142 74 L160 72 L150 88 L164 100 L150 112 L160 128 L142 126 L148 142 L104 118 Z" fill="currentColor"/><rect x="94" y="92" width="12" height="16" rx="2" fill="currentColor"/><path d="M20 152 Q100 120 180 152" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/>',
    innovator: '<path d="M96 86 L48 54 Q30 96 52 138 L96 114 Z" fill="currentColor"/><path d="M104 78 L162 70 Q170 100 158 124 L104 112 Z" fill="currentColor" opacity=".92"/><circle cx="52" cy="64" r="6" fill="currentColor" opacity=".55"/><circle cx="164" cy="128" r="8" fill="currentColor" opacity=".55"/><rect x="94" y="90" width="12" height="16" rx="2" fill="currentColor"/><path d="M22 148 Q100 124 178 156" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/>',
    technician: '<ellipse cx="52" cy="100" rx="26" ry="40" fill="none" stroke="currentColor" stroke-width="4"/><ellipse cx="52" cy="100" rx="15" ry="26" fill="none" stroke="currentColor" stroke-width="3"/><ellipse cx="52" cy="100" rx="6" ry="12" fill="currentColor"/><ellipse cx="148" cy="100" rx="26" ry="40" fill="none" stroke="currentColor" stroke-width="4"/><ellipse cx="148" cy="100" rx="15" ry="26" fill="none" stroke="currentColor" stroke-width="3"/><ellipse cx="148" cy="100" rx="6" ry="12" fill="currentColor"/><rect x="88" y="94" width="24" height="12" rx="3" fill="currentColor"/><path d="M20 150 Q100 122 180 150" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/>',
    showman: '<path d="M96 84 L48 62 Q38 100 48 138 L96 116 Z" fill="currentColor"/><path d="M104 84 L152 62 Q162 100 152 138 L104 116 Z" fill="currentColor"/><rect x="94" y="92" width="12" height="16" rx="2" fill="currentColor"/><path d="M100 30 l4 10 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1 Z" fill="currentColor" opacity=".8"/><path d="M170 52 l3 7 7 1 -5 5 2 7 -7 -4 -6 4 2 -7 -5 -5 7 -1 Z" fill="currentColor" opacity=".6"/><path d="M30 60 l3 7 7 1 -5 5 2 7 -7 -4 -6 4 2 -7 -5 -5 7 -1 Z" fill="currentColor" opacity=".6"/><path d="M16 150 Q100 116 184 150" fill="none" stroke="currentColor" stroke-width="2" opacity=".6"/>',
    allround: '<path d="M96 84 L44 66 Q34 100 44 134 L96 116 Z" fill="currentColor"/><ellipse cx="44" cy="100" rx="7" ry="34" fill="currentColor"/><path d="M104 84 L156 66 Q166 100 156 134 L104 116 Z" fill="currentColor"/><ellipse cx="156" cy="100" rx="7" ry="34" fill="currentColor"/><rect x="94" y="92" width="12" height="16" rx="2" fill="currentColor"/><path d="M40 100 A60 60 0 0 1 160 100" fill="none" stroke="currentColor" stroke-width="2" opacity=".35" stroke-dasharray="6 8"/><path d="M20 150 Q100 118 180 150" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/>'
  };
  function buildPlayerCard(card, cardNo) {
    const rar = card.expelled ? CARD_RARITY['退学'] : (CARD_RARITY[card.rank] || CARD_RARITY.E);
    const wrap = el('div', 'pcard rank-' + (card.expelled ? 'X' : card.rank));
    const inner = el('div', 'pcard-inner');
    // ヘッダー: レア度＋★／ランクバッジ
    const head = el('div', 'pcard-head');
    head.appendChild(el('span', 'pcard-rarity', rar.label + ' ' + '★'.repeat(rar.stars)));
    head.appendChild(el('span', 'pcard-rankbadge', card.expelled ? '×' : card.rank));
    inner.appendChild(head);
    // 名前＋カードタイトル（称号）
    inner.appendChild(el('div', 'pcard-name', card.name));
    inner.appendChild(el('div', 'pcard-epithet', '「' + card.title + '」・' + card.typeLabel));
    // 中央アート（属性別ディアボロ）
    const art = el('div', 'pcard-art');
    art.innerHTML = '<svg viewBox="0 0 200 180">' + (CARD_ART[card.type] || CARD_ART.allround) + '</svg>';
    art.appendChild(el('span', 'pcard-artlabel', 'ART: ' + card.typeLabel));
    inner.appendChild(art);
    // 能力CP／通算pt
    const nums = el('div', 'pcard-nums');
    const cpBox = el('div', 'pcard-num'); cpBox.appendChild(el('small', '', '能力CP')); cpBox.appendChild(el('b', 'num', String(card.cp)));
    const ptBox = el('div', 'pcard-num right'); ptBox.appendChild(el('small', '', '通算pt')); ptBox.appendChild(el('b', 'num', String(card.totalPoints)));
    nums.appendChild(cpBox); nums.appendChild(ptBox);
    inner.appendChild(nums);
    // 4系統ステータス
    const st = el('div', 'pcard-stats');
    [['難易度', card.stats.difficulty], ['操作', card.stats.control], ['新奇性', card.stats.novelty], ['構成', card.stats.composition]].forEach(([k, v]) => {
      const row = el('div', 'pcard-stat');
      row.appendChild(el('span', '', k)); row.appendChild(el('b', 'num', String(v)));
      st.appendChild(row);
    });
    inner.appendChild(st);
    // フッター: メダル／経歴・No.
    const foot = el('div', 'pcard-foot');
    foot.appendChild(el('span', 'pcard-medals', card.medals.join(' ')));
    const bgLabel = (DT.DATA.BACKGROUNDS.find(b => b.id === card.background) || {}).label || '';
    foot.appendChild(el('span', 'pcard-no', bgLabel + ' / No.' + String(cardNo).padStart(3, '0')));
    inner.appendChild(foot);
    wrap.appendChild(inner);
    return wrap;
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
  document.querySelectorAll('[data-close-records]').forEach(b => { b.onclick = closeRecords; });
  document.querySelectorAll('[data-close-radar]').forEach(b => { b.onclick = closeRadar; });
  document.querySelectorAll('[data-close-log]').forEach(b => { b.onclick = closeLog; });
  $('#btn-records').onclick = openRecords;

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

  // ---- おまかせ自動プレイ（デモ/確認用・2026-07-15） ----
  // URLに ?auto=1 で高校(ノーマル)、?auto=college / juniorhigh で経歴指定。
  // CPUが4年分を即時プレイしてエンディング(パック開封)へ直行。記録(RECORDS)には保存しない。
  // リロードするたび新しい結果＝別のカードが出る（開封演出のガチャ的確認ツール）。
  function autoPlayDemo(backgroundId) {
    const clampV = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    state = DT.state.newCharacter(undefined, backgroundId);
    state.name = 'おまかせ';
    let guard = 0;
    while (state.status === 'playing' && guard++ < 100) {
      // 練習前スロット: おみくじ → 状態イベント → ランダム（イベントは先頭選択）
      let skip = false;
      if (DT.events.isOmikujiTurn(state.turn)) {
        DT.events.drawOmikuji(state);
      } else {
        const cond = DT.events.conditionalEventFor(state);
        if (cond) {
          if (cond.awakenTrigger) {
            if (Math.random() < 0.5) DT.events.startAwakening(state);
            else state.motivation = clampV(state.motivation - 20, 0, 100);
          } else if (cond.choices) { DT.events.applyChoice(state, cond, 0); }
          else { DT.events.applyConditional(state, cond); if (cond.id === 'collapse') skip = true; }
        } else {
          const ev = DT.events.roll(state);
          if (ev && ev.kind === 'char') DT.events.applyChoice(state, ev.event, 0);
          else if (ev) DT.events.applyHappening(state, ev.event);
        }
      }
      // 行動: 怪我=療養 / 補習・学力低=勉強 / 疲労高=休養 / それ以外=弱点補強の練習
      if (!skip) {
        let act = 'train';
        if (state.injuredTurns > 0) act = 'injured';
        else if (state.banTurns > 0) act = state.fatigue > 55 ? 'rest' : 'study';
        else {
          const nextExam = DT.DATA.EXAMS.turns.find(t => t >= state.turn);
          if (nextExam !== undefined && nextExam - state.turn <= 1 && state.study < 45) act = 'study';
          else if (state.study < 30) act = 'study';
          else if (state.fatigue > 55) act = 'rest';
        }
        if (act === 'train') {
          const unlockedG = DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked(state, g.id));
          const cells = [];
          unlockedG.forEach(g => DT.DATA.METHODS.forEach(m => cells.push({ genre: g.id, method: m.id, v: state.skills[g.id][m.id] })));
          cells.sort((a, b) => a.v - b.v);
          const s1 = { genre: cells[0].genre, method: cells[0].method };
          const s2 = cells[1] ? { genre: cells[1].genre, method: cells[1].method } : 'routine';
          DT.engine.applyTraining(state, [s1, s2, 'routine']);
          DT.engine.rollInjury(state);
        } else {
          DT.engine.applyAction(state, act);
        }
      } else { state.didTrain = false; state.didStudy = false; }
      // 練習後スロット: 大会 → 世界 → JJF → 固定イベント
      const contest = DT.contest.contestForTurn(state.turn);
      const wc = DT.contest.worldsContestForTurn(state.turn);
      const jq = DT.contest.jjfQualifierForTurn(state.turn);
      const jf = DT.contest.jjfFinalForTurn(state.turn);
      if (contest) {
        let ids;
        if (contest.type === 'shizuoka') { ids = ['technical', 'performance']; }
        else {
          const sp = DT.DATA.DIVISIONS.filter(d => d.scoring === 'specialist' && DT.contest.isGenreUnlocked(state, d.id)).map(d => d.id);
          ids = ['overall'].concat(sp.slice(0, DT.contest.maxEntries(state.turn) - 1));
        }
        DT.contest.runAll(state, contest, ids);
      } else if (wc && DT.contest.worldsQualified(state, state.turn)) {
        DT.contest.runAll(state, wc, ['overall']);
      } else if (jq) {
        const q = DT.contest.jjfQualify(state);
        if (q.passed) {
          state.motivation = clampV(state.motivation + DT.DATA.JJF.passMotivation, 0, 100);
          state.jjfFinalist = 1;
          state.results.push({ name: jq.name, type: 'jjf', division: 'qualifier', divisionLabel: 'JJF予選突破',
            rank: 1, entrants: 0, points: DT.DATA.JJF.finalistPoints, turn: state.turn, standings: [], rivalMessages: [] });
        } else { state.motivation = clampV(state.motivation - 8, 0, 100); }
      } else if (jf && state.jjfFinalist) {
        state.jjfFinalist = 0;
        DT.contest.runJjfFinal(state, jf);
      } else {
        const sched = DT.events.scheduledEventFor(state);
        if (sched) { if (sched.choices) DT.events.applyChoice(state, sched, 0); else DT.events.applyScheduled(state, sched); }
      }
      DT.engine.endTurn(state);
    }
    state.recorded = true; // デモは記録(RECORDS)を汚さない
    renderEnding();
  }

  const autoParam = new URLSearchParams(location.search).get('auto');
  if (autoParam) {
    const bg = DT.DATA.BACKGROUNDS.some(b => b.id === autoParam) ? autoParam : 'highschool';
    autoPlayDemo(bg);
  } else {
    initTitle();
  }
})();
