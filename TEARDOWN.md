# 发布产物与本地适配边界

所有 SOURCE 文件位于 `baseline/site`，文件哈希在 manifest。压缩主包仍以原样保存；下述符号是冻结发布文件内的函数/类名，不是推测恢复的开发模块。

| 支柱 | 真正来源/调用边界 | 本地处理 |
|---|---|---|
| 启动 | index.html → `assets/index-qXYao_lF.js` → 动态 import `game-U0Pmc8tU.js` 和 `game-CvBwdk0t.css` | 同路径静态服务；保留启动失败重试；仅删入口 Cloudflare 注入统计 |
| 渲染与场景 | game 主包内 Three.js r180，`qz` 世界控制器调用 `C8` 场景加载，真实模型/材质/纹理均由 manifest 登记 | 不重画、不格式化改写、不调视觉参数 |
| 角色/动作 | 主包中的 monk GLB 加载、`Oi` 礼拜时序、`jn` 上香轨迹、念珠/木鱼控制器 | 完全保留。GL 制服相机探针只在取证浏览器运行，不写入产品文件 |
| 路径 | `assets/village-route-worker-4FUpLuoq.js`，主包 `walkTo` 异步规划后才设置 canvas destination | 本地仍用原 Worker；测试等待真实目标坐标，不能以暂时无 destination 判到达 |
| 联机客户端 | 主包 `f_` 构造同源 `/presence/village` 与 `/api/rooms/village`；`yF` 及 `wF` worker bridge；`presence-worker-BB8LPRz2.js` | 不改客户端协议与 transport。服务端用 ws 8.22.2 回复 JSON 兼容分支 |
| 快照/验证 | 主包 `validVisitors`、`x2`、`mo`、`v2`、`Tu` 验证访客、坐垫、上香队列和咖啡状态 | 外部 Node 状态机满足当前结构，并明确标出尚未取证的原服务策略 |
| 咖啡 | 主包 `Vz` 通过 cafe25 action 与服务交互；`ev=5000` 为当前在线制作时长；fallback 的 `n2=4.8` 秒是另一分支 | 本地权威状态、积分、杯子、offer、园中席位；不是只让 UI 按钮变可点击 |
| Safari 布局 | index 模块另动态加载 safari-scene-bleed 与 visible-viewport 两个模块 | 两模块同版本保留；不以其存在证明 Safari 已实测 |
| QR/哈希 | `qrcode-5IewWFXk.js`、`sha2-BqLbjB6e.js` 按真实引用保存；部分素材有内嵌 SHA 校验 | 不换近似素材；当前脚本/资源错误为零的证据见对应运行记录 |
| 本地服务 | `server/index.mjs`、`presence.mjs`、`activities.mjs` | 静态 MIME/Range/路径校验；房间、真实访客、排他坐垫、队列、咖啡、施工；无虚拟访客注入 |

源站可访问发布文件没有 sourceMappingURL 指向可得开发源码；对入口、主包与 presence Worker 的 .map 探测均返回 404（`source-map-probes.json`）。不把压缩包格式化等同于恢复原工程。

服务端差异、所有发送类型及回复见 `RECON/mirror/protocol.md`。实际帧的 `visitToken`/visit 查询值脱敏，不能将这些材料作为登录态迁移工具。
