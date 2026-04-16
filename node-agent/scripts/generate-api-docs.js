import fs from "node:fs/promises";
import path from "node:path";
import { apiEndpointDefinitions } from "../src/api/endpoints.js";

const docsPath = path.resolve(process.cwd(), "docs/api-docs.md");

const content = [
  "# API 接口文档",
  "",
  "这份文档由 `src/api/endpoints.js` 自动生成，用于和动态 tools 保持一致。",
  "",
  "## 接口列表",
  "",
  ...apiEndpointDefinitions.flatMap((endpoint, index) => renderEndpoint(endpoint, index + 1)),
].join("\n");

await fs.mkdir(path.dirname(docsPath), { recursive: true });
await fs.writeFile(docsPath, content, "utf8");
console.log(`已生成接口文档：${docsPath}`);

function renderEndpoint(endpoint, index) {
  const lines = [
    `### ${index}. ${endpoint.name}`,
    "",
    `- 描述：${endpoint.description}`,
    `- 方法：${endpoint.method}`,
    `- 路径：\`${endpoint.path}\``,
    `- 返回：${endpoint.responseSummary}`,
  ];

  if (endpoint.pathFields?.length) {
    lines.push(`- 路径参数：${endpoint.pathFields.join("、")}`);
  }

  if (endpoint.queryFields?.length) {
    lines.push(`- 查询参数：${endpoint.queryFields.join("、")}`);
  }

  if (endpoint.bodyFields?.length) {
    lines.push(`- 请求体字段：${endpoint.bodyFields.join("、")}`);
  }

  lines.push("", "#### 参数定义", "", "```json", JSON.stringify(endpoint.parameters, null, 2), "```", "");
  return lines;
}
