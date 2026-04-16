import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "../utils.js";

// 默认从当前 skill 目录里读取接口定义。
// 这里约定 skill 的结构是：
// skills/<skill-name>/
//   SKILL.md
//   references/openapi.json
const DEFAULT_SKILL_FILE = "skills/create-user-demo/SKILL.md";
const DEFAULT_OPENAPI_RELATIVE_PATH = path.join("references", "openapi.json");

// 这里单独再读一次 .env，是为了让这个模块在独立执行时也能拿到环境变量。
loadEnvFile(path.join(process.cwd(), ".env"));

// 根据当前配置的 skill 文件，反推出 skill 目录，再拼出 openapi.json 路径。
const skillFile = path.resolve(
  process.cwd(),
  process.env.AGENT_SKILL_FILE || DEFAULT_SKILL_FILE,
);
const skillDir = path.dirname(skillFile);
const openapiPath = path.join(skillDir, DEFAULT_OPENAPI_RELATIVE_PATH);

// 这是当前 agent 使用的“接口注册表”。
// 它不是 OpenAPI 原始结构，而是把 OpenAPI 转换成更适合 tools 使用的结构。
export const apiEndpointDefinitions = loadApiEndpointDefinitions(openapiPath);

// 这个 Map 方便后面在工具执行阶段按 tool name 快速找到对应接口定义。
export const apiEndpointMap = new Map(
  apiEndpointDefinitions.map((definition) => [definition.name, definition]),
);

function loadApiEndpointDefinitions(specPath) {
  if (!existsSync(specPath)) {
    throw new Error(`找不到 OpenAPI 定义文件：${specPath}`);
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const endpoints = [];

  // 遍历 OpenAPI 的 paths，把每个 HTTP 方法都转换成一个 endpoint 定义。
  for (const [routePath, pathItem] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      const lowerMethod = method.toLowerCase();
      if (!["get", "post", "patch", "put", "delete"].includes(lowerMethod)) {
        continue;
      }

      // OpenAPI 参数可能既定义在 pathItem 层，也定义在 operation 层，这里合并后统一处理。
      const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])];

      // 拆出路径参数和查询参数，后面 call-api.js 会用它们来拼 URL。
      const pathFields = parameters
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name);
      const queryFields = parameters
        .filter((parameter) => parameter.in === "query")
        .map((parameter) => parameter.name);

      // 只取 application/json 的请求体定义，用来生成 bodyFields 和工具参数 schema。
      const requestSchema =
        operation.requestBody?.content?.["application/json"]?.schema || null;
      const bodyFields = requestSchema ? Object.keys(requestSchema.properties || {}) : [];

      // 把 OpenAPI 的参数和请求体，转换成 tool calling 需要的 JSON Schema。
      const toolSchema = buildToolSchema(parameters, requestSchema);

      endpoints.push({
        // operationId 会直接作为 tool 名称使用，所以这里要求它稳定且唯一。
        name: operation.operationId,
        description:
          operation.summary || operation.description || `${method.toUpperCase()} ${routePath}`,
        method: method.toUpperCase(),
        path: routePath,
        pathFields,
        queryFields,
        bodyFields,
        dangerous: lowerMethod === "delete",
        responseSummary: extractResponseSummary(operation.responses),
        parameters: toolSchema,
      });
    }
  }

  // 如果删除接口和同路径的 GET 接口同时存在，就把 GET 作为删除前详情预览接口。
  const getEndpointByPath = new Map(
    endpoints
      .filter((endpoint) => endpoint.method === "GET")
      .map((endpoint) => [endpoint.path, endpoint.name]),
  );

  for (const endpoint of endpoints) {
    if (endpoint.dangerous) {
      endpoint.previewToolName = getEndpointByPath.get(endpoint.path) || "";
    }
  }

  return endpoints;
}

function buildToolSchema(parameters, requestSchema) {
  // properties 和 required 是 tool calling 中最关键的两部分：
  // - properties 描述可传哪些参数
  // - required 描述哪些参数必须提供
  const properties = {};
  const required = new Set();

  // 先处理 path/query 参数。
  for (const parameter of parameters) {
    properties[parameter.name] = {
      type: mapJsonSchemaType(parameter.schema?.type),
      description: parameter.description || `${parameter.name} 参数`,
    };

    if (parameter.required) {
      required.add(parameter.name);
    }
  }

  // 再处理 JSON 请求体字段。
  if (requestSchema?.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(requestSchema.properties)) {
      properties[fieldName] = {
        type: mapJsonSchemaType(fieldSchema.type),
        description: fieldSchema.description || `${fieldName} 字段`,
      };
    }
  }

  for (const fieldName of requestSchema?.required || []) {
    required.add(fieldName);
  }

  // 最终返回的结构会直接进入 toolDefinitions。
  return {
    type: "object",
    properties,
    ...(required.size ? { required: [...required] } : {}),
  };
}

function extractResponseSummary(responses = {}) {
  // 优先取 200 / 201 的响应描述，作为文档和工具展示用的返回说明。
  const successResponse =
    responses["200"] ||
    responses["201"] ||
    responses.default ||
    Object.values(responses)[0];

  return successResponse?.description || "返回接口响应结果。";
}

function mapJsonSchemaType(type) {
  // 如果 OpenAPI 没写类型，这里回退成 string，避免 tool schema 不完整。
  return type || "string";
}
