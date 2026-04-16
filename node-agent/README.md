# HFT 本地智能体

这是一个本地运行的 Node.js 命令行智能体，支持：

- 多轮对话
- 模型函数调用（Tool Calling）
- 读取文件
- 写入文件
- 列出目录
- 执行本地命令
- 调用内部 HTTP 接口 Demo（5 个用户接口）

这次接口 Demo 不是手写 5 个独立执行函数，而是走模板化方式：

- `skills/create-user-demo/references/openapi.json`：维护接口定义
- `src/api/endpoints.js`：从 skill 目录读取 OpenAPI 并转换成接口注册表
- `src/api/call-api.js`：统一负责 HTTP 调用
- `src/tools.js`：把接口注册表动态转换成 tools
- `docs/api-docs.md`：根据同一份接口定义整理出的接口文档

## 1. 环境要求

- Node.js 18+

## 2. 配置方法

先复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

然后按需修改下面这些配置：

- `AGENT_API_KEY`：模型服务的 API Key
- `AGENT_BASE_URL`：OpenAI 兼容接口地址，默认值是 `https://api.openai.com/v1`
- `AGENT_MODEL`：要使用的模型名称
- `AGENT_WORKSPACE`：智能体允许读写的工作目录
- `AGENT_SHELL`：执行命令时使用的 shell，Windows 下通常是 `powershell.exe`
- `AGENT_API_BASE_URL`：内部业务接口基础地址，默认是本地 mock 服务 `http://127.0.0.1:8787`
- `AGENT_API_TOKEN`：内部接口令牌，没有可以留空
- `AGENT_SHOW_TOOL_RESULTS`：是否在终端打印工具原始结果，默认 `true`
- `AGENT_SKILL_FILE`：要自动加载的 skill 文件路径

## 3. 用户接口 Demo

先启动本地 mock 接口：

```powershell
npm run mock-api
```

接口启动后，再开一个终端运行 agent：

```powershell
npm start
```

然后在 agent 里输入类似下面这些请求：

```text
请帮我创建一个用户，姓名张三，邮箱 zhangsan@example.com，角色 admin
帮我列出所有用户
查询 user_1776072605468 这个用户
把 user_1776072605468 的角色改成 trader
删除 user_1776072605468
```

如果模型调用了对应接口工具，终端会先实时打印接口原始响应 JSON，然后再输出一段简短中文总结。

## 4. 接口文档

当前 5 个接口的文档已经整理在：

`docs/api-docs.md`

如果你后面继续加接口，也可以重新生成文档：

```powershell
npm run generate-api-docs
```

## 5. 内置命令

- `/reset`：重置当前会话历史
- `/exit`：退出程序

## 6. 说明

- 这是“本地运行的智能体”，不是“本地模型”。模型请求仍然会发送到你配置的接口地址。
- 当前项目已经内置一个用户接口 skill，启动时会自动并入系统提示。
- 默认会把文件读写限制在 `AGENT_WORKSPACE` 目录内，避免误操作到其他路径。
- 如果 `8787` 端口已经被旧版 mock 服务占用，建议先停掉旧进程，或者临时换一个 `MOCK_API_PORT` 来验证新版接口。
