const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
};

const blockLine = "─".repeat(64);

const assistantStreamState = {
  active: false,
  hasContent: false,
};

export function inputPrompt() {
  return `${colors.dim}>${colors.reset} `;
}

export function clearLastConsoleLine() {
  process.stdout.write("\x1b[1A");
  process.stdout.write("\x1b[2K");
  process.stdout.write("\r");
}

export function isAssistantReplyStreaming() {
  return assistantStreamState.active;
}

export function printUserMessage(message) {
  printBlock("用户", message, colors.cyan);
}

export function printInfo(title, message) {
  printBlock(title, message, colors.cyan);
}

export function printSuccess(title, message) {
  printBlock(title, message, colors.green);
}

export function printWarn(title, message) {
  printBlock(title, message, colors.yellow);
}

export function printError(title, message) {
  printBlock(title, message, colors.red);
}

export function printToolResult(toolName, result) {
  const json = JSON.stringify(result, null, 2);
  printBlock(`工具调用 ${toolName}`, json, colors.blue);
}

export function printAssistantReply(message) {
  startAssistantReply();
  streamAssistantText(message);
  endAssistantReply();
}

export function startAssistantReply() {
  if (assistantStreamState.active) {
    return;
  }

  assistantStreamState.active = true;
  assistantStreamState.hasContent = false;
  process.stdout.write(`${colors.green}${blockLine}${colors.reset}\n`);
  process.stdout.write(`${colors.green}HFT助手${colors.reset}\n`);
}

export function streamAssistantText(chunk) {
  if (!chunk) {
    return;
  }

  if (!assistantStreamState.active) {
    startAssistantReply();
  }

  assistantStreamState.hasContent = true;
  process.stdout.write(chunk);
}

export function endAssistantReply(fallbackMessage = "（模型没有返回文本内容）") {
  if (!assistantStreamState.active) {
    return;
  }

  if (!assistantStreamState.hasContent && fallbackMessage) {
    process.stdout.write(fallbackMessage);
  }

  process.stdout.write("\n");
  process.stdout.write(`${colors.green}${blockLine}${colors.reset}\n`);
  assistantStreamState.active = false;
  assistantStreamState.hasContent = false;
}

function printBlock(title, content, color) {
  if (assistantStreamState.active) {
    endAssistantReply("");
  }

  console.log(`${color}${blockLine}${colors.reset}`);
  console.log(`${color}${title}${colors.reset}`);
  console.log(content);
  console.log(`${color}${blockLine}${colors.reset}`);
}
