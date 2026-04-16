import { stdin as input, stdout as output, stderr as errorOutput } from "node:process";
import { fileURLToPath } from "node:url";
import { config, systemPrompt, validateConfig } from "./config.js";
import { runAgentLoop } from "./agent.js";
import { createToolExecutor, toolDefinitions } from "./tools.js";

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

const FEW_SHOT_EXAMPLES = `示例 1：用户：告诉我当前玩家池都有谁
输出：{"mode":"random-v2","playerNames":[],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["当前玩家池共有 12 人：玩家1、玩家2、玩家3"],"unsupportedRequests":[]}

示例 2：用户：你好啊
输出：{"mode":"random-v2","playerNames":[],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["你好，我在。你可以先说说这局想怎么组，等你确定好玩家名单和规则后我再帮你生成结果。"],"unsupportedRequests":[]}

示例 3：用户：白、娜姐、内鬼、夏目蓝
输出：{"mode":"random-v2","playerNames":["内鬼","夏目蓝"],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["白 未完全匹配，可能是：白丶。请确认你指的是哪位。","娜姐 未完全匹配，可能是：奶酪姐、奶酪哥。请确认你指的是哪位。"],"unsupportedRequests":[]}

示例 4：用户：这些人帮我分组，尽量实力均衡
输出：{"mode":"random-v2","playerNames":[],"allowRepeatHeroes":true,"autoAssignHeroes":true,"preferredRoleOverrides":{},"needsConfirmation":true,"questions":["你是要我按全随机模式直接生成随机队伍吗？当前随机模式本身就会尽量按实力均衡分配。"],"unsupportedRequests":[]}

示例 5：用户：玩家1、玩家2、玩家3、玩家4、玩家5、玩家6、玩家7、玩家8、玩家9、玩家10，开启随机模式，不允许重复英雄，玩家3走奶
输出：{"mode":"random-v2","playerNames":["玩家1","玩家2","玩家3","玩家4","玩家5","玩家6","玩家7","玩家8","玩家9","玩家10"],"allowRepeatHeroes":false,"autoAssignHeroes":true,"preferredRoleOverrides":{"玩家3":["N"]},"needsConfirmation":false,"questions":[],"unsupportedRequests":[]}`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli().catch((error) => {
    errorOutput.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

export async function runRandomModeAgent(payload) {
  validateConfig();

  const messages = buildMessages(payload);
  const executeToolCall = createToolExecutor(config);
  const reply = await runAgentLoop({
    history: messages,
    config,
    tools: toolDefinitions,
    executeToolCall,
    maxSteps: 6,
  });

  const rawText = String(reply.output || "").trim();
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
        "当你需要判断玩家是否存在、玩家池名单、英雄池、地图池、敌对关系、专属英雄绑定时，必须优先调用 fetchBootstrap 工具获取当前登录用户的最新数据。",
        "不要把对话里附带的历史示例名字当成真实玩家池，也不要编造玩家、英雄或地图。",
        "如果用户输入的名字不能完全匹配，但能模糊匹配到现有玩家，请不要直接替用户决定具体是谁，而是明确列出候选让用户确认。",
        "如果用户提到“分组”“分队”“组一下”“排一下”这类模糊说法，但没有明确要按全随机模式直接出结果，请先确认他是不是要生成随机队伍。",
        "如果用户提到“尽量实力均衡”“平衡一点”“别差距太大”，这是当前 random-v2 默认规则，不要把它当成未支持功能。",
        "如果用户是在问“当前玩家池都有谁”“全部玩家都有谁”“玩家列表”，不要反问，直接返回 needsConfirmation=true，并把 fetchBootstrap 得到的玩家池名单放进 questions。",
        "如果用户只是打招呼、寒暄，先自然回应，不要立刻追问玩家名单。",
        "如果用户人数不是 10 或 12，不要生成最终结果，needsConfirmation 必须为 true。",
        "如果用户需求不明确，只问最小必要问题。",
        "除非用户真的意图不清楚，否则不要泛泛地问‘你要做哪一种操作’。",
        "严格参考下面这些示例输出风格：",
        FEW_SHOT_EXAMPLES,
        "当前会话上下文只提供轻量入口信息，不提供玩家、地图、英雄池全量数据。",
        `当前用户入口信息：${JSON.stringify(context)}`,
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
    createdAt: context.createdAt || null,
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
