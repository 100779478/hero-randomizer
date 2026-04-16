# Agent 执行流程图

下面这张图对应当前本地 Node.js 智能体的真实执行路径。

```mermaid
flowchart TD
    A[启动 index.js] --> B[读取 .env 和 config]
    B --> C[打印 HFT Banner]
    C --> D[初始化 messages 和 CLI]
    D --> E[等待用户输入]
    E --> F{是否为内置命令}
    F -->|/exit| G[退出程序]
    F -->|/reset| H[重置会话历史]
    H --> E
    F -->|普通问题| I[写入 user message]
    I --> J[执行 runAgentLoop]
    J --> K[调用 chat/completions]
    K --> L{模型是否返回 tool_calls}
    L -->|否| M[输出最终答案]
    M --> E
    L -->|是| N[调用 executeToolCall 分发工具]
    N --> O[执行 list_files / read_file / write_file / run_command]
    O --> P[把 tool 结果写回 messages]
    P --> K
```

## 模块职责

- `src/index.js`：命令行入口，接收输入并驱动主循环
- `src/config.js`：读取环境变量和运行配置
- `src/banner.js`：打印启动 Logo 和基础信息
- `src/client.js`：请求模型接口
- `src/agent.js`：实现模型与工具之间的闭环调度
- `src/tools.js`：声明并执行本地工具
- `src/utils.js`：放通用工具函数