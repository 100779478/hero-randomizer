import { createChatCompletionStream } from "./client.js";
import { getMessageText } from "./utils.js";

export async function runAgentLoop({
  history,
  config,
  tools,
  executeToolCall,
  onToolResult,
  onAssistantChunk,
  maxSteps = 8,
}) {
  const messages = [...history];

  for (let step = 0; step < maxSteps; step += 1) {
    const assistantMessage = await createChatCompletionStream({
      config,
      messages,
      tools,
      onTextDelta: onAssistantChunk,
    });

    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls?.length) {
      return {
        messages,
        output: getMessageText(assistantMessage) || "（模型没有返回文本内容）",
      };
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const toolResult = await executeToolCall(toolCall);

      if (onToolResult) {
        await onToolResult({ toolCall, toolResult });
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  throw new Error("工具调用次数已达到上限，已停止本轮执行。");
}
