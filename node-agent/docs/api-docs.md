# API 接口文档

这份文档由 `src/api/endpoints.js` 对应的接口定义整理而来，用于和动态 tools 保持一致。

## 接口列表

### 1. create_user

- 描述：创建一个新用户。
- 方法：POST
- 路径：`/api/users`
- 返回：返回创建结果和新用户信息。
- 请求体字段：name、email、role

#### 参数定义

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "用户姓名，例如 张三。"
    },
    "email": {
      "type": "string",
      "description": "用户邮箱，例如 zhangsan@example.com。"
    },
    "role": {
      "type": "string",
      "description": "用户角色，例如 admin、trader、viewer。"
    }
  },
  "required": ["name", "email", "role"]
}
```

### 2. list_users

- 描述：查询用户列表，可按角色筛选。
- 方法：GET
- 路径：`/api/users`
- 返回：返回用户列表和总数。
- 查询参数：role

#### 参数定义

```json
{
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "description": "可选，按角色筛选，例如 admin、trader、viewer。"
    }
  }
}
```

### 3. get_user

- 描述：按用户 ID 查询单个用户详情。
- 方法：GET
- 路径：`/api/users/{userId}`
- 返回：返回指定用户的详细信息。
- 路径参数：userId

#### 参数定义

```json
{
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "description": "用户 ID，例如 user_1776072605468。"
    }
  },
  "required": ["userId"]
}
```

### 4. update_user_role

- 描述：修改指定用户的角色。
- 方法：PATCH
- 路径：`/api/users/{userId}/role`
- 返回：返回更新后的用户信息。
- 路径参数：userId
- 请求体字段：role

#### 参数定义

```json
{
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "description": "要修改的用户 ID。"
    },
    "role": {
      "type": "string",
      "description": "新的角色，例如 admin、trader、viewer。"
    }
  },
  "required": ["userId", "role"]
}
```

### 5. delete_user

- 描述：删除指定用户。
- 方法：DELETE
- 路径：`/api/users/{userId}`
- 返回：返回删除结果和被删除的用户 ID。
- 路径参数：userId

#### 参数定义

```json
{
  "type": "object",
  "properties": {
    "userId": {
      "type": "string",
      "description": "要删除的用户 ID。"
    }
  },
  "required": ["userId"]
}
```
