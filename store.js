"use strict";

// 存档同步层：预置数据、旧版本迁移、localStorage 读写，只与本地保存打交道。
const Store = (() => {
  const storageKey = "zfl18-boardgame-rule-cards";
  const version = 2;

  // 固定 id 便于老存档迁移；三款游戏沿用原卡片库内容并补充配件方案
  const games = [
    {
      id: "game-orleans",
      name: "奥尔良",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 90,
      complexity: "中",
      lastPlayed: "2025-11-20",
      cover: "",
      components: [
        { componentId: "comp-cube", qty: 40 },
        { componentId: "comp-coin", qty: 30 },
        { componentId: "comp-timer", qty: 1 }
      ],
      forgets: ["商站建造前先确认道路或水路连接", "袋中随从抽完后不是重洗弃堆，而是从已回袋内容继续抽"],
      disputes: ["事件顺序和玩家动作结算先后", "科技板是否能替代所有同类随从"],
      setup: ["按人数放置货物板块", "每位玩家拿起始随从、商人和个人板"],
      scoring: ["货物分数", "商站和市民乘区块", "金币和建筑剩余加分"]
    },
    {
      id: "game-gaia",
      name: "盖亚计划",
      minPlayers: 1,
      maxPlayers: 4,
      duration: 150,
      complexity: "重",
      lastPlayed: "2025-08-02",
      cover: "",
      components: [
        { componentId: "comp-cube", qty: 55 },
        { componentId: "comp-die", qty: 2 },
        { componentId: "comp-cardrack", qty: 1 },
        { componentId: "comp-timer", qty: 1 }
      ],
      forgets: ["联邦连接时卫星数量和能量消耗要一起核对", "研究升到顶必须拿对应科技板限制"],
      disputes: ["被动充能是否能拒绝", "星球改造费用受哪些能力影响"],
      setup: ["随机终局计分板和回合得分板", "按种族设置起始资源和母星"],
      scoring: ["终局计分板", "科技轨排名", "联邦和建筑分"]
    },
    {
      id: "game-azul",
      name: "花砖物语",
      minPlayers: 2,
      maxPlayers: 4,
      duration: 45,
      complexity: "轻",
      lastPlayed: "2026-03-15",
      cover: "",
      components: [
        { componentId: "comp-cube", qty: 60 },
        { componentId: "comp-cardrack", qty: 2 },
        { componentId: "comp-die", qty: 2 }
      ],
      forgets: ["每轮结束先铺墙再补工厂展示区", "地板线扣分后清空对应砖"],
      disputes: ["同色砖放置限制是否看整面墙", "中央区起始玩家标记是否必须拿"],
      setup: ["按人数放工厂圆盘", "每个圆盘补4块砖"],
      scoring: ["横竖相邻即时分", "完整行列和颜色终局加分"]
    }
  ];

  // 共用配件：多局之间互抢库存
  const components = [
    { id: "comp-cube", name: "资源木块", total: 120 },
    { id: "comp-coin", name: "钱币指示物", total: 100 },
    { id: "comp-die", name: "六面骰", total: 8 },
    { id: "comp-cardrack", name: "卡牌架", total: 6 },
    { id: "comp-timer", name: "沙漏计时器", total: 3 }
  ];

  // 三个桌位：每个桌位限定同一时间能摊开的配件总件数
  const tables = [
    { id: "table-a", name: "A 桌 · 长桌", capacity: 100 },
    { id: "table-b", name: "B 桌 · 方桌", capacity: 75 },
    { id: "table-c", name: "C 桌 · 小边桌", capacity: 60 }
  ];

  function defaultState() {
    return {
      version,
      selectedId: games[0].id,
      games: structuredClone(games),
      components: structuredClone(components),
      tables: structuredClone(tables),
      sessions: []
    };
  }

  function sanitizeSessions(rawSessions, nextGames) {
    const validComponentIds = new Set(components.map((item) => item.id));
    const validTableIds = new Set(tables.map((item) => item.id));
    const validGameIds = new Set(nextGames.map((item) => item.id));
    const validStatus = new Set(["active", "frozen", "finished", "cancelled"]);

    return (Array.isArray(rawSessions) ? rawSessions : [])
      .filter((session) => session && validGameIds.has(session.gameId) && validTableIds.has(session.tableId))
      .map((session) => {
        const requests = {};
        for (const [componentId, qty] of Object.entries(session.requests || {})) {
          if (validComponentIds.has(componentId) && Number.isInteger(Number(qty)) && Number(qty) > 0) {
            requests[componentId] = Number(qty);
          }
        }
        return {
          id: session.id || crypto.randomUUID(),
          gameId: session.gameId,
          tableId: session.tableId,
          requests,
          status: validStatus.has(session.status) ? session.status : "active",
          frozenReason: session.frozenReason || "",
          createdAt: session.createdAt || new Date().toISOString(),
          endedAt: session.endedAt || ""
        };
      });
  }

  // 老版本卡片库存档迁移：保留已有游戏和规则，补齐占用台结构
  function migrate(previous) {
    const base = defaultState();
    if (!previous || typeof previous !== "object" || !Array.isArray(previous.games)) return base;

    const seedByName = new Map(base.games.map((game) => [game.name, game]));
    const nextGames = previous.games.map((game) => {
      const seed = seedByName.get(game.name);
      return {
        ...structuredClone(seed || game),
        id: game.id || seed?.id || crypto.randomUUID(),
        name: game.name,
        minPlayers: game.minPlayers ?? seed?.minPlayers ?? 2,
        maxPlayers: game.maxPlayers ?? seed?.maxPlayers ?? 4,
        duration: game.duration ?? seed?.duration ?? 60,
        complexity: game.complexity ?? seed?.complexity ?? "中",
        lastPlayed: game.lastPlayed ?? seed?.lastPlayed ?? new Date().toISOString().slice(0, 10),
        cover: game.cover ?? seed?.cover ?? "",
        components: Array.isArray(game.components) ? game.components : (seed?.components ? structuredClone(seed.components) : []),
        forgets: game.forgets ?? seed?.forgets ?? [],
        disputes: game.disputes ?? seed?.disputes ?? [],
        setup: game.setup ?? seed?.setup ?? [],
        scoring: game.scoring ?? seed?.scoring ?? []
      };
    });

    const sessions = sanitizeSessions(previous.sessions, nextGames);

    return { ...base, version, selectedId: previous.selectedId || nextGames[0]?.id || "", games: nextGames, sessions };
  }

  // 当前版本存档也过一遍结构校正，防止手改或历史脏数据导致页面/占用计算出错
  function normalizeCurrent(parsed) {
    const base = defaultState();
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.games)) return base;

    const validComponentIds = new Set(components.map((item) => item.id));
    const nextGames = parsed.games.map((game) => ({
      ...game,
      components: Array.isArray(game.components)
        ? game.components.filter((row) => row && validComponentIds.has(row.componentId) && Number.isInteger(Number(row.qty)) && Number(row.qty) > 0)
        : []
    }));

    return {
      ...base,
      ...parsed,
      version,
      components: Array.isArray(parsed.components) && parsed.components.length ? parsed.components : base.components,
      tables: Array.isArray(parsed.tables) && parsed.tables.length ? parsed.tables : base.tables,
      games: nextGames,
      sessions: sanitizeSessions(parsed.sessions, nextGames)
    };
  }

  function load() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return defaultState();
    try {
      const parsed = JSON.parse(saved);
      return parsed && parsed.version === version ? normalizeCurrent(parsed) : migrate(parsed);
    } catch {
      return defaultState();
    }
  }

  function save(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  return { storageKey, version, load, save, defaultState };
})();
