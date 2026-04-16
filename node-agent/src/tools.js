import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { buildApiRequest, callApiEndpoint } from "./api/call-api.js";
import { apiEndpointDefinitions, apiEndpointMap } from "./api/endpoints.js";

const execAsync = promisify(exec);

const baseToolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "列出工作目录内某个相对路径下的文件和文件夹。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "要查看的相对路径，默认是工作目录根目录。",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取工作目录内的 UTF-8 文本文件。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "要读取的文件相对路径。",
          },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "把文本内容写入工作目录内的文件，如果目录不存在会自动创建。",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "要写入的文件相对路径。",
          },
          content: {
            type: "string",
            description: "完整的文件内容。",
          },
        },
        required: ["target", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "在工作目录内执行本地命令，并返回标准输出和错误输出。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的命令。",
          },
          cwd: {
            type: "string",
            description: "命令执行时使用的相对工作目录。",
          },
          timeoutMs: {
            type: "number",
            description: "命令超时时间，单位毫秒，默认 20000。",
          },
        },
        required: ["command"],
      },
    },
  },
];

const apiToolDefinitions = apiEndpointDefinitions.map((endpoint) => ({
  type: "function",
  function: {
    name: endpoint.name,
    description: endpoint.description,
    parameters: endpoint.parameters,
  },
}));

export const toolDefinitions = [...baseToolDefinitions, ...apiToolDefinitions];

export function createToolExecutor(config, options = {}) {
  const { confirmDangerousToolCall } = options;

  function resolveWorkspacePath(target = ".") {
    const resolved = path.resolve(config.workspace, target);
    const relative = path.relative(config.workspace, resolved);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`路径超出了工作目录范围：${target}`);
    }

    return resolved;
  }

  function normalizeRelative(targetPath) {
    return path.relative(config.workspace, targetPath) || ".";
  }

  async function listFiles(target) {
    const resolved = resolveWorkspacePath(target);
    const entries = await fs.readdir(resolved, { withFileTypes: true });

    return {
      target: normalizeRelative(resolved),
      entries: entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
        })),
    };
  }

  async function readFile(target) {
    const resolved = resolveWorkspacePath(target);
    const content = await fs.readFile(resolved, "utf8");

    return {
      target: normalizeRelative(resolved),
      content,
    };
  }

  async function writeFile(target, content) {
    const resolved = resolveWorkspacePath(target);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");

    return {
      target: normalizeRelative(resolved),
      bytesWritten: Buffer.byteLength(content, "utf8"),
    };
  }

  async function runCommand(command, cwd = ".", timeoutMs = 20000) {
    const resolvedCwd = resolveWorkspacePath(cwd);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: resolvedCwd,
        shell: config.shell,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      });

      return {
        command,
        cwd: normalizeRelative(resolvedCwd),
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (error) {
      return {
        command,
        cwd: normalizeRelative(resolvedCwd),
        stdout: error.stdout?.trim() || "",
        stderr: error.stderr?.trim() || error.message,
        exitCode: Number.isInteger(error.code) ? error.code : 1,
      };
    }
  }

  async function confirmApiDeletionIfNeeded(endpoint, args) {
    if (!endpoint.dangerous || !confirmDangerousToolCall) {
      return { confirmed: true, detail: null };
    }

    const request = buildApiRequest(endpoint, args, config);
    const previewResult = await loadDeletePreview(endpoint, args);
    const detail = buildDangerousActionDetail(endpoint, args, request, previewResult);
    const confirmation = await confirmDangerousToolCall(detail);

    return {
      confirmed: Boolean(confirmation?.confirmed),
      detail,
      confirmationInput: confirmation?.userInput || "",
    };
  }

  async function loadDeletePreview(endpoint, args) {
    if (!endpoint.previewToolName) {
      return null;
    }

    const previewEndpoint = apiEndpointMap.get(endpoint.previewToolName);
    if (!previewEndpoint) {
      return null;
    }

    try {
      return await callApiEndpoint(previewEndpoint, args, config);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return async function executeToolCall(toolCall) {
    const toolName = toolCall.function?.name;
    const rawArgs = toolCall.function?.arguments || "{}";

    let args;
    try {
      args = JSON.parse(rawArgs);
    } catch {
      throw new Error(`工具参数不是合法的 JSON：${toolName} -> ${rawArgs}`);
    }

    switch (toolName) {
      case "list_files":
        return listFiles(args.target || ".");
      case "read_file":
        return readFile(args.target);
      case "write_file":
        return writeFile(args.target, args.content);
      case "run_command":
        return runCommand(args.command, args.cwd || ".", args.timeoutMs);
      default:
        break;
    }

    const endpoint = apiEndpointMap.get(toolName);
    if (endpoint) {
      const confirmation = await confirmApiDeletionIfNeeded(endpoint, args);

      if (!confirmation.confirmed) {
        return {
          tool: endpoint.name,
          ok: false,
          canceled: true,
          message: "用户取消了本次删除操作，接口未执行。",
          confirmation: {
            required: true,
            confirmed: false,
            input: confirmation.confirmationInput,
            detail: confirmation.detail,
          },
        };
      }

      const result = await callApiEndpoint(endpoint, args, config);

      if (confirmation.detail) {
        result.confirmation = {
          required: true,
          confirmed: true,
          input: confirmation.confirmationInput,
          detail: confirmation.detail,
        };
      }

      return result;
    }

    throw new Error(`未知工具：${toolName}`);
  };
}

function buildDangerousActionDetail(endpoint, args, request, previewResult) {
  return {
    title: `检测到删除操作：${endpoint.name}`,
    toolName: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    url: request.url,
    args,
    body: request.body,
    preview: normalizePreviewResult(previewResult),
    confirmText: "DELETE",
  };
}

function normalizePreviewResult(previewResult) {
  if (!previewResult) {
    return {
      available: false,
      message: "没有找到可用于删除前预览的详情接口。",
    };
  }

  if (previewResult.error) {
    return {
      available: false,
      message: `详情预览失败：${previewResult.error}`,
    };
  }

  return {
    available: true,
    ok: previewResult.ok,
    status: previewResult.response?.status,
    body: previewResult.response?.body,
  };
}
