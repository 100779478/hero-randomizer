# 用户接口 Demo Skill

## 适用场景

当用户表达以下意图时使用这个技能：

- 创建用户
- 查询用户列表
- 查询用户详情
- 修改用户角色
- 删除用户

## 可用工具

当前和用户相关的接口工具有 5 个：

- `create_user`
- `list_users`
- `get_user`
- `update_user_role`
- `delete_user`

## 工具选择规则

- 创建用户时使用 `create_user`
- 查全部用户时使用 `list_users`
- 按 ID 查详情时使用 `get_user`
- 修改角色时使用 `update_user_role`
- 删除用户时使用 `delete_user`

不要用 `run_command` 去模拟 HTTP 请求。

## 参数要求

- `create_user` 必须提供 `name`、`email`、`role`
- `get_user` 必须提供 `userId`
- `update_user_role` 必须提供 `userId`、`role`
- `delete_user` 必须提供 `userId`
- `list_users` 可选提供 `role`

如果缺少必要字段，不要猜测，先向用户确认。

## 执行要求

1. 先从用户输入里提取调用目标和参数
2. 调用最合适的接口工具
3. 接口成功时，用简短中文总结关键结果
4. 接口失败时，明确说明状态码和失败原因

## 输出要求

- 终端会自动打印工具的原始接口响应
- 最终回答保持简短中文总结
- 不要伪造用户 ID 或接口返回字段
