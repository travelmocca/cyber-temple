# 山寺（sansatemple.com）前端逆向初查

2026-11-09 · REA 6.8.0 · 独立 Chrome 配置，通过本机 CDP 连接。

## 已拿到的证据

- [页面取证](rea-page.json)记录了进入公开房间后的脚本、资源、DOM 和有限的网络观察窗口。
- [脚本清单](scripts/manifest.json)记录 4 个同源 JavaScript 模块的原始 URL、相对路径、长度和 SHA-256。4 个模块都未报告 source map。
- 主包 game-U0Pmc8tU.js 包含 Three.js 的 WebGLRenderer，以及 GLTFLoader、DRACOLoader、KTX2Loader。可检索的 GLB 路径包括僧人、远端僧人低细节模型、佛像、菩萨像和松树。代码还引用了心经和诵念音频。这里确认的是客户端代码中的实现与引用。
- 主包包含 WebSocket 构造和原站、Cloudflare Workers 的 wss 地址，并引用 /api/entry-stage、/api/rooms/village。本次取证附着时房间已加载，未观察到 WebSocket 建连，服务端协议、房间分配算法和状态同步规则仍待验证。
- 取证范围是浏览器收到的同源脚本与资源记录。模型、贴图和音频未完整下载，导出脚本也未验证能脱离原站运行。

## 可继续验证的方向

如需做本地赛博寺庙原型，可先从主包追踪场景加载、角色移动和礼拜动作，单独验证这些机制。多人同步需要另开一次从页面导航前开始的观察，记录进房与两名访客执行动作时的公开客户端行为。

原站未发现可确认的开源许可证。此目录用于本地分析，代码与素材的复用授权应分开核实。
