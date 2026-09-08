# dsh-response-meta

[English](./README.md) | 中文

一个 dsh Web 插件：为每次模型输出显示一条实时运行摘要：**模型名、推理程度、
toks/s、时间戳、总用时、首 token 延迟**。模型还在响应时摘要就会出现，并随
chunk 到达持续更新，不再等到响应完成。
这些信息一直可见；插件隐藏重复的原生 AI 回复时间戳，同时保留用户消息时间戳、
原生用量和运行时间详情按钮。手动中断（含思考阶段就停止）时也会在消息流里补一行，
显示模型与已生成的推理量。

示例（11px 灰色文字）：

```
# 响应进行中（消息流内实时更新）
deepseek-v4-pro · 思考 1.5k 字 · ~42 tok/s
# 正常完成（消息底部操作栏）
deepseek-v4-pro · 思考 15 tok · 46 tok/s · 14:16 · 用时 2分24秒 · 首 token 2.1秒
# 思考阶段被中断（消息流内一行）
deepseek-v4-pro · 思考 1.5k 字
```

- 模型名：来自会话日志中每次请求前记录的 `request/header`（与每条消息按 turn 对应）。
  配置没变的后续 turn 不再落 header，因此按 turn 继承上一次已知模型。
- 实时更新：模型名或流式 token 数据一可用就显示；推理量和估算吞吐量按浏览器
  动画帧刷新，响应完成后再用提供商的最终 usage 替换估算值。
- 推理程度：优先显示提供商上报的 reasoning tokens（`思考 15 tok`）；未上报时退回推理文本字符数（`思考 80 字`）。
- toks/s：该消息的输出 token 数 ÷（首 token 到消息完成）的解码耗时，与内置时钟同口径。
- 时间戳：消息完成时间；当天只显示 `HH:mm`，历史消息保留日期。
- 总用时：该 turn 从开始到结束的时长；首 token：当前输出从 step 开始到首个 token 的延迟。
- 中断时通常没有 usage 记录，所以显示模型 + 已流出的推理字符数；若最终化竞态留下真实 usage，仍显示真实 toks/s。
- 任一字段缺失就省略该段；全缺则什么都不渲染。

## 要求

DSH `0.1.2-rc.1` 和 Web profile。`0.3.0` 通过新的 `uiConversation.events` 接口注册实时回复节点，并通过 `useChat` 读取已完成消息的数据；旧版 DSH 请继续使用插件 `0.2.1`。

## 安装

```sh
dsh plugin --profile web add github:Unintendedz/dsh-response-meta#v0.3.0
```

然后**重启正在运行的 dsh web 服务**（插件装载发生在服务启动时，重启后生效）。

## 本地开发更新

本地安装脚本要求显式指定 `DSH_HOME` 和 `--profile`（或 `DSH_PROFILE`），
不会默认操作已有 home 或 `web` profile。它通过 remove + add 刷新本地 `file:`
快照，并复用所选 profile 的 pnpm `storeDir`，支持路径中的空格。
之后只重启对应 profile 的 Web 实例。

每次测试都创建全新的临时 home 和合成工作区：

```sh
export DSH_HOME="$(mktemp -d "${TMPDIR:-/tmp}/dsh-response-meta.XXXXXX")"
export DSH_PROFILE=audit-response-meta
mkdir -p "$DSH_HOME/workspace"
./scripts/install.sh --profile "$DSH_PROFILE"
```

使用独立空闲回环端口和合成提供商、会话数据，不复制已有 profile 的设置、凭据、
会话、缓存或浏览器状态。在任何 Web 交互前记录 home、profile、端口、工作区及
进程 ID；测试后停止经过核对的测试进程，只删除它对应的临时目录。

## 卸载

```sh
dsh plugin --profile web remove dsh-response-meta
```

## 工作原理

- **主机侧**（`lib/index.js`）：在 `ctx.sessionProjections` 上注册一个零依赖的
  投影单元 `dsh-response-meta`，纯函数折叠会话事件：跟踪当前 turn/step，把每个
  turn 内最后一次 `request/header` 的模型名记入 `byTurn[turn]`；没有 header
  事件的 turn 继承上一次已知模型。turn 外的 header（标题、压缩等辅助调用）
  被忽略。投影值经既有 session-projection 通道送达浏览器（历史页基线 +
  `session/projection` 帧）。适配 投影契约（`stateSchema` + `wire.viewSchema`）。
- **浏览器侧**（`lib/client.js`）：
  - 响应进行中：从 `step/start` 起发布一个增量
    `dsh-response-meta-aborted` 会话节点；流式 chunk 最多每个动画帧刷新一次。
    可见的正式消息定稿后会隐藏这个稳定的 live 节点，并交给最终精确摘要；若
    step 被中断、失败或中止，同一个节点继续显示。
  - 正常完成的消息：注册进 `conversation.chat.assistant-actions` 列表槽
    （order 100，与复制/分支按钮并存）。组件按 `messageId` 从会话快照取出
    最终 assistant 节点，取其 usage（output/reasoning tokens）、timing
    （step 开始、首 token、完成）、turnTimings（turn 总用时）和 reasoning
    文本块，再从投影里取该 turn 的模型名。完成态摘要存在时，用语义化结构选择器
    只隐藏同一 AI 操作栏最后的重复时间戳；保留用户消息时间戳以及原生用量、运行时间详情按钮。
  - 增量节点通过 keyed `conversation.chat.node` 条目渲染。思考阶段就停止时
    日志里根本没有 `turn/end`，这条路径仍能显示；与最终化竞态留下的
    reasoning-only message 也不被视为「有答案」，照常显示。
  - 样式：字体 11px、颜色用主题的 `--dsw-alias-label-tertiary`、
    `user-select:none`、`pointer-events:none`。操作按钮留在第一行，完整摘要固定占据
    下一行；窄屏自然换行，不截断也不产生横向滚动。

## 验证

```sh
npm test
DSH_TEST_IDENTITY=/path/to/test-instance.json \
  node tests/live-e2e.mjs http://127.0.0.1:33880
```

live 命令还要求保留隔离启动器设置的 `DSH_HOME` 和 `DSH_PROFILE`。
身份 JSON 必须包含与该实例一致的 `dshHome`、`profile`、`host`（固定为
`127.0.0.1`）、数字 `port`、运行中服务器的数字 `pid`、`workspace` 和
`synthetic: true`。home 与工作区都必须位于操作系统的临时目录中，profile
名称必须以 `audit-`、`test-` 或 `fix-` 开头；脚本拒绝 33080 端口。
运行前在这个新 profile 中配置本地合成模型提供商，无需已有 profile 的凭据或设置。

脚本创建合成会话，仅当同一 turn 以 `completed` 正常结束、最终可见回答恰为
`OK`，且该 turn 有非空模型投影时通过。提前到达的投影、中断或失败的部分回答、
错误答案或超时都判定失败。`tests/` 中的浏览器脚本覆盖实时/中断行为和完成行布局，
同样只能在隔离实例与全新浏览器上下文中运行。
