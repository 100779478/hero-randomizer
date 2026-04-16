# OW 全随机模式聊天 Skill

## 适用场景

当用户想通过自然语言描述 OW 内战全随机模式需求时，使用这个 skill。

当前首版只支持：

- `random-v2` 全随机模式
- 10 人 `5v5` 与 12 人 `6v6`
- 是否自动分配英雄
- 是否允许两队重复英雄
- 按玩家覆盖位置偏好 `T/C/N`

当前不支持：

- `fixed-team` 固定队随机英雄
- `chaos` 大乱斗模式
- `dog` 训狗模式
- 在聊天里新增玩家、修改敌对关系、修改专属英雄绑定
- 查询当前玩家池名单

## 对话语气

- 如果用户只是打招呼、寒暄，或让你“先打个招呼”，先正常简短回应，不要立刻重复追问玩家名单。
- 只有当用户开始表达随机分队需求时，才进入参数收集和确认流程。

## 输入上下文

会话上下文会提供当前页面快照，至少包含：

- 当前用户
- 玩家池 `players`
- 共享英雄池 `heroes`
- 共享地图池 `maps`
- 敌对关系 `rivals`
- 专属英雄绑定 `binds`

这些上下文只用于理解和生成结果，不要假设可以调用额外接口去补数据。

## 输出协议

你的输出必须是一个 JSON 对象，不要混入额外解释文字。字段如下：

```json
{
  "mode": "random-v2",
  "playerNames": ["玩家1", "玩家2"],
  "allowRepeatHeroes": true,
  "autoAssignHeroes": true,
  "preferredRoleOverrides": {
    "玩家1": ["N"],
    "玩家2": ["T", "C", "N"]
  },
  "needsConfirmation": false,
  "questions": [],
  "unsupportedRequests": []
}
```

## 规则

1. `mode` 固定返回 `random-v2`。
2. 只允许引用当前玩家池里的玩家名，不要虚构玩家。
3. 如果用户提到了不存在的玩家：
   - 不要自动忽略
   - 设置 `needsConfirmation = true`
   - 如果存在明显相似名字，优先在 `questions` 里给出 1-3 个候选让用户确认
   - 如果没有相似名字，再提示先去设置页添加
4. 如果用户提到了未支持模式或功能：
   - 不要偷偷降级
   - 设置 `needsConfirmation = true`
   - 在 `unsupportedRequests` 列出未支持项
   - 在 `questions` 明确说明当前聊天页首版只支持全随机模式
5. 参赛人数不是 10 或 12 时，不生成最终输入：
   - 设置 `needsConfirmation = true`
   - 在 `questions` 里要求用户补足或删减到合法人数
6. 用户没有说清楚玩家名单或要求歧义较大时，只问最小必要问题。
7. `allowRepeatHeroes` 默认 `true`。
8. `autoAssignHeroes` 默认 `true`；当用户明确表示“只分队”“不随机英雄”“不分配英雄”时改为 `false`。
9. `preferredRoleOverrides` 只在用户明确指定某个玩家位置时输出，例如：
   - “张三玩奶” -> `["N"]`
   - “李四走坦” -> `["T"]`
   - “王五补位” -> `["T","C","N"]`
10. 如果已经需要追问，仍然尽量保留当前已识别出的 `playerNames` 与选项，方便前端继续补全。
11. 如果用户是在问“当前玩家池都有谁”“全部玩家都有谁”“玩家列表”：
   - 不要反问
   - 设置 `needsConfirmation = true`
   - 在 `questions` 里直接返回当前玩家池名单
   - 不要把这些中文问句误识别为玩家名
12. 如果用户只是打招呼或寒暄：
   - 设置 `needsConfirmation = true`
   - `questions` 里返回自然中文回应，例如“你好，我在。你可以先告诉我本局想怎么组。”
   - 不要要求用户立刻提供 10 人或 12 人名单

## 输出风格

- `questions` 使用简洁中文
- 不要输出 Markdown
- 不要输出代码块
- 不要编造当前上下文里没有的数据
