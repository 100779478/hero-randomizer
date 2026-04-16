import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config, systemPrompt, validateConfig } from "./config.js";
import { renderBanner } from "./banner.js";
import { toolDefinitions, createToolExecutor } from "./tools.js";
import { runAgentLoop } from "./agent.js";
import { formatError } from "./utils.js";
import {
  clearLastConsoleLine,
  endAssistantReply,
  inputPrompt,
  isAssistantReplyStreaming,
  printAssistantReply,
  printError,
  printInfo,
  printSuccess,
  printToolResult,
  printUserMessage,
  printWarn,
  streamAssistantText,
} from "./terminal-ui.js";

await main();

async function main() {
  validateConfig();

  const rl = readline.createInterface({ input, output, terminal: true });
  const executeToolCall = createToolExecutor(config, {
    confirmDangerousToolCall: async (detail) => {
      printWarn("删除前确认", formatDeleteConfirmation(detail));
      const answer = (await rl.question("请输入 DELETE 确认删除，直接回车取消：")).trim();
      clearLastConsoleLine();

      return {
        confirmed: answer === detail.confirmText,
        userInput: answer,
      };
    },
  });
  let messages = [{ role: "system", content: systemPrompt }];

  console.log(renderBanner(config));
  printInfo("交互提示", "直接输入需求即可。输入 /reset 重置会话，输入 /exit 退出程序。");

  while (true) {
    const userInput = (await rl.question(inputPrompt())).trim();
    if (!userInput) {
      continue;
    }

    clearLastConsoleLine();

    if (userInput === "/exit") {
      break;
    }

    if (userInput === "/reset") {
      messages = [{ role: "system", content: systemPrompt }];
      printSuccess("会话状态", "会话已重置。");
      continue;
    }

    printUserMessage(userInput);
    messages.push({ role: "user", content: userInput });

    try {
      const reply = await runAgentLoop({
        history: messages,
        config,
        tools: toolDefinitions,
        executeToolCall,
        onToolResult: async ({ toolCall, toolResult }) => {
          if (!config.showToolResults) {
            return;
          }

          printToolResult(toolCall.function?.name || "unknown", toolResult);
        },
        onAssistantChunk: (chunk) => {
          streamAssistantText(chunk);
        },
      });

      messages = reply.messages;
      if (isAssistantReplyStreaming()) {
        endAssistantReply(reply.output);
      } else {
        printAssistantReply(reply.output);
      }
    } catch (error) {
      if (isAssistantReplyStreaming()) {
        endAssistantReply();
      }
      printError("执行失败", formatError(error));
    }
  }

  rl.close();
}

function formatDeleteConfirmation(detail) {
  const sections = [
    "这是破坏性操作，请再次确认。",
    `工具名称：${detail.toolName}`,
    `请求方法：${detail.method}`,
    `接口路径：${detail.path}`,
    `请求地址：${detail.url}`,
    `调用参数：${JSON.stringify(detail.args, null, 2)}`,
  ];

  if (detail.body) {
    sections.push(`请求体：${JSON.stringify(detail.body, null, 2)}`);
  }

  if (detail.preview?.available) {
    sections.push(`删除前详情预览：${JSON.stringify(detail.preview.body, null, 2)}`);
  } else if (detail.preview?.message) {
    sections.push(`删除前详情预览：${detail.preview.message}`);
  }

  sections.push(`确认口令：${detail.confirmText}`);
  return sections.join("\n");
}
