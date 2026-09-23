// ===== 预置数据：三款游戏、三个桌位与共用配件 =====
const storageKey = "zfl18-boardgame-rule-cards";
const today = new Date();

const defaultState = {
  selectedId: "",
  tables: [
    { id: "table-1", name: "一号桌", capacity: 12 },
    { id: "table-2", name: "二号桌", capacity: 10 },
    { id: "table-3", name: "三号桌", capacity: 8 }
  ],
  accessories: [
    { id: "acc-timer", name: "计时沙漏" },
    { id: "acc-dice", name: "骰子套装" },
    { id: "acc-score", name: "计分本" },
    { id: "acc-marker", name: "起始玩家标记" },
    { id: "acc-tray", name: "收纳托盘" }
  ],
  sessions: [],
  games: [
    {
      id: crypto.randomUUID(),
      name: "奥尔良",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 90,
      complexity: "中",
      lastPlayed: "2025-11-20",
      cover: "",
      components: { "acc-timer": 1, "acc-score": 1, "acc-tray": 2 },
      forgets: ["商站建造前先确认道路或水路连接", "袋中随从抽完后不是重洗弃堆，而是从已回袋内容继续抽"],
      disputes: ["事件顺序和玩家动作结算先后", "科技板是否能替代所有同类随从"],
      setup: ["按人数放置货物板块", "每位玩家拿起始随从、商人和个人板"],
      scoring: ["货物分数", "商站和市民乘区块", "金币和建筑剩余加分"]
    },
    {
      id: crypto.randomUUID(),
      name: "盖亚计划",
      minPlayers: 1,
      maxPlayers: 4,
      duration: 150,
      complexity: "重",
      lastPlayed: "2025-08-02",
      cover: "",
      components: { "acc-timer": 1, "acc-dice": 2, "acc-score": 1 },
      forgets: ["联邦连接时卫星数量和能量消耗要一起核对", "研究升到顶必须拿对应科技板限制"],
      disputes: ["被动充能是否能拒绝", "星球改造费用受哪些能力影响"],
      setup: ["随机终局计分板和回合得分板", "按种族设置起始资源和母星"],
      scoring: ["终局计分板", "科技轨排名", "联邦和建筑分"]
    },
    {
      id: crypto.randomUUID(),
      name: "花砖物语",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 45,
      complexity: "轻",
      lastPlayed: "2026-03-15",
      cover: "",
      components: { "acc-marker": 1, "acc-score": 1 },
      forgets: ["每轮结束先铺墙再补工厂展示区", "地板线扣分后清空对应砖"],
      disputes: ["同色砖放置限制是否看整面墙", "中央区起始玩家标记是否必须拿"],
      setup: ["按人数放工厂圆盘", "每个圆盘补4块砖"],
      scoring: ["横竖相邻即时分", "完整行列和颜色终局加分"]
    }
  ]
};

const sessionStatusText = { active: "进行中", frozen: "冻结缺件", ended: "已结束", canceled: "已取消" };

let state = loadState();
normalizeState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

let lastItemGameId = "";
let toastTimer = 0;

const els = {
  searchInput: document.querySelector("#searchInput"),
  playerFilter: document.querySelector("#playerFilter"),
  complexityFilter: document.querySelector("#complexityFilter"),
  sortMode: document.querySelector("#sortMode"),
  gameForm: document.querySelector("#gameForm"),
  nameInput: document.querySelector("#nameInput"),
  minPlayersInput: document.querySelector("#minPlayersInput"),
  maxPlayersInput: document.querySelector("#maxPlayersInput"),
  durationInput: document.querySelector("#durationInput"),
  complexityInput: document.querySelector("#complexityInput"),
  lastPlayedInput: document.querySelector("#lastPlayedInput"),
  coverInput: document.querySelector("#coverInput"),
  gameList: document.querySelector("#gameList"),
  detailView: document.querySelector("#detailView"),
  gameCount: document.querySelector("#gameCount"),
  ruleCount: document.querySelector("#ruleCount"),
  staleGame: document.querySelector("#staleGame"),
  visibleCount: document.querySelector("#visibleCount"),
  sessionForm: document.querySelector("#sessionForm"),
  sessionGameSelect: document.querySelector("#sessionGameSelect"),
  sessionTableSelect: document.querySelector("#sessionTableSelect"),
  sessionItemsInputs: document.querySelector("#sessionItemsInputs"),
  stationMessage: document.querySelector("#stationMessage"),
  stationSummary: document.querySelector("#stationSummary"),
  tableBoard: document.querySelector("#tableBoard"),
  accessoryBoard: document.querySelector("#accessoryBoard"),
  sessionBoard: document.querySelector("#sessionBoard"),
  historyBoard: document.querySelector("#historyBoard"),
  toast: document.querySelector("#toast")
};

// ===== 存档同步：本地读写与旧数据补全 =====
function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    return { ...structuredClone(defaultState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeState() {
  const presetComponents = Object.fromEntries(defaultState.games.map((game) => [game.name, game.components]));
  if (!Array.isArray(state.tables) || !state.tables.length) state.tables = structuredClone(defaultState.tables);
  if (!Array.isArray(state.accessories) || !state.accessories.length) {
    state.accessories = structuredClone(defaultState.accessories);
  }
  if (!Array.isArray(state.sessions)) state.sessions = [];
  for (const game of state.games) {
    if (!game.components || typeof game.components !== "object") {
      game.components = structuredClone(presetComponents[game.name] || {});
    }
  }
  state.sessions = state.sessions.filter(
    (session) =>
      state.games.some((game) => game.id === session.gameId) &&
      state.tables.some((table) => table.id === session.tableId)
  );
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

// ===== 占用判断：纯逻辑，不触碰 DOM =====
function isUnfinished(session) {
  return session.status === "active" || session.status === "frozen";
}

function getUnfinishedSessions() {
  return state.sessions.filter(isUnfinished);
}

function sessionTotalPieces(session) {
  return Object.values(session.items || {}).reduce((sum, qty) => sum + qty, 0);
}

function sanitizeItems(items) {
  const clean = {};
  for (const [accessoryId, qty] of Object.entries(items || {})) {
    const count = Math.max(0, Math.floor(Number(qty) || 0));
    if (count > 0) clean[accessoryId] = count;
  }
  return clean;
}

// 汇总未结束局的配件占用与桌位负荷，可排除某一局（用于该局自身改登记前自检）
function buildUsage(excludeSessionId = "") {
  const accessoryHolders = {};
  const tableLoads = {};
  for (const session of state.sessions) {
    if (!isUnfinished(session) || session.id === excludeSessionId) continue;
    tableLoads[session.tableId] = (tableLoads[session.tableId] || 0) + sessionTotalPieces(session);
    for (const [accessoryId, qty] of Object.entries(session.items || {})) {
      if (qty > 0) accessoryHolders[accessoryId] = session.id;
    }
  }
  return { accessoryHolders, tableLoads };
}

// 校验一批配件能否落到某桌位，返回拒绝原因列表（空数组表示通过）
function checkPlacement(items, tableId, excludeSessionId = "") {
  const reasons = [];
  const table = state.tables.find((item) => item.id === tableId);
  if (!table) reasons.push("桌位不存在");
  const { accessoryHolders, tableLoads } = buildUsage(excludeSessionId);
  for (const [accessoryId, qty] of Object.entries(items)) {
    if (qty <= 0) continue;
    if (accessoryHolders[accessoryId]) {
      reasons.push(`配件「${accessoryName(accessoryId)}」已被其他未结束局占用`);
    }
  }
  const incoming = Object.values(items).reduce((sum, qty) => sum + qty, 0);
  if (table) {
    const total = (tableLoads[tableId] || 0) + incoming;
    if (total > table.capacity) reasons.push(`桌位「${table.name}」件数超限（${total}/${table.capacity}）`);
  }
  return reasons;
}

// 全量重算未结束局，返回所有超限原因（用于改动游戏配件后的整体校验）
function findOccupancyConflicts() {
  const reasons = [];
  const holderByAccessory = {};
  const loadByTable = {};
  for (const session of getUnfinishedSessions()) {
    loadByTable[session.tableId] = (loadByTable[session.tableId] || 0) + sessionTotalPieces(session);
    for (const [accessoryId, qty] of Object.entries(session.items || {})) {
      if (qty <= 0) continue;
      if (holderByAccessory[accessoryId]) {
        reasons.push(`配件「${accessoryName(accessoryId)}」同时被多局占用`);
      } else {
        holderByAccessory[accessoryId] = session.id;
      }
    }
  }
  for (const table of state.tables) {
    const load = loadByTable[table.id] || 0;
    if (load > table.capacity) reasons.push(`桌位「${table.name}」件数超限（${load}/${table.capacity}）`);
  }
  return reasons;
}

function findMissingComponents(game, items) {
  const missing = [];
  for (const [accessoryId, required] of Object.entries(game?.components || {})) {
    const got = items[accessoryId] || 0;
    if (got < required) missing.push({ accessoryId, required, got });
  }
  return missing;
}

// 登记开局：任一项不满足则整局拒绝，原占用不变
function registerSession(gameId, tableId, rawItems) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return { ok: false, reasons: ["请选择要开局的游戏"] };
  const items = sanitizeItems(rawItems);
  const reasons = checkPlacement(items, tableId);
  if (reasons.length) return { ok: false, reasons };
  const missing = findMissingComponents(game, items);
  const session = {
    id: crypto.randomUUID(),
    gameId,
    tableId,
    items,
    status: missing.length ? "frozen" : "active",
    createdAt: new Date().toISOString()
  };
  state.sessions.unshift(session);
  return { ok: true, session, missing };
}

// 结束或取消：状态切换后即不再计入占用
function closeSession(sessionId, status) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session || !isUnfinished(session)) return { ok: false, reasons: ["该局已结束或已取消"] };
  session.status = status;
  session.closedAt = new Date().toISOString();
  return { ok: true, session };
}

// 冻结的缺件局重启：按游戏当前需求补齐缺件，校验不通过则保持冻结、占用不变
function restartSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session || session.status !== "frozen") return { ok: false, reasons: ["该局不在冻结状态"] };
  const game = state.games.find((item) => item.id === session.gameId);
  if (!game) return { ok: false, reasons: ["游戏已被删除"] };
  const items = { ...session.items };
  for (const [accessoryId, required] of Object.entries(game.components || {})) {
    items[accessoryId] = Math.max(items[accessoryId] || 0, required);
  }
  const reasons = checkPlacement(items, session.tableId, session.id);
  if (reasons.length) return { ok: false, reasons };
  session.items = items;
  session.status = "active";
  return { ok: true, session };
}

// 改动游戏配件：重算全部未结束局，任一超限则整组退回
function applyGameComponents(gameId, rawComponents) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return { ok: false, reasons: ["游戏不存在"] };
  const snapshot = { components: structuredClone(game.components), sessions: structuredClone(state.sessions) };
  const components = sanitizeItems(rawComponents);
  game.components = components;
  for (const session of state.sessions) {
    if (!isUnfinished(session) || session.gameId !== gameId) continue;
    session.items = { ...components };
    session.status = findMissingComponents(game, session.items).length ? "frozen" : "active";
  }
  const reasons = findOccupancyConflicts();
  if (reasons.length) {
    game.components = snapshot.components;
    state.sessions = snapshot.sessions;
    return { ok: false, reasons };
  }
  return { ok: true };
}

function gameName(id) {
  return state.games.find((game) => game.id === id)?.name || "已删除游戏";
}

function tableName(id) {
  return state.tables.find((table) => table.id === id)?.name || "未知桌位";
}

function accessoryName(id) {
  return state.accessories.find((item) => item.id === id)?.name || "未知配件";
}

function itemsText(items) {
  const entries = Object.entries(items || {}).filter(([, qty]) => qty > 0);
  return entries.length ? entries.map(([id, qty]) => `${accessoryName(id)}×${qty}`).join("、") : "无配件";
}

function missingText(missing) {
  return missing.map((item) => `${accessoryName(item.accessoryId)}缺${item.required - item.got}`).join("、");
}

function formatTime(iso) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// ===== 页面渲染 =====
function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getAllRules(game) {
  return [...game.forgets, ...game.disputes, ...game.setup, ...game.scoring];
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    const text = `${game.name}${getAllRules(game).join("")}`;
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesPlayer = player === "all" || (Number(player) >= game.minPlayers && Number(player) <= game.maxPlayers);
    const matchesComplexity = complexity === "all" || game.complexity === complexity;
    return matchesKeyword && matchesPlayer && matchesComplexity;
  });

  if (els.sortMode.value === "name") return games.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (els.sortMode.value === "complexity") {
    const rank = { 轻: 1, 中: 2, 重: 3 };
    return games.sort((a, b) => rank[b.complexity] - rank[a.complexity]);
  }
  return games.sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed));
}

function renderSummary() {
  const allRuleCount = state.games.reduce((sum, game) => sum + getAllRules(game).length, 0);
  const stale = [...state.games].sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed))[0];
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
}

function renderList() {
  const games = getFilteredGames();
  els.visibleCount.textContent = `${games.length}个匹配`;
  els.gameList.innerHTML =
    games
      .map((game) => {
        const selected = game.id === state.selectedId ? "selected" : "";
        return `
          <article class="game-card ${selected}" data-game-id="${game.id}">
            <div class="cover">
              ${
                game.cover
                  ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />`
                  : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`
              }
              <span class="stale-ribbon">${daysSince(game.lastPlayed)}天未玩</span>
            </div>
            <div class="game-body">
              <h3>${escapeHtml(game.name)}</h3>
              <div class="game-meta">
                <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
                <span class="pill">${game.duration}分钟</span>
                <span class="pill heavy">${escapeHtml(game.complexity)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的桌游。</p>`;
}

function renderDetail() {
  const game = state.games.find((item) => item.id === state.selectedId) || state.games[0];
  if (!game) {
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;
  els.detailView.innerHTML = `
    <div class="quick-card">
      <div class="detail-cover">
        ${game.cover ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />` : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`}
      </div>
      <div>
        <h2>${escapeHtml(game.name)}</h2>
        <div class="game-meta">
          <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
          <span class="pill">${game.duration}分钟</span>
          <span class="pill heavy">${escapeHtml(game.complexity)}</span>
          <span class="pill">${daysSince(game.lastPlayed)}天未玩</span>
        </div>
      </div>
      ${renderRuleSection("容易忘的规则", "forgets", game.forgets)}
      ${renderRuleSection("常见争议", "disputes", game.disputes)}
      ${renderRuleSection("开局准备", "setup", game.setup)}
      ${renderRuleSection("计分提醒", "scoring", game.scoring)}
      ${renderComponentSection(game)}
      <form class="add-rule" id="ruleForm">
        <select id="ruleTypeInput">
          <option value="forgets">容易忘的规则</option>
          <option value="disputes">常见争议</option>
          <option value="setup">开局准备</option>
          <option value="scoring">计分提醒</option>
        </select>
        <textarea id="ruleTextInput" rows="3" placeholder="补充一条聚会前要看的提醒" required></textarea>
        <button class="primary" type="submit">加入规则卡片</button>
      </form>
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function renderRuleSection(title, key, items) {
  return `
    <section class="rule-section">
      <h3>${title}</h3>
      <ul class="rule-list">
        ${
          items
            .map(
              (item, index) => `
                <li>
                  <span>${escapeHtml(item)}</span>
                  <button type="button" title="删除" data-rule-key="${key}" data-rule-index="${index}">×</button>
                </li>
              `
            )
            .join("") || `<li><span>暂无内容。</span></li>`
        }
      </ul>
    </section>
  `;
}

function renderComponentSection(game) {
  if (!state.accessories.length) return "";
  const rows = state.accessories
    .map(
      (accessory) => `
        <label class="component-row">
          <span>${escapeHtml(accessory.name)}</span>
          <input type="number" min="0" max="99" value="${game.components?.[accessory.id] || 0}" data-component-id="${accessory.id}" />
        </label>
      `
    )
    .join("");
  return `
    <section class="rule-section">
      <h3>开局配件需求</h3>
      <form id="componentForm" class="component-form">
        ${rows}
        <button class="primary" type="submit">保存配件改动</button>
        <p class="component-hint">保存后会重算全部未结束局，任一超限将整组退回。</p>
      </form>
    </section>
  `;
}

function renderStationSummary() {
  const unfinished = getUnfinishedSessions();
  const frozen = unfinished.filter((session) => session.status === "frozen").length;
  const { accessoryHolders } = buildUsage();
  els.stationSummary.textContent = `未结束${unfinished.length}局 · 冻结${frozen}局 · 配件占用${Object.keys(accessoryHolders).length}/${state.accessories.length}`;
}

function renderSessionForm() {
  const prevGame = els.sessionGameSelect.value;
  const prevTable = els.sessionTableSelect.value;
  els.sessionGameSelect.innerHTML = state.games
    .map((game) => `<option value="${game.id}">${escapeHtml(game.name)}</option>`)
    .join("");
  els.sessionGameSelect.value = state.games.some((game) => game.id === prevGame) ? prevGame : state.games[0]?.id || "";
  const { tableLoads } = buildUsage();
  els.sessionTableSelect.innerHTML = state.tables
    .map((table) => {
      const load = tableLoads[table.id] || 0;
      return `<option value="${table.id}">${escapeHtml(table.name)}（已占${load}/${table.capacity}件）</option>`;
    })
    .join("");
  els.sessionTableSelect.value = state.tables.some((table) => table.id === prevTable) ? prevTable : state.tables[0]?.id || "";
  if (els.sessionGameSelect.value !== lastItemGameId) {
    lastItemGameId = els.sessionGameSelect.value;
    renderItemInputs();
  }
}

function renderItemInputs() {
  const game = state.games.find((item) => item.id === lastItemGameId);
  els.sessionItemsInputs.innerHTML = state.accessories
    .map((accessory) => {
      const required = game?.components?.[accessory.id] || 0;
      return `
        <label class="item-field">
          <span>${escapeHtml(accessory.name)}${required ? `（需${required}）` : ""}</span>
          <input type="number" min="0" max="99" value="${required}" data-item-id="${accessory.id}" />
        </label>
      `;
    })
    .join("");
}

function renderTableBoard() {
  const { tableLoads } = buildUsage();
  const unfinished = getUnfinishedSessions();
  els.tableBoard.innerHTML = state.tables
    .map((table) => {
      const load = tableLoads[table.id] || 0;
      const percent = Math.min(100, Math.round((load / table.capacity) * 100));
      const rows = unfinished
        .filter((session) => session.tableId === table.id)
        .map((session) => `<li>${escapeHtml(gameName(session.gameId))} · ${sessionStatusText[session.status]}</li>`)
        .join("");
      return `
        <article class="table-card">
          <div class="table-head"><strong>${escapeHtml(table.name)}</strong><span>${load}/${table.capacity}件</span></div>
          <div class="meter"><span style="width:${percent}%"></span></div>
          <ul>${rows || "<li>空闲</li>"}</ul>
        </article>
      `;
    })
    .join("");
}

function renderAccessoryBoard() {
  const { accessoryHolders } = buildUsage();
  els.accessoryBoard.innerHTML = state.accessories
    .map((accessory) => {
      const holder = state.sessions.find((session) => session.id === accessoryHolders[accessory.id]);
      const status = holder ? `${escapeHtml(gameName(holder.gameId))} · ${escapeHtml(tableName(holder.tableId))}` : "空闲";
      return `<li class="${holder ? "busy" : "free"}"><span>${escapeHtml(accessory.name)}</span><em>${status}</em></li>`;
    })
    .join("");
}

function renderSessionBoard() {
  const unfinished = getUnfinishedSessions();
  els.sessionBoard.innerHTML =
    unfinished
      .map((session) => {
        const game = state.games.find((item) => item.id === session.gameId);
        const missing = findMissingComponents(game, session.items);
        const actions =
          session.status === "frozen"
            ? `<button type="button" data-action="restart" data-session-id="${session.id}">重启</button>
               <button type="button" data-action="cancel" data-session-id="${session.id}">取消</button>`
            : `<button type="button" data-action="end" data-session-id="${session.id}">结束</button>
               <button type="button" data-action="cancel" data-session-id="${session.id}">取消</button>`;
        return `
          <article class="session-card ${session.status}">
            <div class="session-head">
              <strong>${escapeHtml(gameName(session.gameId))}</strong>
              <span class="pill status-${session.status}">${sessionStatusText[session.status]}</span>
            </div>
            <p>${escapeHtml(tableName(session.tableId))} · ${formatTime(session.createdAt)}开局</p>
            <p>配件：${escapeHtml(itemsText(session.items))}</p>
            ${missing.length ? `<p class="missing">缺件：${escapeHtml(missingText(missing))}</p>` : ""}
            <div class="session-actions">${actions}</div>
          </article>
        `;
      })
      .join("") || `<p class="empty">当前没有未结束的局。</p>`;
}

function renderHistoryBoard() {
  const history = state.sessions.filter((session) => !isUnfinished(session));
  els.historyBoard.innerHTML =
    history
      .map(
        (session) => `
          <p class="history-item">
            <span class="pill status-${session.status}">${sessionStatusText[session.status]}</span>
            ${escapeHtml(gameName(session.gameId))} · ${escapeHtml(tableName(session.tableId))} · ${formatTime(session.createdAt)}
          </p>
        `
      )
      .join("") || `<p class="empty">暂无历史局。</p>`;
}

function renderStation() {
  renderStationSummary();
  renderSessionForm();
  renderTableBoard();
  renderAccessoryBoard();
  renderSessionBoard();
  renderHistoryBoard();
}

function renderAll() {
  saveState();
  renderSummary();
  renderList();
  renderDetail();
  renderStation();
}

// ===== 页面事件 =====
function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addGame(event) {
  event.preventDefault();
  const minPlayers = Number(els.minPlayersInput.value);
  const maxPlayers = Math.max(minPlayers, Number(els.maxPlayersInput.value));
  const cover = await readFileAsDataUrl(els.coverInput.files[0]);
  const game = {
    id: crypto.randomUUID(),
    name: els.nameInput.value.trim(),
    minPlayers,
    maxPlayers,
    duration: Number(els.durationInput.value),
    complexity: els.complexityInput.value,
    lastPlayed: els.lastPlayedInput.value,
    cover,
    components: {},
    forgets: ["本局开始前先补充容易忘的规则。"],
    disputes: [],
    setup: ["整理组件并按人数调整初始设置。"],
    scoring: ["确认终局计分项和即时得分项。"]
  };
  state.games.unshift(game);
  state.selectedId = game.id;
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStationMessage(text, ok) {
  els.stationMessage.textContent = text;
  els.stationMessage.className = `station-message ${ok ? "ok" : "error"}`;
}

function showToast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 4500);
}

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  state.selectedId = card.dataset.gameId;
  renderAll();
});

els.detailView.addEventListener("submit", (event) => {
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (event.target.id === "ruleForm") {
    event.preventDefault();
    const key = document.querySelector("#ruleTypeInput").value;
    const text = document.querySelector("#ruleTextInput").value.trim();
    if (!text) return;
    game[key].push(text);
    renderAll();
  }

  if (event.target.id === "componentForm") {
    event.preventDefault();
    const next = {};
    event.target.querySelectorAll("[data-component-id]").forEach((input) => {
      next[input.dataset.componentId] = Number(input.value);
    });
    const result = applyGameComponents(game.id, next);
    showToast(result.ok ? "配件需求已保存，未结束局已重算。" : `已整组退回：\n${result.reasons.join("\n")}`);
    renderAll();
  }
});

els.detailView.addEventListener("click", (event) => {
  const ruleButton = event.target.closest("[data-rule-key]");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (ruleButton) {
    const key = ruleButton.dataset.ruleKey;
    const index = Number(ruleButton.dataset.ruleIndex);
    game[key].splice(index, 1);
    renderAll();
  }

  if (playedButton) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
  }

  if (deleteButton) {
    if (state.sessions.some((session) => session.gameId === game.id && isUnfinished(session))) {
      showToast("该游戏还有未结束局，先结束或取消后再删除。");
      return;
    }
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    renderAll();
  }
});

els.sessionGameSelect.addEventListener("change", () => {
  lastItemGameId = els.sessionGameSelect.value;
  renderItemInputs();
});

els.sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const gameId = els.sessionGameSelect.value;
  const tableId = els.sessionTableSelect.value;
  const items = {};
  els.sessionItemsInputs.querySelectorAll("[data-item-id]").forEach((input) => {
    items[input.dataset.itemId] = Number(input.value);
  });
  const result = registerSession(gameId, tableId, items);
  if (!result.ok) {
    setStationMessage(`整局拒绝：${result.reasons.join("；")}`, false);
    return;
  }
  if (result.missing.length) {
    setStationMessage(`已登记为缺件局并冻结，缺：${missingText(result.missing)}。配件空出后点“重启”补齐。`, true);
  } else {
    setStationMessage("开局登记成功，配件已占用。", true);
  }
  renderItemInputs();
  renderAll();
});

els.sessionBoard.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, sessionId } = button.dataset;

  if (action === "end" || action === "cancel") {
    closeSession(sessionId, action === "end" ? "ended" : "canceled");
    setStationMessage(action === "end" ? "该局已结束，配件与桌位已释放。" : "该局已取消，配件与桌位已释放。", true);
  }

  if (action === "restart") {
    const result = restartSession(sessionId);
    setStationMessage(
      result.ok ? "缺件已补齐，该局重启为进行中。" : `重启失败：${result.reasons.join("；")}`,
      result.ok
    );
  }

  renderAll();
});

setDefaultDate();
renderAll();
