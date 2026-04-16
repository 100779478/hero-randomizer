// 核心：负责和模型服务通信。
// 这里不处理 CLI 和本地工具细节，只负责把消息发给模型，再把模型消息取回来。
export async function createChatCompletion({ config, messages, tools }) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`接口请求失败（${response.status}）：${errorText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;

  if (!message) {
    throw new Error("模型响应中没有返回消息内容。");
  }

  return {
    role: "assistant",
    content: message.content ?? "",
    tool_calls: message.tool_calls ?? [],
  };
}

// 核心：以流式方式读取模型输出。
// 一边从 SSE 增量事件里拼接文本，一边把文本片段回调给终端层逐步打印。
export async function createChatCompletionStream({
  config,
  messages,
  tools,
  onTextDelta,
}) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`接口请求失败（${response.status}）：${errorText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = await response.json();
    const message = data?.choices?.[0]?.message;

    if (!message) {
      throw new Error("模型响应中没有返回消息内容。");
    }

    return {
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls ?? [],
    };
  }

  if (!response.body) {
    throw new Error("模型响应中没有可读取的流。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf8");
  let buffer = "";

  const assistantMessage = {
    role: "assistant",
    content: "",
    tool_calls: [],
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const doneReading = applySseEvent({
        event,
        assistantMessage,
        onTextDelta,
      });

      if (doneReading) {
        await reader.cancel();
        return cleanupAssistantMessage(assistantMessage);
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    applySseEvent({
      event: buffer,
      assistantMessage,
      onTextDelta,
    });
  }

  return cleanupAssistantMessage(assistantMessage);
}

function applySseEvent({ event, assistantMessage, onTextDelta }) {
  const lines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line === "[DONE]") {
      return true;
    }

    const data = JSON.parse(line);
    const delta = data?.choices?.[0]?.delta;

    if (!delta) {
      continue;
    }

    appendDeltaToAssistantMessage({ delta, assistantMessage, onTextDelta });
  }

  return false;
}

function appendDeltaToAssistantMessage({ delta, assistantMessage, onTextDelta }) {
  const textDelta = normalizeTextDelta(delta.content);

  if (textDelta) {
    assistantMessage.content += textDelta;

    if (onTextDelta) {
      onTextDelta(textDelta);
    }
  }

  if (!Array.isArray(delta.tool_calls)) {
    return;
  }

  for (const toolCallDelta of delta.tool_calls) {
    const index = toolCallDelta.index ?? assistantMessage.tool_calls.length;
    const currentToolCall =
      assistantMessage.tool_calls[index] ??
      {
        id: "",
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      };

    if (toolCallDelta.id) {
      currentToolCall.id = toolCallDelta.id;
    }

    if (toolCallDelta.type) {
      currentToolCall.type = toolCallDelta.type;
    }

    if (toolCallDelta.function?.name) {
      currentToolCall.function.name += toolCallDelta.function.name;
    }

    if (toolCallDelta.function?.arguments) {
      currentToolCall.function.arguments += toolCallDelta.function.arguments;
    }

    assistantMessage.tool_calls[index] = currentToolCall;
  }
}

function normalizeTextDelta(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item?.type === "text") {
        return item.text ?? "";
      }

      return "";
    })
    .join("");
}

function cleanupAssistantMessage(message) {
  return {
    role: "assistant",
    content: message.content ?? "",
    tool_calls: (message.tool_calls ?? []).filter(Boolean),
  };
}
