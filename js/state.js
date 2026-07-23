(function (global) {
  'use strict';
  const DT = global.DT = global.DT || {};
  const SAVE_KEY = 'diabolo-trainer-save-v9';
  const SHORT_SAVE_KEY = 'diabolo-trainer-short-save-v1';
  const OLD_KEYS = ['diabolo-trainer-save-v1', 'diabolo-trainer-save-v2', 'diabolo-trainer-save-v3', 'diabolo-trainer-save-v4', 'diabolo-trainer-save-v5', 'diabolo-trainer-save-v6', 'diabolo-trainer-save-v7', 'diabolo-trainer-save-v8'];
  const ALUMNI_KEY = 'diabolo-trainer-alumni-v1';
  const SHORT_ALUMNI_KEY = 'diabolo-trainer-short-alumni-v1';
  const ALUMNI_ACTIVE_MIN = 2;
  const ALUMNI_ACTIVE_MAX = 5;
  const ALUMNI_POOL_MAX = 50;
  const TECHNIQUE_BY_TYPE = {
    power: 'integral',
    innovator: 'fts',
    technician: 'high_toss',
    showman: 'on_beat',
    allround: 'pirouette'
  };
  const TYPE_LABEL = {
    power: 'パワー型',
    innovator: 'イノベーター型',
    technician: 'テクニシャン型',
    showman: 'ショーマン型',
    allround: '万能型'
  };

  function defaultAlumni() {
    return (DT.DATA.DEFAULT_ALUMNI || []).slice(0, ALUMNI_ACTIVE_MAX).map(a =>
      Object.assign({ source: 'default' }, a));
  }

  function alumniKey(gameMode) {
    return gameMode === 'short' ? SHORT_ALUMNI_KEY : ALUMNI_KEY;
  }

  function validTechniqueId(id) {
    return (DT.DATA.TECHNIQUE_CARDS || []).some(card => card.id === id);
  }

  function normalizeAlumniEntry(entry) {
    if (!entry || typeof entry !== 'object' || !entry.id || !entry.name || !validTechniqueId(entry.techniqueId)) return null;
    return {
      id: String(entry.id),
      name: String(entry.name).slice(0, 20),
      type: entry.type ? String(entry.type) : '万能型',
      techniqueId: entry.techniqueId,
      source: entry.source === 'graduate' ? 'graduate' : 'default',
      rank: entry.rank || '',
      totalPoints: Math.max(0, Number(entry.totalPoints) || 0),
      abilityAvg: Math.max(0, Number(entry.abilityAvg) || 0),
      cardTitle: entry.cardTitle || '',
      graduatedAt: Number(entry.graduatedAt) || 0
    };
  }

  function normalizeAlumniProfile(raw) {
    const defaults = defaultAlumni().map(normalizeAlumniEntry).filter(Boolean);
    const requested = raw && Array.isArray(raw.selectedIds) ? raw.selectedIds : defaults.map(entry => entry.id);
    const seen = {};
    const pool = [];
    defaults.forEach(entry => {
      seen[entry.id] = true;
      pool.push(entry);
    });
    const storedPool = raw && Array.isArray(raw.pool) ? raw.pool : [];
    storedPool.forEach(item => {
      const entry = normalizeAlumniEntry(item);
      if (!entry || seen[entry.id]) return;
      seen[entry.id] = true;
      pool.push(entry);
    });
    if (pool.length > ALUMNI_POOL_MAX) {
      const keepDefaults = pool.filter(entry => entry.source === 'default');
      const selectedLookup = {};
      requested.forEach(id => { selectedLookup[id] = true; });
      // 50人到達後も、ユーザーが登場メンバーに選んだ卒業生は自動整理の対象にしない。
      const keepSelected = pool.filter(entry => entry.source === 'graduate' && selectedLookup[entry.id]);
      const keepRecent = pool.filter(entry => entry.source === 'graduate' && !selectedLookup[entry.id])
        .sort((a, b) => b.graduatedAt - a.graduatedAt)
        .slice(0, Math.max(0, ALUMNI_POOL_MAX - keepDefaults.length - keepSelected.length));
      pool.length = 0;
      pool.push(...keepDefaults, ...keepSelected, ...keepRecent);
    }
    const known = {};
    pool.forEach(entry => { known[entry.id] = true; });
    const selectedIds = [];
    requested.forEach(id => {
      if (known[id] && selectedIds.indexOf(id) < 0 && selectedIds.length < ALUMNI_ACTIVE_MAX) selectedIds.push(id);
    });
    pool.forEach(entry => {
      if (selectedIds.length < ALUMNI_ACTIVE_MIN && selectedIds.indexOf(entry.id) < 0) selectedIds.push(entry.id);
    });
    return { version: 1, pool: pool, selectedIds: selectedIds };
  }

  function loadAlumniProfile(storage, gameMode) {
    const s = storage || global.localStorage;
    try {
      const raw = JSON.parse(s.getItem(alumniKey(gameMode)));
      return normalizeAlumniProfile(raw);
    } catch (e) {
      return normalizeAlumniProfile(null);
    }
  }

  function writeAlumniProfile(profile, storage, gameMode) {
    const normalized = normalizeAlumniProfile(profile);
    (storage || global.localStorage).setItem(alumniKey(gameMode), JSON.stringify(normalized));
    return normalized;
  }

  function loadActiveAlumni(storage, gameMode) {
    const profile = loadAlumniProfile(storage, gameMode);
    return profile.selectedIds.map(id => profile.pool.find(entry => entry.id === id))
      .filter(Boolean).map(entry => Object.assign({}, entry));
  }

  function saveAlumniSelection(ids, storage, gameMode) {
    const profile = loadAlumniProfile(storage, gameMode);
    const known = {};
    profile.pool.forEach(entry => { known[entry.id] = true; });
    const selectedIds = [];
    (Array.isArray(ids) ? ids : []).forEach(id => {
      if (known[id] && selectedIds.indexOf(id) < 0) selectedIds.push(id);
    });
    if (selectedIds.length < ALUMNI_ACTIVE_MIN || selectedIds.length > ALUMNI_ACTIVE_MAX) {
      return {
        ok: false,
        reason: '卒業生は' + ALUMNI_ACTIVE_MIN + '〜' + ALUMNI_ACTIVE_MAX + '人選んでください。',
        profile: profile
      };
    }
    profile.selectedIds = selectedIds;
    return { ok: true, profile: writeAlumniProfile(profile, storage, gameMode) };
  }

  function addGraduateAlumni(state, card, storage, gameMode, now) {
    if (!state || state.status !== 'graduated' || gameMode !== 'short') return null;
    const profile = loadAlumniProfile(storage, gameMode);
    const graduatedAt = now === undefined ? Date.now() : Number(now);
    let id = 'graduate_' + graduatedAt;
    let suffix = 2;
    while (profile.pool.some(entry => entry.id === id)) id = 'graduate_' + graduatedAt + '_' + suffix++;
    const typeId = card && card.type ? card.type : 'allround';
    const alumni = normalizeAlumniEntry({
      id: id,
      name: state.name || '主人公',
      type: TYPE_LABEL[typeId] || '万能型',
      techniqueId: validTechniqueId(state.techniqueCard) ? state.techniqueCard : (TECHNIQUE_BY_TYPE[typeId] || 'pirouette'),
      source: 'graduate',
      rank: card && card.rank ? card.rank : '',
      totalPoints: card && card.totalPoints !== undefined ? card.totalPoints : 0,
      abilityAvg: card && card.cp !== undefined ? Math.round(card.cp / 10) : 0,
      cardTitle: card && card.title ? card.title : '',
      graduatedAt: graduatedAt
    });
    profile.pool.push(alumni);
    const activated = profile.selectedIds.length < ALUMNI_ACTIVE_MAX;
    if (activated) profile.selectedIds.push(alumni.id);
    const saved = writeAlumniProfile(profile, storage, gameMode);
    return { alumni: alumni, activated: activated, profile: saved };
  }

  // 得意技・卒業生機能の追加前に作られたセーブも、そのまま続行できるよう不足フィールドだけを補う。
  function normalizeProgression(state) {
    if (state.techniqueCard === undefined) state.techniqueCard = null;
    if (state.techniqueCardSelectedAt === undefined) state.techniqueCardSelectedAt = null;
    if (!Array.isArray(state.activeAlumni) || state.activeAlumni.length === 0) state.activeAlumni = defaultAlumni();
    state.activeAlumni = state.activeAlumni.slice(0, 5);
    if (!Array.isArray(state.alumniSchedule)) state.alumniSchedule = [];
    if (state.alumniScheduleReady === undefined) state.alumniScheduleReady = state.alumniSchedule.length > 0;
    if (!Array.isArray(state.alumniEventsSeen)) state.alumniEventsSeen = [];
    return state;
  }

  function newCharacter(rng, backgroundId, gameMode) {
    rng = rng || Math.random;
    const bg = DT.DATA.BACKGROUNDS.find(b => b.id === backgroundId) ||
               DT.DATA.BACKGROUNDS.find(b => b.id === 'highschool');
    const shortMode = gameMode === 'short';
    const statMin = shortMode && bg.shortStatMin !== undefined ? bg.shortStatMin : bg.statMin;
    const statSpread = shortMode && bg.shortStatSpread !== undefined ? bg.shortStatSpread : bg.statSpread;
    // rng消費順: GENRES配列順×METHODS配列順（h1d.difficulty→h1d.novelty→h1d.control→v1d.difficulty→…）
    // の12マス → composition → study の順に固定（テストでピン留め）
    const skills = {};
    DT.DATA.GENRES.forEach(g => {
      skills[g.id] = {};
      DT.DATA.METHODS.forEach(m => { skills[g.id][m.id] = statMin + Math.floor(rng() * statSpread); });
    });
    // 演技構成は技術と別レンジを持てる（大学は技術0でも演技構成を少し残すため）。未指定なら技術と同レンジ。
    const compMin = shortMode && bg.shortCompMin !== undefined
      ? bg.shortCompMin
      : ((bg.compMin !== undefined) ? bg.compMin : statMin);
    const compSpread = shortMode && bg.shortCompSpread !== undefined
      ? bg.shortCompSpread
      : ((bg.compSpread !== undefined) ? bg.compSpread : statSpread);
    const composition = compMin + Math.floor(rng() * compSpread);
    return normalizeProgression({
      turn: 1,
      gameMode: shortMode ? 'short' : 'standard',
      skills: skills,
      composition: composition,
      study: 40 + Math.floor(rng() * 21),
      fatigue: 0,
      injuryRisk: 10,
      motivation: DT.DATA.MOTIVATION.initial,
      injuredTurns: 0,
      lowStudyMonths: 0,
      banTurns: 0,
      outdoorTurns: 0,
      // 覚醒: awakenTurns=残り月数, awakenUsedEarly/Late=1-2年/3-4年の枠を使ったか, awakenJustStarted=開始ターン目印, awakenEndPending=終了通知待ち
      awakenTurns: 0,
      awakenUsedEarly: false,
      awakenUsedLate: false,
      awakenJustStarted: false,
      awakenEndPending: false,
      // カード排出条件用のトラッキング（2026-07-15）: 覚醒成功回数/怪我回数/大凶を引いたか
      awakenCount: 0,
      injuryCount: 0,
      daikyoDrawn: false,
      jjfFinalist: 0,
      didStudy: false,
      didTrain: false,
      results: [],
      logHistory: [],
      status: 'playing',
      name: '主人公',
      background: bg.id,
      coachEvents: 0,
      specialUnlocked: false,
      seenCharEvents: [],
      rivalRecord: DT.DATA.RIVALS.reduce((acc, r) => { acc[r.id] = { win: 0, lose: 0 }; return acc; }, {}),
      lastSlots: [],
      // 開始時に既に解禁済みのジャンルは告知しない（h1d常時＋経歴により解禁されるもの）
      announcedUnlocks: DT.DATA.GENRES.filter(g => DT.contest.isGenreUnlocked({ skills: skills }, g.id)).map(g => g.id)
    });
  }

  function save(state, storage) {
    const key = state && state.gameMode === 'short' ? SHORT_SAVE_KEY : SAVE_KEY;
    (storage || global.localStorage).setItem(key, JSON.stringify(state));
  }

  function load(storage, gameMode) {
    const s = storage || global.localStorage;
    OLD_KEYS.forEach(k => s.removeItem(k));
    const short = gameMode === 'short';
    const raw = s.getItem(short ? SHORT_SAVE_KEY : SAVE_KEY);
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      if (!state.gameMode) state.gameMode = short ? 'short' : 'standard';
      return normalizeProgression(state);
    } catch (e) {
      return null;
    }
  }

  function clear(storage, gameMode) {
    (storage || global.localStorage).removeItem(gameMode === 'short' ? SHORT_SAVE_KEY : SAVE_KEY);
  }

  // --- 個人記録（ローカル）: クリアした周回の成績を localStorage に蓄積し、通算ポイント降順で保持 ---
  const RECORDS_KEY = 'diabolo-trainer-records-v1';
  const SHORT_RECORDS_KEY = 'diabolo-trainer-short-records-v1';
  const RECORDS_MAX = 20;

  function loadRecords(storage, gameMode) {
    const s = storage || global.localStorage;
    try {
      const arr = JSON.parse(s.getItem(gameMode === 'short' ? SHORT_RECORDS_KEY : RECORDS_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  // 記録を1件追加し、通算ポイント降順にソート＆上位RECORDS_MAX件だけ保持して保存。保存後の一覧を返す。
  function addRecord(record, storage, gameMode) {
    const s = storage || global.localStorage;
    const short = gameMode === 'short';
    const key = short ? SHORT_RECORDS_KEY : RECORDS_KEY;
    const list = loadRecords(s, gameMode);
    list.push(record);
    list.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    const trimmed = list.slice(0, RECORDS_MAX);
    s.setItem(key, JSON.stringify(trimmed));
    return trimmed;
  }

  // --- カード図鑑（コレクション）: 解禁したカードを永続保存。値は初解禁日＋初解禁時のカードスナップショット ---
  // 軽量(1件あたり数百バイト・最大50件)なので上限なし。画像は保存しない(表示時に都度描画)。
  const COLLECTION_KEY = 'diabolo-trainer-collection-v1';
  const SHORT_COLLECTION_KEY = 'diabolo-trainer-short-collection-v1';

  function loadCollection(storage, gameMode) {
    const s = storage || global.localStorage;
    try {
      const obj = JSON.parse(s.getItem(gameMode === 'short' ? SHORT_COLLECTION_KEY : COLLECTION_KEY));
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  // 取得を記録し、演出用の結果 {isNew, count, cpImproved, ptImproved} を返す。
  // 初解禁: スナップショット付きで新規登録。重複: 初回スナップショットは保持したまま、
  // 取得枚数(count)と自己ベスト(bestCp/bestPt)だけを更新する（改善プラン#5・2026-07-16）。
  function addToCollection(card, cardNo, storage, gameMode) {
    const s = storage || global.localStorage;
    const key = gameMode === 'short' ? SHORT_COLLECTION_KEY : COLLECTION_KEY;
    const col = loadCollection(s, gameMode);
    const prev = col[card.id];
    if (!prev) {
      col[card.id] = { date: Date.now(), cardNo: cardNo, snap: card, count: 1, bestCp: card.cp || 0, bestPt: card.totalPoints || 0 };
      s.setItem(key, JSON.stringify(col));
      return { isNew: true, count: 1, cpImproved: false, ptImproved: false };
    }
    // 旧形式(count/best無しで保存済み)は初回分を1枚・初回スナップを自己ベストとして移行
    const oldCp = (prev.bestCp !== undefined) ? prev.bestCp : ((prev.snap && prev.snap.cp) || 0);
    const oldPt = (prev.bestPt !== undefined) ? prev.bestPt : ((prev.snap && prev.snap.totalPoints) || 0);
    prev.count = (prev.count || 1) + 1;
    const cpImproved = (card.cp || 0) > oldCp;
    const ptImproved = (card.totalPoints || 0) > oldPt;
    prev.bestCp = Math.max(oldCp, card.cp || 0);
    prev.bestPt = Math.max(oldPt, card.totalPoints || 0);
    s.setItem(key, JSON.stringify(col));
    return { isNew: false, count: prev.count, cpImproved: cpImproved, ptImproved: ptImproved, bestCp: prev.bestCp, bestPt: prev.bestPt };
  }

  DT.state = {
    newCharacter, save, load, clear, SAVE_KEY, SHORT_SAVE_KEY,
    normalizeProgression,
    loadRecords, addRecord, RECORDS_KEY, SHORT_RECORDS_KEY,
    loadCollection, addToCollection, COLLECTION_KEY, SHORT_COLLECTION_KEY,
    loadAlumniProfile, loadActiveAlumni, saveAlumniSelection, addGraduateAlumni,
    ALUMNI_KEY, SHORT_ALUMNI_KEY, ALUMNI_ACTIVE_MIN, ALUMNI_ACTIVE_MAX, ALUMNI_POOL_MAX
  };
})(typeof window !== 'undefined' ? window : globalThis);
