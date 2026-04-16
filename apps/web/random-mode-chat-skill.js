(function attachRandomModeChatSkill(global) {
  const CONTEXT_STORAGE_KEY = "hero-randomizer-random-chat-context";
  const ROLE_PATTERNS = [
    { roles: ["T"], tokens: ["坦克", "主坦", "副坦", "走t", "玩t", " t", "T"] },
    { roles: ["C"], tokens: ["输出", "dps", "c位", "走c", "玩c", " c", "C"] },
    { roles: ["N"], tokens: ["辅助", "奶", "治疗", "补", "走n", "玩n", " n", "N"] },
    { roles: ["T", "C", "N"], tokens: ["补位", "任意", "都行", "全能"] },
  ];
  let cachedSkillText = "";

  /**
   * @typedef {Object} RandomChatResolvedInput
   * @property {"random-v2"} mode
   * @property {string[]} playerNames
   * @property {boolean} allowRepeatHeroes
   * @property {boolean} autoAssignHeroes
   * @property {Record<string, string[]>} preferredRoleOverrides
   * @property {boolean} needsConfirmation
   * @property {string[]} questions
   * @property {string[]} unsupportedRequests
   */

  async function loadSkillText() {
    if (cachedSkillText) return cachedSkillText;
    try {
      const response = await fetch("/skill/random-mode-v1.md", { cache: "no-store" });
      cachedSkillText = response.ok ? await response.text() : "";
    } catch {
      cachedSkillText = "";
    }
    return cachedSkillText;
  }

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isRosterQuestion(text) {
    return /(都有谁|全部玩家|所有玩家|玩家列表|当前玩家池|都有哪些玩家|告诉我.*玩家|哪些人能玩)/.test(text);
  }

  function formatRoster(players) {
    const names = (players || []).map((player) => player.name).filter(Boolean);
    if (!names.length) {
      return "当前玩家池还是空的，请先去设置页添加玩家。";
    }
    return `当前玩家池共有 ${names.length} 人：${names.join("、")}`;
  }

  function supportedModeOnlyWarnings(text) {
    const unsupported = [];
    if (/(固定队|自选模式|fixed-team|固定分队)/i.test(text)) unsupported.push("固定队随机英雄");
    if (/(大乱斗|chaos)/i.test(text)) unsupported.push("大乱斗模式");
    if (/(训狗|dog)/i.test(text)) unsupported.push("训狗模式");
    return unsupported;
  }

  function parseAllowRepeat(text) {
    if (/(不允许重复英雄|不要重复英雄|禁止重复英雄|英雄不能重复|不重复英雄)/.test(text)) return false;
    if (/(允许重复英雄|可以重复英雄|重复英雄也行)/.test(text)) return true;
    return true;
  }

  function parseAutoAssignHeroes(text) {
    if (/(不随机英雄|不要随机英雄|不分配英雄|只分队|仅分队|不要分英雄)/.test(text)) return false;
    if (/(随机英雄|分配英雄|自动分配英雄)/.test(text)) return true;
    return true;
  }

  function extractMatchedPlayerNames(text, players) {
    const sortedNames = (players || []).map((player) => player.name).sort((left, right) => right.length - left.length);
    const matched = [];
    sortedNames.forEach((name) => {
      if (!name) return;
      const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(safe, "i").test(text)) {
        matched.push(name);
      }
    });
    return Array.from(new Set(matched));
  }

  function extractCandidateNames(text) {
    const matches = [];
    const pattern = /(?:需要|要|参赛|名单|玩家)([^。；;\n]*)/g;
    let current;
    while ((current = pattern.exec(text))) {
      const body = normalizeWhitespace(current[1]);
      if (!body) continue;
      body
        .replace(/开启|启用|随机模式|全随机|模式|分队|结果|生成/g, " ")
        .split(/[、,，/\s和及]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => matches.push(token));
    }
    if (!matches.length) {
      normalizeWhitespace(text)
        .split(/[、,，/\s和及]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => matches.push(token));
    }
    return matches;
  }

  function inferMissingPlayers(text, players, matchedNames) {
    const known = new Set((players || []).map((player) => player.name));
    const matched = new Set(matchedNames);
    const candidates = extractCandidateNames(text);
    const filtered = candidates.filter((token) => {
      if (known.has(token) || matched.has(token)) return false;
      if (/^(随机|模式|开启|关闭|需要|玩家|分队|结果|英雄|地图|允许|重复|自动|你好|您好|在吗|帮我|一下|生成|告诉我|全部|所有|都有谁|都有哪些|能玩)$/.test(token)) return false;
      if (token.length > 12) return false;
      return /[\u4e00-\u9fa5A-Za-z0-9_]/.test(token);
    });
    return Array.from(new Set(filtered));
  }

  function findSimilarPlayers(token, players) {
    const normalized = String(token || "").trim().toLowerCase();
    if (!normalized) return [];
    return (players || [])
      .map((player) => player.name)
      .filter(Boolean)
      .filter((name) => {
        const candidate = name.toLowerCase();
        return candidate.includes(normalized) || normalized.includes(candidate);
      })
      .slice(0, 3);
  }

  function buildMissingPlayerQuestion(missingNames, players) {
    const lines = missingNames.map((name) => {
      const similar = findSimilarPlayers(name, players);
      if (similar.length) {
        return `${name} 未完全匹配，可能是：${similar.join("、")}。请确认你指的是哪位。`;
      }
      return `${name} 不在当前玩家池，请先去设置页添加后再来。`;
    });
    return lines.join("\n");
  }

  function parseRoleOverrides(text, playerNames) {
    const overrides = {};
    playerNames.forEach((name) => {
      const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = text.match(new RegExp(`${safe}([^，。；;\\n]{0,8})`, "i"));
      if (!match) return;
      const tail = match[1] || "";
      for (const pattern of ROLE_PATTERNS) {
        if (pattern.tokens.some((token) => tail.includes(token))) {
          overrides[name] = pattern.roles.slice();
          return;
        }
      }
    });
    return overrides;
  }

  function createClarification(resolution, extraQuestions) {
    return {
      ...resolution,
      needsConfirmation: true,
      questions: resolution.questions.concat(extraQuestions || []),
    };
  }

  function resolveLocally(messages, context) {
    const userMessages = messages
      .filter((message) => message.role === "user")
      .map((message) => normalizeWhitespace(message.content))
      .filter(Boolean)
    const transcript = userMessages.join("\n");
    const latestUserText = userMessages[userMessages.length - 1] || "";
    const resolution = {
      mode: "random-v2",
      playerNames: [],
      allowRepeatHeroes: parseAllowRepeat(transcript),
      autoAssignHeroes: parseAutoAssignHeroes(transcript),
      preferredRoleOverrides: {},
      needsConfirmation: false,
      questions: [],
      unsupportedRequests: supportedModeOnlyWarnings(transcript),
    };

    if (!transcript) {
      return createClarification(resolution, ["请先告诉我参赛玩家名单，我需要 10 人或 12 人。"]);
    }

    if (isRosterQuestion(latestUserText)) {
      return createClarification(resolution, [formatRoster(context.players || [])]);
    }

    if (resolution.unsupportedRequests.length) {
      return createClarification(resolution, [`当前聊天页首版只支持全随机模式，暂不支持：${resolution.unsupportedRequests.join("、")}。请改成全随机需求，或回对应页面操作。`]);
    }

    const matchedNames = extractMatchedPlayerNames(transcript, context.players || []);
    const missingNames = inferMissingPlayers(latestUserText, context.players || [], matchedNames);
    resolution.playerNames = matchedNames;
    resolution.preferredRoleOverrides = parseRoleOverrides(transcript, matchedNames);

    if (missingNames.length) {
      return createClarification(resolution, [buildMissingPlayerQuestion(missingNames, context.players || [])]);
    }

    if (!matchedNames.length) {
      return createClarification(resolution, ["我还没识别到有效的现有玩家，请直接给我 10 人或 12 人名单。"]);
    }

    if (![10, 12].includes(matchedNames.length)) {
      return createClarification(resolution, [`当前识别到 ${matchedNames.length} 名玩家：${matchedNames.join("、")}。全随机模式只支持 10 人或 12 人，请补足或删减后继续。`]);
    }

    return resolution;
  }

  async function resolveConversation(payload) {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const context = payload.context || {};
    const skillText = await loadSkillText();
    if (typeof global.__heroRandomizerRandomModeResolver === "function") {
      try {
        const resolved = await global.__heroRandomizerRandomModeResolver({ messages, context, skillText });
        if (resolved && typeof resolved === "object") {
          return resolved;
        }
      } catch (error) {
        return createClarification(resolveLocally(messages, context), [`外部 agent 通道暂时不可用：${error.message || "未知错误"}。已切回本地 skill 解析。`]);
      }
    }
    return resolveLocally(messages, context);
  }

  function formatAssistantReply(resolution) {
    if (resolution.needsConfirmation) {
      return resolution.questions.join("\n");
    }
    const summary = [];
    summary.push(`已识别 ${resolution.playerNames.length} 名玩家：${resolution.playerNames.join("、")}`);
    summary.push(resolution.autoAssignHeroes ? "本次会自动分配英雄。" : "本次只分队，不随机英雄。");
    summary.push(resolution.allowRepeatHeroes ? "本次允许两队重复英雄。" : "本次不允许两队重复英雄。");
    const overrideNames = Object.keys(resolution.preferredRoleOverrides || {});
    if (overrideNames.length) {
      summary.push(`已识别位置偏好调整：${overrideNames.map((name) => `${name}:${(resolution.preferredRoleOverrides[name] || []).join("/")}`).join("，")}`);
    }
    return summary.join("\n");
  }

  global.RandomModeChatSkill = {
    CONTEXT_STORAGE_KEY,
    loadSkillText,
    resolveConversation,
    formatAssistantReply,
  };
})(window);
