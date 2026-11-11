# 重构前行为基线

这两份 JSON 在 2026-11-11 修改服务端之前采集，作为等行为重构的期望值。

- `behavior-before.json`：固定随机 UUID 和注入时钟，保存 478 个步骤的有序消息、公开状态、内部 Map/Set、房间目录及去重缓存；共 711 条协议消息。包含原有离线账户和礼拜记录残留。
- `http-before.json`：35 个 HTTP 请求的状态码、响应头与正文，包含 Range、HEAD、错误路径、符号链接和模拟支付。只排除由 HTTP 服务器生成的 Date/连接保活响应头。

采集输入位于 `tests/helpers/behavior-trace.mjs` 和 `tests/helpers/http-trace.mjs`。随机 ID 替换仅发生在隔离的 Node 测试进程，`finally` 恢复原函数，不进入运行时代码。

来源快照：项目根目录 `.snapshots/pre-maintainability-refactor-2026-11-11/`。快照及基线哈希记录在 `RECON/refactor-2026-11-11/integrity-after.json` 和快照的 `manifest.json`。

运行 `npm test` 会比对完整结果，并刻意扰动一条消息确认比较器能检出差异。重构时不得用新实现覆盖期望值；修改功能时必须单独审核期望值变化。有限用例不等于对所有输入的形式化证明。
