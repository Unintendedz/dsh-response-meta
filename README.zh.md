# dsh-response-meta

[English](./README.md) | 中文

一个 dsh Web 插件：为每次模型输出显示一条实时运行摘要：**模型名、推理程度、
toks/s、时间戳、总用时、首 token 延迟**。模型还在响应时摘要就会出现，并随
chunk 到达持续更新，不再等到响应完成。
这些信息一直可见；同一栏里原本需要 hover 才出现的原生时间组会被精准隐藏，
避免重复。用户提问自己的时间戳保持不变。手动中断（含思考阶段就停止）时也会
在消息流里补一行，显示模型与已生成的推理量。

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

## 安装

```sh
dsh plugin --profile web add github:Unintendedz/dsh-response-meta#v0.2.0
```

然后**重启正在运行的 dsh web 服务**（插件装载发生在服务启动时，重启后生效）。

## 本地开发更新

```sh
./scripts/install.sh   # remove + add，强制刷新本地 file: 快照
# 再重启 dsh web 服务
```

脚本会把 pnpm store 钉在 profile 已有的 `storeDir` 上，任意 shell 环境下运行都不会再出现
`ERR_PNPM_UNEXPECTED_STORE`。若曾手工动过 store，先重链一次：

```sh
cd ~/.dsh/profiles/web && pnpm install --config.confirm-modules-purge=false
```

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
  `session/projection` 帧）。适配 rc2 投影契约（`stateSchema` + `wire.viewSchema`）。
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
    只隐藏同一 AI 操作栏最后的原生时间组；不会命中用户消息时间戳。
  - 增量节点通过 keyed `conversation.chat.node` 条目渲染。思考阶段就停止时
    日志里根本没有 `turn/end`，这条路径仍能显示；与最终化竞态留下的
    reasoning-only message 也不被视为「有答案」，照常显示。
  - 样式：字体 11px、颜色用主题的 `--dsw-alias-label-tertiary`、
    `user-select:none`、`pointer-events:none`。操作按钮留在第一行，完整摘要固定占据
    下一行；窄屏自然换行，不截断也不产生横向滚动。

## 验证

```sh
node tests/host-fold.mjs      # 主机折叠纯函数（合成事件，含继承/中断场景）
node tests/client-harness.mjs # 浏览器包：纯函数 + 注册 + aborted 定义 + 组件渲染
node tests/live-e2e.mjs http://127.0.0.1:33880   # 需要一台跑着本插件的 dsh web 测试服
```

live-e2e 会创建一个小会话、发一句话、等 turn 结束，然后断言
`session.history` 的 projections 里出现 `dsh-response-meta.byTurn` 且模型名非空。
浏览器级的实时/中断场景可用 `tests/browser-interrupt.js` /
`tests/browser-interrupt-mid.js` 复验；完成态排布用 `tests/browser-layout.js` 复验。
