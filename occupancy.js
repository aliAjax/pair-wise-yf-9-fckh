"use strict";

// 占用判断层：只处理纯数据规则，不碰 DOM 和 localStorage。
// 所有"可能被拒"的操作都返回计划结果，校验失败时不改动入参，由页面层决定是否提交。
const Occupancy = (() => {
  const ACTIVE = "active"; // 进行中：占用共用配件和桌位件数
  const FROZEN = "frozen"; // 缺件冻结：登记在册但不占用，等待重启
  const FINISHED = "finished"; // 已结束：已释放
  const CANCELLED = "cancelled"; // 已取消：已释放

  const UNFINISHED = new Set([ACTIVE, FROZEN]);

  function isUnfinished(session) {
    return !!session && UNFINISHED.has(session.status);
  }

  function activeSessions(sessions) {
    return (sessions || []).filter((session) => session.status === ACTIVE);
  }

  function requestPieces(requests) {
    return Object.values(requests || {}).reduce((sum, qty) => {
      const value = Number(qty);
      return sum + (Number.isInteger(value) && value > 0 ? value : 0);
    }, 0);
  }

  // 某种共用配件被所有进行中局占用的数量
  function usageByComponent(sessions) {
    const usage = new Map();
    for (const session of activeSessions(sessions)) {
      for (const [componentId, qty] of Object.entries(session.requests || {})) {
        usage.set(componentId, (usage.get(componentId) || 0) + qty);
      }
    }
    return usage;
  }

  // 某桌位上所有进行中局的总件数
  function tablePieces(sessions, tableId) {
    return activeSessions(sessions)
      .filter((session) => session.tableId === tableId)
      .reduce((sum, session) => sum + requestPieces(session.requests), 0);
  }

  // 核心校验：给定一版局列表，找出全部超限项（配件池 / 桌位件数）
  function inspect(state, sessions = state.sessions) {
    const issues = [];
    const usage = usageByComponent(sessions);

    for (const component of state.components || []) {
      const used = usage.get(component.id) || 0;
      if (used > component.total) {
        issues.push({
          kind: "component",
          componentId: component.id,
          used,
          total: component.total,
          over: used - component.total
        });
      }
    }

    for (const table of state.tables || []) {
      const used = tablePieces(sessions, table.id);
      if (used > table.capacity) {
        issues.push({
          kind: "table",
          tableId: table.id,
          used,
          capacity: table.capacity,
          over: used - table.capacity
        });
      }
    }

    return issues;
  }

  // 把表单/编辑器的配件行归一化成去重的正整数清单
  function normalizeRows(rows, validComponentIds) {
    const map = new Map();
    for (const row of rows || []) {
      const qty = Math.floor(Number(row.qty));
      if (!validComponentIds.has(row.componentId) || qty <= 0) continue;
      map.set(row.componentId, qty); // 同一配件重复时以最后一行为准
    }
    return [...map.entries()].map(([componentId, qty]) => ({ componentId, qty }));
  }

  // 开局/局内登记的配件数量映射，只保留合法配件上的正整数
  function normalizeRequests(requests, validComponentIds) {
    const result = {};
    for (const [componentId, rawQty] of Object.entries(requests || {})) {
      const qty = Math.floor(Number(rawQty));
      if (validComponentIds.has(componentId) && qty > 0) result[componentId] = qty;
    }
    return result;
  }

  function nowText() {
    return new Date().toISOString();
  }

  // 开局：配件被其他进行中局占满或桌位件数超限时，整局拒绝，原占用不变
  function planOpen(state, input) {
    const game = (state.games || []).find((item) => item.id === input.gameId);
    const table = (state.tables || []).find((item) => item.id === input.tableId);
    if (!game || !table) return { ok: false, issues: [] };

    const session = {
      id: crypto.randomUUID(),
      gameId: game.id,
      tableId: table.id,
      requests: normalizeRequests(input.requests, new Set((state.components || []).map((item) => item.id))),
      status: ACTIVE,
      frozenReason: "",
      createdAt: nowText(),
      endedAt: ""
    };

    const prospect = [...state.sessions, session];
    const issues = inspect(state, prospect);
    return issues.length ? { ok: false, issues } : { ok: true, session, sessions: prospect };
  }

  // 缺件局登记：明知缺件也要登记，直接冻结，不占用任何资源
  function registerShortage(state, input) {
    const game = (state.games || []).find((item) => item.id === input.gameId);
    const table = (state.tables || []).find((item) => item.id === input.tableId);
    if (!game || !table) return { ok: false };

    const session = {
      id: crypto.randomUUID(),
      gameId: game.id,
      tableId: table.id,
      requests: normalizeRequests(input.requests, new Set((state.components || []).map((item) => item.id))),
      status: FROZEN,
      frozenReason: "开局缺件登记",
      createdAt: nowText(),
      endedAt: ""
    };

    return { ok: true, session, sessions: [...state.sessions, session] };
  }

  // 重启冻结局：按原登记数量重新尝试占用，失败则继续冻结
  function planRestart(state, sessionId) {
    const index = state.sessions.findIndex((session) => session.id === sessionId);
    const current = state.sessions[index];
    if (!current || current.status !== FROZEN) return { ok: false, issues: [] };

    const revived = { ...current, status: ACTIVE, frozenReason: "" };
    const prospect = state.sessions.map((session, i) => (i === index ? revived : session));
    const issues = inspect(state, prospect);
    return issues.length ? { ok: false, issues } : { ok: true, sessions: prospect };
  }

  // 进行中局登记缺件：冻结并释放占用
  function freeze(state, sessionId) {
    return {
      sessions: state.sessions.map((session) =>
        session.id === sessionId && session.status === ACTIVE
          ? { ...session, status: FROZEN, frozenReason: "对局中登记缺件" }
          : session
      )
    };
  }

  function setEndedStatus(state, sessionId, status) {
    return {
      sessions: state.sessions.map((session) =>
        session.id === sessionId && isUnfinished(session)
          ? { ...session, status, endedAt: nowText() }
          : session
      )
    };
  }

  function finish(state, sessionId) {
    return setEndedStatus(state, sessionId, FINISHED);
  }

  function cancel(state, sessionId) {
    return setEndedStatus(state, sessionId, CANCELLED);
  }

  // 改动游戏配件方案：全部未结束局按新方案重算，
  // 只要有任一再算后的进行中局超限，整组退回，游戏和局都保持原样
  function planGameRequirements(state, gameId, rows) {
    const game = (state.games || []).find((item) => item.id === gameId);
    if (!game) return { ok: false, issues: [] };

    const requirements = normalizeRows(rows, new Set((state.components || []).map((item) => item.id)));

    const games = state.games.map((item) =>
      item.id === gameId ? { ...item, components: structuredClone(requirements) } : item
    );

    const sessions = state.sessions.map((session) => {
      if (session.gameId !== gameId || !isUnfinished(session)) return session;
      // 未结束局整局按新方案重算：新增配件取方案数量，删除配件不再登记
      const requests = {};
      for (const { componentId, qty } of requirements) {
        requests[componentId] = qty;
      }
      return { ...session, requests };
    });

    const issues = inspect(state, sessions);
    if (issues.length) return { ok: false, issues };
    return { ok: true, games, sessions, recalculated: sessions.filter((s) => s.gameId === gameId && isUnfinished(s)).length };
  }

  function hasUnfinishedForGame(state, gameId) {
    return state.sessions.some((session) => session.gameId === gameId && isUnfinished(session));
  }

  return {
    ACTIVE,
    FROZEN,
    FINISHED,
    CANCELLED,
    isUnfinished,
    requestPieces,
    usageByComponent,
    tablePieces,
    inspect,
    planOpen,
    registerShortage,
    planRestart,
    freeze,
    finish,
    cancel,
    planGameRequirements,
    hasUnfinishedForGame
  };
})();
