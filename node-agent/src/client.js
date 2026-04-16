function normalizeMessages(messages = []) {
  return messages.map((message) => {
    const normalized = {
      role: message?.role || "user",
      content: normalizeMessageContent(message?.content),
    };

    if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
      normalized.tool_calls = message.tool_calls.map((toolCall, index) => ({
        id: String(toolCall?.id || `tool_call_${index + 1}`),
        type: toolCall?.type || "function",
        function: {
          name: String(toolCall?.function?.name || ""),
          arguments: String(toolCall?.function?.arguments || ""),
        },
      }));
    }

    if (message?.role === "tool" && message?.tool_call_id) {
      normalized.tool_call_id = String(message.tool_call_id);
    }

    return normalized;
  });
}

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
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
      .join("\n");
  }

  if (content == null) {
    return "";
  }

  return String(content);
}

function buildPayload({ config, messages, tools, stream = false }) {
  const payload = {
    model: config.model,
    messages: normalizeMessages(messages),
    temperature: 0.2,
  };

  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  if (stream) {
    payload.stream = true;
  }

  return payload;
}

async function requestChatCompletion({ config, payload }) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`接口请求失败（${response.status}）：${errorText}`);
  }

  return response;
}

export async function createChatCompletion({ config, messages, tools }) {
  const response = await requestChatCompletion({
    config,
    payload: buildPayload({ config, messages, tools }),
  });

  const data = await response.json();
  const message = data?.choices?.[0]?.message;

  if (!message) {
    throw new Error("模型响应中没有返回消息内容。");
  }

  return {
    role: "assistant",
    content: message.content ?? "",
    tool_calls: normalizeToolCalls(message.tool_calls ?? []),
  };
}

export async function createChatCompletionStream({
  config,
  messages,
  tools,
  onTextDelta,
}) {
  const response = await requestChatCompletion({
    config,
    payload: buildPayload({ config, messages, tools, stream: true }),
  });

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
      tool_calls: normalizeToolCalls(message.tool_calls ?? []),
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
    tool_calls: normalizeToolCalls((message.tool_calls ?? []).filter(Boolean)),
  };
}

function normalizeToolCalls(toolCalls = []) {
  return toolCalls
    .filter(Boolean)
    .map((toolCall, index) => ({
      id: String(toolCall?.id || `tool_call_${index + 1}`),
      type: toolCall?.type || "function",
      function: {
        name: String(toolCall?.function?.name || ""),
        arguments: String(toolCall?.function?.arguments || ""),
      },
    }))
    .filter((toolCall) => toolCall.function.name);
}
