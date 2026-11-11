# 自建代码等行为重构验收

结论：自建镜像代码已完成格式化与职责拆分。所覆盖的协议消息、状态及 HTTP 行为与重构前一致；最终代码通过原有界面回归。没有修改原站发布资源或补丁内容。

## 改动

- 服务端按启动、HTTP、WebSocket、房间会话、协议分发、上香、施工及咖啡划分模块；保留原启动命令、公开导出及活动状态字段。
- 将压缩式语句展开，整理局部变量命名。16 个工具脚本和原有测试保持可执行语法树一致；浏览器测试仅新增独立证据输出目录选项。
- 固定 Prettier 3.9.10 开发依赖，新增 `format`、`format:check`、`check`。原有依赖锁定条目保持一致。
- 增加冻结的行为期望值及差分测试，补充模块职责、维护命令和基线变更规则。

## 最终验证

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 全新 `npm ci` | 通过 | `clean-install-after.log` |
| 格式、资源校验及单元/集成测试 | 27/27 通过 | `check-final.log` |
| 有序消息和状态差分 | 478 步、711 条消息一致 | `tests/fixtures/behavior-before.json`、`check-final.log` |
| HTTP 差分 | 35 种请求的状态/响应头/正文一致 | `tests/fixtures/http-before.json`、`check-final.log` |
| 比较器检错能力 | 刻意扰动消息后按预期报错 | `tests/equivalence.test.mjs` |
| 运行时代码语法树 | 27 项检查一致，允许局部命名与接收者变化 | `runtime-ast-comparison.json`、`verify-runtime-ast.mjs` |
| 工具与原有测试语法树 | 20 个文件通过 | `format-ast-comparison.json` |
| Chrome 界面回归 | 6/6 通过 | `browser-final.log`、`browser-final/` |
| 原始/运行资源、清单及补丁 | 216 个文件 SHA-256 未变 | `protected-assets-before.json`、`integrity-after.json` |
| 旧原型 | 103 个文件 SHA-256 未变 | `original-project-integrity.json` |
| 重构前快照 | 28 个文件 SHA-256 未变 | `integrity-after.json`、快照 `manifest.json` |
| 重启后的预览 | HTTP 200、WebSocket snapshot 正常 | `preview-after.json` |

测试涵盖念珠、音频、工具、模拟支付、法堂礼拜、制作咖啡、刷新恢复、独立访客同步、换房、断线恢复、桌面环视/缩放、触屏模拟及资源失败恢复。手机测试仍是 Chrome 模拟，原有 Safari/真机未验收状态保持不变。

## 边界与回退

基线从修改前实现采集，固定时钟及 UUID，仅排除 HTTP 的 Date 和连接保活响应头。测试保留当前内存存储、账户/礼拜记录残留等既有行为，没有混入功能修复。语法树检查补充核对已移动业务主体的条件和调用顺序；有限测试不构成对任意输入的形式化证明，也不代表原服务规则全部复现。

快照：项目根目录 `.snapshots/pre-maintainability-refactor-2026-11-11/`。需要回退时先在独立目录检查快照，按其 `manifest.json` 恢复自建文件并删除本次新增模块，再用快照锁文件安装依赖；避免覆盖后续工作。原历史取证和 `RECON/mirror/release-manifest.json` 保留。

最终自建文件和验证日志哈希见本目录 `release-manifest.json`。维护说明见项目根目录 `mirror/README.md`。预览：<http://127.0.0.1:4191/>。
