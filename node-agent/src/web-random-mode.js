import { stdin as input, stdout as output, stderr as errorOutput } from "node:process";
import { fileURLToPath } from "node:url";
import { config, systemPrompt, validateConfig } from "./config.js";
import { createChatCompletion } from "./client.js";
import { getMessageText } from "./utils.js";

const JSON_SCHEMA_DESCRIPTION = `{
  "mode": "random-v2",
  "playerNames": ["玩家1", "玩家2"],
  "allowRepeatHeroes": true,
  "autoAssignHeroes": true,
  "preferredRoleOverrides": {
    "玩家1": ["N"]
  },
  "needsConfirmation": false,
  "questions": [],
  "unsupportedRequests": []
}`;

const FEW_SHOT_EXAMPLES = `示例 1：
用户：告诉我当前玩家池都有谁
输出：
{"mode":"random-v2","playerNames":[],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["当前玩家池共有 12 人：玩家1、玩家2、玩家3"],"unsupportedRequests":[]}

示例 2：
用户：你好啊
输出：
{"mode":"random-v2","playerNames":[],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["你好，我在。你可以先说说这局想怎么组，等你确定好玩家名单和规则后我再帮你生成结果。"],"unsupportedRequests":[]}

示例 3：
用户：茄子、小宇、白、娜姐、内鬼、夏目蓝
输出：
{"mode":"random-v2","playerNames":["茄子","小宇","内鬼","夏目蓝"],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["白 未完全匹配，可能是：白付。请确认你指的是哪位。","娜姐 不在当前玩家池，请先去设置页添加后再来。"],"unsupportedRequests":[]}

示例 4：
用户：玩家1、玩家2、玩家3、玩家4、玩家5、玩家6、玩家7、玩家8、玩家9、玩家10，开启随机模式，不允许重复英雄，玩家3走奶
输出：
{"mode":"random-v2","playerNames":["玩家1","玩家2","玩家3","玩家4","玩家5","玩家6","玩家7","玩家8","玩家9","玩家10"],"allowRepeatHeroes":false,"autoAssignHeroes":true,"preferredRoleOverrides":{"玩家3":["N"]},"needsConfirmation":false,"questions":[],"unsupportedRequests":[]}`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch((error) => {
    errorOutput.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

export async function runRandomModeAgent(payload) {
  validateConfig();

  const messages = buildMessages(payload);
  const assistantMessage = await createChatCompletion({
    config,
    messages,
    tools: [],
  });

  const rawText = getMessageText(assistantMessage);
  const parsed = parseJsonResponse(rawText);
  return {
    rawText,
    parsed,
    model: config.model,
  };
}

async function runCli() {
  const rawInput = await readStdin();
  const payload = rawInput ? JSON.parse(rawInput) : {};
  const result = await runRandomModeAgent(payload);
  output.write(`${JSON.stringify(result)}\n`);
}

function buildMessages(payload) {
  const history = Array.isArray(payload.messages) ? payload.messages : [];
  const context = normalizeContext(payload.context || {});

  return [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: [
        "你现在不是通用助手，而是 hero-randomizer 网页里的 OW 全随机模式聊天解析器。",
        "你只能处理 random-v2 全随机模式，不支持 fixed-team、chaos、dog。",
        "你必须输出一个 JSON 对象，不能输出 Markdown、解释文字、代码块或额外前后缀。",
        "字段必须严格符合下面这个结构：",
        JSON_SCHEMA_DESCRIPTION,
        "如果用户是在问“当前玩家池都有谁”“全部玩家都有谁”“玩家列表”，不要反问，直接返回 needsConfirmation=true，并把玩家池名单原样放进 questions。",
        "如果用户只是打招呼、寒暄，先自然回应，不要立刻追问玩家名单。",
        "如果用户提到不存在的玩家，但能和现有玩家做模糊匹配，请直接在 questions 里明确给出 1-3 个相似候选让用户确认，不要只说‘不存在’。",
        "如果用户人数不是 10 或 12，不要生成最终结果，needsConfirmation 必须为 true。",
        "如果用户需求不明确，只问最小必要问题。",
        "除非用户真的意图不清楚，否则不要泛泛地问‘你要做哪一种操作’。",
        "严格参考下面这些示例输出风格：",
        FEW_SHOT_EXAMPLES,
        "当前上下文 JSON 如下，你只能基于这些玩家、英雄、地图、敌对关系、专属英雄绑定来判断，不要编造不存在的数据：",
        JSON.stringify(context),
      ].join("\n\n"),
    },
    ...history
      .filter((message) => message && (message.role === "user" || message.role === "assistant"))
      .map((message) => ({
        role: message.role,
        content: String(message.content || ""),
      })),
  ];
}

function normalizeContext(context) {
  return {
    mode: "random-v2",
    user: context.user || null,
    players: Array.isArray(context.players)
      ? context.players.map((player) => ({
          name: player.name,
          level: player.level,
          preferredRoles: player.preferredRoles,
        }))
      : [],
    heroes: Array.isArray(context.heroes)
      ? context.heroes.map((hero) => ({
          id: hero.id,
          roleCode: hero.roleCode,
          name: hero.name,
          displayName: hero.displayName,
        }))
      : [],
    maps: Array.isArray(context.maps)
      ? context.maps.map((map) => ({
          id: map.id,
          name: map.name,
        }))
      : [],
    rivals: Array.isArray(context.rivals)
      ? context.rivals.map((rival) => ({
          player1Name: rival.player1Name,
          player2Name: rival.player2Name,
        }))
      : [],
    binds: Array.isArray(context.binds)
      ? context.binds.map((bind) => ({
          playerName: bind.playerName,
          heroDisplayName: bind.heroDisplayName,
        }))
      : [],
  };
}

function parseJsonResponse(rawText) {
  const text = String(rawText || "").trim();
  const candidates = [];

  if (text) {
    candidates.push(text);
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1).trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return normalizeAgentPayload(parsed);
    } catch {
      continue;
    }
  }

  throw new Error(`小分队agent 没有返回合法 JSON：${text}`);
}

function normalizeAgentPayload(payload) {
  return {
    mode: "random-v2",
    playerNames: Array.isArray(payload.playerNames) ? payload.playerNames.map((item) => String(item || "").trim()).filter(Boolean) : [],
    allowRepeatHeroes: payload.allowRepeatHeroes !== false,
    autoAssignHeroes: payload.autoAssignHeroes !== false,
    preferredRoleOverrides: normalizeRoleOverrides(payload.preferredRoleOverrides),
    needsConfirmation: Boolean(payload.needsConfirmation),
    questions: Array.isArray(payload.questions) ? payload.questions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    unsupportedRequests: Array.isArray(payload.unsupportedRequests) ? payload.unsupportedRequests.map((item) => String(item || "").trim()).filter(Boolean) : [],
  };
}

function normalizeRoleOverrides(value) {
  const result = {};
  if (!value || typeof value !== "object") {
    return result;
  }

  Object.entries(value).forEach(([playerName, roles]) => {
    const normalizedRoles = Array.isArray(roles)
      ? roles.filter((role) => role === "T" || role === "C" || role === "N")
      : [];
    if (normalizedRoles.length) {
      result[String(playerName)] = Array.from(new Set(normalizedRoles));
    }
  });

  return result;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
