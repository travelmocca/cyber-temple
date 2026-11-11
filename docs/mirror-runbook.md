# 山寺本地镜像运行说明

## 当前入口

镜像目录：`/Users/faria/Documents/ChatGPT/赛博寺庙/mirror`。默认地址：<http://127.0.0.1:4191/>。

旧原型的 `src/`、`server/`、`public/`、根目录 `package.json` 与既有 4174/4180 服务保留。新镜像不使用根目录的启动和测试命令。

## 安装、校验、启动

需要 Node.js 22 或更新版本。进入项目根目录：

```sh
npm --prefix mirror ci
npm --prefix mirror run verify:assets
npm --prefix mirror test
npm --prefix mirror start
```

默认只监听 `127.0.0.1:4191`。若该端口已被占用，先检查占用进程，不要终止其他项目；使用 `PORT=4192 npm --prefix mirror start`。浏览器回归自行申请临时端口，不影响预览。

```sh
npm --prefix mirror run test:e2e
```

维护自建代码时运行 `npm --prefix mirror run format`，提交前运行 `npm --prefix mirror run check`。结构与职责见 `mirror/README.md`。行为等价测试使用重构前冻结的期望值，不依赖本地快照目录；仅在明确修改功能并审核差异后才能更新基线。

浏览器回归需要已安装的桌面 Chrome，macOS 使用 Metal。移动端测试是 Chrome 触屏模拟，不能作为 iPhone/Android 真机通过证据。

## 使用

无需登录，打开即进入。地图可选择 12 个地点，角色会沿路径行走。拖动环视，滚轮缩放；WASD/方向键行走。数字键 1 礼拜、2 念珠、3 合掌、5 木鱼。念珠可在其画布获得焦点后使用上下方向键拨动；木鱼有手动和自动模式。

靠近法堂后礼拜会申请坐垫。上香需要走到殿内香炉附近；靠近后出现上香入口，加入队列、轮到后开始仪式。咖啡地图入口先到柜台附近，再打开咖啡菜单并制作；赠送杯不能自行喝，个人杯需要完成 25 次礼拜。原前端保留这些约束，携杯状态也可能限制其他动作。

多人验证用两个独立浏览器上下文/隐私窗口，选择相同“산사 서버”编号。普通同一浏览器内多标签的渲染休息机制由原前端管理；四位常住僧不是本地服务器模拟的在线访客。

供养入口保留原界面。点击支付链接打开本地“모의 공양”页面，仅给出模拟反馈，没有向支付服务发请求或真实付款。

## 文件与补丁

- `mirror/baseline/manifest.json`：107 个文件的 URL、状态、MIME、大小、SHA-256、抓取时间，哈希以解压后的响应字节为准。
- `mirror/baseline/site/`：原始响应，只读基准。
- `mirror/site/`：工作副本。
- `mirror/patches/patches.json`：3 项精确补丁，各项保存版本前置哈希、唯一匹配、修改后哈希和原因。

校验会拒绝基准文件缺失、篡改，未登记文件、工作副本额外修改、版本不符、补丁零匹配/多匹配或结果哈希不符。恢复运行副本的登记补丁：

```sh
npm --prefix mirror run patch
npm --prefix mirror run verify:assets
```

`patch` 从原始基准重建有补丁的目标文件；执行前保存自己对这些文件的实验改动。不要直接格式化或重写发布包。采集脚本用于取证，已冻结目录会阻止重新采集覆盖；原站新版本应另建目录和清单。

## 服务状态与限制

房间、访客、坐垫、上香、咖啡和施工状态保存在内存，重启服务会清空。本地复连保留访客身份和位置最多 30 分钟，释放坐垫与队列；此保留策略不宣称与原服务完全一致。原站多地区、弹性实例、二进制增量压缩、长期持久化及限时活动服务未复现；本地以兼容客户端的 JSON 快照/增量实现 20 个房间，默认每房 50 人。

退出后重新进入、断线重连和刷新各有原前端状态规则。完整差异及未验证分支见验收记录，不把本地测试通过写成原服务规则一致。

## 证据与回退

取证与对照：`RECON/mirror/`。其中 `comparisons/gate/` 为同条件入口、近景、法堂、池畔、环视与路线记录；`comparisons/regression/` 为浏览器回归；`network/` 为脱敏网络和协议记录。

旧工程快照在 `.snapshots/pre-mirror-2026-11-11.tar.gz`，SHA-256：`7e9f44b996ab4859b9335df007faf4dcbef21922fc86acadfa2dfed8754f8901`。需要恢复时先解压到新目录核对，避免覆盖后续工作。

Safari 实测需要 Safari 设置中“允许远程自动化”；本轮未改系统设置。其失败原因已保存在 `RECON/mirror/comparisons/safari/result.json`。真实 iPhone Safari 和 Android Chrome 仍需另行验收。
