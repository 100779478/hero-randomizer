import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "./utils.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_SHELL = process.platform === "win32" ? "powershell.exe" : "/bin/bash";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_SKILL_FILE = "skills/create-user-demo/SKILL.md";

loadEnvFile(path.join(process.cwd(), ".env"));

export const config = {
  apiKey: process.env.AGENT_API_KEY,
  baseUrl: (process.env.AGENT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
  model: process.env.AGENT_MODEL || DEFAULT_MODEL,
  shell: process.env.AGENT_SHELL || DEFAULT_SHELL,
  workspace: path.resolve(process.cwd(), process.env.AGENT_WORKSPACE || "."),
  apiBaseUrl: (process.env.AGENT_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, ""),
  apiToken: process.env.AGENT_API_TOKEN || "",
  showToolResults: process.env.AGENT_SHOW_TOOL_RESULTS !== "false",
  skillFile: path.resolve(process.cwd(), process.env.AGENT_SKILL_FILE || DEFAULT_SKILL_FILE),
};

const skillContent = loadSkillContent(config.skillFile);

export const systemPrompt = [
  "你是运行在用户本机上的 OW 游戏内战智能助手。",
  "回答要简洁、准确，并且以执行任务为导向。",
  "当需要访问文件系统、调用内部接口或执行命令时，使用工具。",
  "涉及删除、清空、移除等破坏性操作时，必须先向用户说明将删除什么，并先征求确认后再继续。",
  `所有文件操作都必须限制在这个工作目录内：${config.workspace}`,
  `内部接口基础地址默认使用这个配置：${config.apiBaseUrl}`,
  "在写文件、调用接口或执行命令前，先判断操作是否必要。",
  "如果接口或命令执行失败，要说明失败原因并给出下一步建议。",
  skillContent ? `当前已加载的技能规则如下：\n\n${skillContent}` : "",
]
  .filter(Boolean)
  .join("\n\n");

export function validateConfig() {
  if (!config.apiKey) {
    throw new Error("缺少 AGENT_API_KEY，请先根据 .env.example 创建 .env 文件并填写配置。");
  }
}

function loadSkillContent(skillFile) {
  if (!existsSync(skillFile)) {
    return "";
  }

  return readFileSync(skillFile, "utf8").trim();
}
