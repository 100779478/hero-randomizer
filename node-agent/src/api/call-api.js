/*
    HTTP 请求封装
    拼 URL、替换 path 参数
    拼 query、拼 body、发 fetch
    标准化返回
*/
function buildPath(template, args, pathFields = []) {
  let finalPath = template;

  for (const field of pathFields) {
    const value = args[field];
    if (value === undefined || value === null || value === "") {
      throw new Error(`缺少路径参数：${field}`);
    }

    finalPath = finalPath.replace(`{${field}}`, encodeURIComponent(String(value)));
  }

  return finalPath;
}

function buildQueryString(args, queryFields = []) {
  const params = new URLSearchParams();

  for (const field of queryFields) {
    const value = args[field];
    if (value !== undefined && value !== null && value !== "") {
      params.set(field, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function buildRequestBody(args, bodyFields = []) {
  if (!bodyFields.length) {
    return undefined;
  }

  const body = {};
  for (const field of bodyFields) {
    if (args[field] !== undefined) {
      body[field] = args[field];
    }
  }

  return body;
}

// 核心：把 endpoint 定义和参数组装成一份完整请求描述。
// 这样执行器和“删除前确认预览”都能复用同一套拼装逻辑。
export function buildApiRequest(endpoint, args, config) {
  const path = buildPath(endpoint.path, args, endpoint.pathFields);
  const queryString = buildQueryString(args, endpoint.queryFields);
  const url = `${config.apiBaseUrl}${path}${queryString}`;
  const headers = {
    "Content-Type": "application/json",
  };

  if (config.apiToken) {
    headers.Authorization = `Bearer ${config.apiToken}`;
  }

  const body = buildRequestBody(args, endpoint.bodyFields);

  return {
    method: endpoint.method,
    url,
    headers,
    body,
  };
}

export async function callApiEndpoint(endpoint, args, config) {
  const request = buildApiRequest(endpoint, args, config);
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body ? JSON.stringify(request.body) : undefined,
  });

  const text = await response.text();
  let parsedBody;

  try {
    parsedBody = JSON.parse(text);
  } catch {
    parsedBody = { raw: text };
  }

  return {
    tool: endpoint.name,
    ok: response.ok,
    request: {
      method: request.method,
      url: request.url,
      args,
      body: request.body,
    },
    response: {
      status: response.status,
      body: parsedBody,
    },
  };
}
