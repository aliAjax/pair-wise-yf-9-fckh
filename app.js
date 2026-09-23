const today = new Date();

let state = Store.load();
if (!state.selectedId || !state.games.some((game) => game.id === state.selectedId)) {
  state.selectedId = state.games[0]?.id || "";
}

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
  sessionPartsRows: document.querySelector("#sessionPartsRows"),
  sessionTotal: document.querySelector("#sessionTotal"),
  sessionMessage: document.querySelector("#sessionMessage"),
  openSessionBtn: document.querySelector("#openSessionBtn"),
  shortageBtn: document.querySelector("#shortageBtn"),
  deskSummary: document.querySelector("#deskSummary"),
  tableBoard: document.querySelector("#tableBoard"),
  componentBoard: document.querySelector("#componentBoard"),
  sessionBoard: document.querySelector("#sessionBoard"),
  historyBoard: document.querySelector("#historyBoard"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn")
};

// 配件编辑器的本地草稿：切换游戏才重建，校验失败也不丢编辑内容
let requirementDraft = null;
let requirementDraftGameId = "";
// 开局表单当前选中的游戏：仅切换游戏时重建配件行
let formGameId = "";

// ---------- 基础工具 ----------

function findGame(gameId) {
  return state.games.find((game) => game.id === gameId);
}

function findTable(tableId) {
  return state.tables.find((table) => table.id === tableId);
}

function findComponent(componentId) {
  return state.components.find((component) => component.id === componentId);
}

function gameName(gameId) {
  return findGame(gameId)?.name || "已删除的游戏";
}

function tableName(tableId) {
  return findTable(tableId)?.name || "已撤桌位";
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getAllRules(game) {
  return [...game.forgets, ...game.disputes, ...game.setup, ...game.scoring];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(isoString) {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setMessage(element, text, kind) {
  element.textContent = text || "";
  element.className = `desk-message${kind ? ` ${kind}` : ""}`;
}

function describeIssue(issue) {
  if (issue.kind === "component") {
    return `${findComponent(issue.componentId)?.name || "配件"}占用 ${issue.used}/${issue.total}，超 ${issue.over} 件`;
  }
  return `${tableName(issue.tableId)}件数 ${issue.used}/${issue.capacity}，超 ${issue.over} 件`;
}

// ---------- 收藏筛选与卡片（原有功能） ----------

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
  // 重绘前把当前游戏编辑器里未保存的草稿同步下来，避免其他操作触发重绘时丢输入
  if (requirementDraftGameId && requirementDraftGameId === state.selectedId) {
    syncRequirementDraftFromDom();
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
      <section class="rule-section requirements-section">
        <h3>开局配件方案</h3>
        <p class="section-hint">改动保存后，该游戏全部未结束局按新方案重算；任一局超限则整组退回。</p>
        <div id="requirementsEditor"></div>
        <p class="desk-message" id="detailMessage" role="status"></p>
      </section>
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
  renderRequirementsEditor();
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

// ---------- 游戏配件方案编辑器 ----------

function getRequirementDraft() {
  if (requirementDraftGameId !== state.selectedId || !requirementDraft) {
    const game = findGame(state.selectedId);
    requirementDraft = (game?.components || []).map((row) => ({ ...row }));
    requirementDraftGameId = state.selectedId;
  }
  return requirementDraft;
}

function renderRequirementsEditor() {
  const editor = document.querySelector("#requirementsEditor");
  if (!editor) return;
  const draft = getRequirementDraft();
  editor.innerHTML = `
    <div class="req-rows">
      ${draft
        .map(
          (row, index) => `
        <div class="req-row" data-req-index="${index}">
          <select data-req-field="componentId">
            <option value="">选择配件</option>
            ${state.components
              .map(
                (component) =>
                  `<option value="${component.id}" ${component.id === row.componentId ? "selected" : ""}>${escapeHtml(component.name)}（共${component.total}）</option>`
              )
              .join("")}
          </select>
          <input type="number" min="1" step="1" value="${row.qty}" data-req-field="qty" aria-label="数量" />
          <button type="button" data-req-action="remove" title="移除该配件">×</button>
        </div>`
        )
        .join("")}
    </div>
    <div class="req-actions">
      <button type="button" data-req-action="add">添加配件</button>
      <button class="primary" type="button" data-req-action="save">保存方案并重算</button>
    </div>
  `;
}

function syncRequirementDraftFromDom() {
  const editor = document.querySelector("#requirementsEditor");
  if (!editor) return;
  requirementDraft = [...editor.querySelectorAll(".req-row")].map((row) => ({
    componentId: row.querySelector('[data-req-field="componentId"]').value,
    qty: row.querySelector('[data-req-field="qty"]').value
  }));
  requirementDraftGameId = state.selectedId;
}

function saveRequirements() {
  syncRequirementDraftFromDom();
  const message = document.querySelector("#detailMessage");
  const draft = getRequirementDraft();

  if (draft.some((row) => !row.componentId)) {
    setMessage(message, "有配件行没有选择配件。", "error");
    return;
  }
  const invalidQty = draft.some((row) => {
    const qty = Math.floor(Number(row.qty));
    return !Number.isInteger(qty) || qty <= 0;
  });
  if (invalidQty) {
    setMessage(message, "配件数量必须是正整数。", "error");
    return;
  }

  const plan = Occupancy.planGameRequirements(state, state.selectedId, draft);
  if (!plan.ok) {
    // 任一未结束局超限：整组退回，游戏方案和占用都不变
    setMessage(message, `方案已退回：${plan.issues.map(describeIssue).join("；")}`, "error");
    return;
  }

  state.games = plan.games;
  state.sessions = plan.sessions;
  requirementDraft = null;
  renderAll();
  setMessage(document.querySelector("#detailMessage"), `方案已保存，${plan.recalculated} 个未结束局已重算。`, "ok");
}

// ---------- 开局配件占用台 ----------

function syncSessionSelects() {
  const keepGame = els.sessionGameSelect.value;
  els.sessionGameSelect.innerHTML = state.games
    .map((game) => `<option value="${game.id}">${escapeHtml(game.name)}</option>`)
    .join("");
  const desiredGameId =
    (keepGame && findGame(keepGame) && keepGame) ||
    (findGame(state.selectedId) && state.selectedId) ||
    state.games[0]?.id ||
    "";
  els.sessionGameSelect.value = desiredGameId;

  const keepTable = els.sessionTableSelect.value;
  els.sessionTableSelect.innerHTML = state.tables
    .map((table) => `<option value="${table.id}">${escapeHtml(table.name)}（限${table.capacity}件）</option>`)
    .join("");
  els.sessionTableSelect.value = (keepTable && findTable(keepTable) && keepTable) || state.tables[0]?.id || "";

  if (formGameId !== desiredGameId) {
    formGameId = desiredGameId;
    rebuildSessionPartsRows();
  }
  updateSessionTotal();
}

function rebuildSessionPartsRows() {
  const game = findGame(formGameId);
  const rows = game?.components || [];
  els.sessionPartsRows.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
        <label class="parts-row">
          <span>${escapeHtml(findComponent(row.componentId)?.name || "配件")}</span>
          <input type="number" min="0" step="1" value="${row.qty}" data-part-id="${row.componentId}" />
        </label>`
        )
        .join("")
    : `<p class="empty">该游戏还没有配件方案，可在右侧详情的“开局配件方案”里添加。</p>`;
}

function readSessionRequests() {
  const requests = {};
  for (const input of els.sessionPartsRows.querySelectorAll("[data-part-id]")) {
    const qty = Math.floor(Number(input.value));
    if (Number.isInteger(qty) && qty > 0) requests[input.dataset.partId] = qty;
  }
  return requests;
}

function updateSessionTotal() {
  const requests = readSessionRequests();
  const total = Object.values(requests).reduce((sum, qty) => sum + qty, 0);
  const table = findTable(els.sessionTableSelect.value);
  els.sessionTotal.textContent = table ? `合计 ${total} 件 · ${escapeHtml(table.name)}限 ${table.capacity} 件` : "合计 0 件";
}

function renderDeskSummary() {
  const active = state.sessions.filter((session) => session.status === Occupancy.ACTIVE).length;
  const frozen = state.sessions.filter((session) => session.status === Occupancy.FROZEN).length;
  const history = state.sessions.filter((session) => !Occupancy.isUnfinished(session)).length;
  els.deskSummary.innerHTML = `
    <span class="desk-stat"><b>${active}</b> 进行中</span>
    <span class="desk-stat frozen"><b>${frozen}</b> 缺件冻结</span>
    <span class="desk-stat"><b>${history}</b> 历史</span>
  `;
}

function renderTableBoard() {
  els.tableBoard.innerHTML = state.tables
    .map((table) => {
      const used = Occupancy.tablePieces(state.sessions, table.id);
      const over = used > table.capacity;
      const activeHere = state.sessions.filter(
        (session) => session.status === Occupancy.ACTIVE && session.tableId === table.id
      );
      const frozenHere = state.sessions.filter(
        (session) => session.status === Occupancy.FROZEN && session.tableId === table.id
      );
      const percent = Math.min(100, Math.round((used / table.capacity) * 100));
      return `
        <article class="desk-card ${over ? "over" : ""}">
          <div class="desk-card-head">
            <strong>${escapeHtml(table.name)}</strong>
            <span class="quota ${over ? "over" : ""}">${used}/${table.capacity} 件</span>
          </div>
          <div class="meter"><span style="width:${percent}%"></span></div>
          <ul class="occupant-list">
            ${
              activeHere
                .map(
                  (session) =>
                    `<li>${escapeHtml(gameName(session.gameId))} · ${Occupancy.requestPieces(session.requests)} 件</li>`
                )
                .join("") || `<li class="muted">暂无进行中局</li>`
            }
            ${frozenHere
              .map(
                (session) =>
                  `<li class="muted">冻结中：${escapeHtml(gameName(session.gameId))}（不占用）</li>`
              )
              .join("")}
          </ul>
        </article>`;
    })
    .join("");
}

function renderComponentBoard() {
  const usage = Occupancy.usageByComponent(state.sessions);
  els.componentBoard.innerHTML = state.components
    .map((component) => {
      const used = usage.get(component.id) || 0;
      const over = used > component.total;
      const percent = Math.min(100, Math.round((used / component.total) * 100));
      return `
        <article class="desk-card ${over ? "over" : ""}">
          <div class="desk-card-head">
            <strong>${escapeHtml(component.name)}</strong>
            <span class="quota ${over ? "over" : ""}">${used}/${component.total}</span>
          </div>
          <div class="meter"><span style="width:${percent}%"></span></div>
        </article>`;
    })
    .join("");
}

function partsChips(requests) {
  const entries = Object.entries(requests || {});
  if (!entries.length) return `<span class="muted">无配件</span>`;
  return entries
    .map(([componentId, qty]) => `<span class="chip">${escapeHtml(findComponent(componentId)?.name || "配件")} ×${qty}</span>`)
    .join("");
}

function renderSessionCard(session) {
  const frozen = session.status === Occupancy.FROZEN;
  return `
    <article class="session-card ${frozen ? "frozen" : ""}" data-session-id="${session.id}">
      <div class="desk-card-head">
        <strong>${escapeHtml(gameName(session.gameId))}</strong>
        <span class="status-pill ${frozen ? "frozen" : "active"}">${frozen ? "缺件冻结" : "进行中"}</span>
      </div>
      <p class="session-line">${escapeHtml(tableName(session.tableId))} · 合计 ${Occupancy.requestPieces(session.requests)} 件</p>
      <div class="chip-row">${partsChips(session.requests)}</div>
      <p class="session-line muted">登记于 ${formatTime(session.createdAt)}${frozen && session.frozenReason ? ` · ${escapeHtml(session.frozenReason)}` : ""}</p>
      <div class="session-card-actions">
        ${
          frozen
            ? `<button type="button" class="primary" data-session-action="restart">重启占用</button>
               <button type="button" data-session-action="cancel">取消</button>`
            : `<button type="button" class="primary" data-session-action="finish">结束</button>
               <button type="button" data-session-action="freeze">登记缺件冻结</button>
               <button type="button" data-session-action="cancel">取消</button>`
        }
      </div>
    </article>`;
}

function renderSessionBoard() {
  const unfinished = state.sessions.filter((session) => Occupancy.isUnfinished(session));
  els.sessionBoard.innerHTML = unfinished.length
    ? unfinished
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(renderSessionCard)
        .join("")
    : `<p class="empty">暂无未结束局。</p>`;
}

function renderHistoryBoard() {
  const history = state.sessions
    .filter((session) => !Occupancy.isUnfinished(session))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
  els.historyBoard.innerHTML = history.length
    ? history
        .map((session) => {
          const finished = session.status === Occupancy.FINISHED;
          return `
            <div class="history-item">
              <span class="status-pill ${finished ? "finished" : "cancelled"}">${finished ? "已结束" : "已取消"}</span>
              <strong>${escapeHtml(gameName(session.gameId))}</strong>
              <span class="muted">${escapeHtml(tableName(session.tableId))} · ${Occupancy.requestPieces(session.requests)} 件</span>
              <time>${formatTime(session.endedAt)}</time>
            </div>`;
        })
        .join("")
    : `<p class="empty">还没有结束或取消的局。</p>`;
}

function renderDesk() {
  syncSessionSelects();
  renderDeskSummary();
  renderTableBoard();
  renderComponentBoard();
  renderSessionBoard();
  renderHistoryBoard();
}

function renderAll() {
  Store.save(state);
  renderSummary();
  renderList();
  renderDetail();
  renderDesk();
}

// ---------- 表单与新增游戏 ----------

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
    components: [],
    forgets: ["本局开始前先补充容易忘的规则。"],
    disputes: [],
    setup: ["整理组件并按人数调整初始设置。"],
    scoring: ["确认终局计分项和即时得分项。"]
  };
  state.games.unshift(game);
  state.selectedId = game.id;
  requirementDraft = null;
  requirementDraftGameId = "";
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

// ---------- 事件 ----------

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
  if (event.target.id !== "ruleForm") return;
  event.preventDefault();
  const game = findGame(state.selectedId);
  if (!game) return;
  const key = document.querySelector("#ruleTypeInput").value;
  const text = document.querySelector("#ruleTextInput").value.trim();
  if (!text) return;
  game[key].push(text);
  renderAll();
});

els.detailView.addEventListener("click", (event) => {
  const ruleButton = event.target.closest("[data-rule-key]");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");
  const reqAction = event.target.closest("[data-req-action]");
  const game = findGame(state.selectedId);

  if (reqAction) {
    const action = reqAction.dataset.reqAction;
    if (action === "add") {
      syncRequirementDraftFromDom();
      getRequirementDraft().push({ componentId: "", qty: 1 });
      renderRequirementsEditor();
    }
    if (action === "remove") {
      syncRequirementDraftFromDom();
      const row = reqAction.closest(".req-row");
      getRequirementDraft().splice(Number(row.dataset.reqIndex), 1);
      renderRequirementsEditor();
    }
    if (action === "save") {
      saveRequirements();
    }
    return;
  }

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
    if (Occupancy.hasUnfinishedForGame(state, game.id)) {
      setMessage(
        document.querySelector("#detailMessage"),
        "该游戏还有未结束局，先结束、取消或重启完成后再删除。",
        "error"
      );
      return;
    }
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    requirementDraft = null;
    requirementDraftGameId = "";
    renderAll();
  }
});

// 开局表单：切换游戏/桌位只更新表单，不触碰占用
els.sessionGameSelect.addEventListener("change", () => {
  formGameId = els.sessionGameSelect.value;
  rebuildSessionPartsRows();
  setMessage(els.sessionMessage, "");
  updateSessionTotal();
});

els.sessionTableSelect.addEventListener("change", () => {
  setMessage(els.sessionMessage, "");
  updateSessionTotal();
});

els.sessionPartsRows.addEventListener("input", updateSessionTotal);

function submitOpen(isShortage) {
  const gameId = els.sessionGameSelect.value;
  const tableId = els.sessionTableSelect.value;
  const input = { gameId, tableId, requests: readSessionRequests() };

  if (!findGame(gameId) || !findTable(tableId)) {
    setMessage(els.sessionMessage, "请先选择游戏和桌位。", "error");
    return;
  }
  if (!Object.keys(input.requests).length) {
    setMessage(els.sessionMessage, "请至少登记一种配件的数量（缺件局也要登记所需数量）。", "error");
    return;
  }

  if (isShortage) {
    const result = Occupancy.registerShortage(state, input);
    if (!result.ok) {
      setMessage(els.sessionMessage, "缺件局登记失败：游戏或桌位不存在。", "error");
      return;
    }
    state.sessions = result.sessions;
    renderAll();
    setMessage(els.sessionMessage, "缺件局已登记并冻结，重启前不占用配件和桌位。", "warn");
    return;
  }

  const plan = Occupancy.planOpen(state, input);
  if (!plan.ok) {
    // 整局拒绝，现有占用保持不变
    setMessage(els.sessionMessage, `开局被拒：${plan.issues.map(describeIssue).join("；")}`, "error");
    return;
  }
  state.sessions = plan.sessions;
  renderAll();
  setMessage(els.sessionMessage, "开局成功，配件与桌位已占用。", "ok");
}

els.sessionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitOpen(false);
});

els.shortageBtn.addEventListener("click", () => submitOpen(true));

// 未结束局操作
els.sessionBoard.addEventListener("click", (event) => {
  const button = event.target.closest("[data-session-action]");
  if (!button) return;
  const card = button.closest("[data-session-id]");
  const sessionId = card?.dataset.sessionId;
  const action = button.dataset.sessionAction;

  if (action === "finish") {
    state.sessions = Occupancy.finish(state, sessionId).sessions;
    renderAll();
  } else if (action === "cancel") {
    state.sessions = Occupancy.cancel(state, sessionId).sessions;
    renderAll();
  } else if (action === "freeze") {
    state.sessions = Occupancy.freeze(state, sessionId).sessions;
    renderAll();
  } else if (action === "restart") {
    const plan = Occupancy.planRestart(state, sessionId);
    if (!plan.ok) {
      renderAll();
      setMessage(
        els.sessionMessage,
        `重启失败，继续冻结：${plan.issues.map(describeIssue).join("；")}`,
        "error"
      );
      return;
    }
    state.sessions = plan.sessions;
    renderAll();
    setMessage(els.sessionMessage, "冻结局已重启，配件与桌位重新占用。", "ok");
  }
});

els.clearHistoryBtn.addEventListener("click", () => {
  state.sessions = state.sessions.filter((session) => Occupancy.isUnfinished(session));
  renderAll();
});

setDefaultDate();
renderAll();
