# Cyber Temple · 赛博寺庙

当前主项目位于 **`mirror/`**：保留 [Sansa Temple](https://sansatemple.com/) 的公开发布场景与交互，使用自建 Node.js 服务实现本地房间、访客同步和活动。当前只有一套寺庙场景，包含 12 个地图地点和 20 个独立多人房间。

需要 Node.js 22 或更高版本。在仓库根目录执行：

```sh
npm --prefix mirror ci
npm --prefix mirror run check
npm --prefix mirror start
```

打开 [本地游戏](http://127.0.0.1:4191/)。浏览器回归需要已安装的 Chrome：`npm --prefix mirror run test:e2e`。

- [自建代码结构与维护命令](mirror/README.md)
- [运行说明](docs/mirror-runbook.md)
- [复刻范围、差异和未验证项](docs/mirror-acceptance.md)
- [等行为重构验证报告](RECON/refactor-2026-11-11/report.md)

`mirror/baseline/` 是只读发布基准，`mirror/site/` 是带三处登记补丁的运行副本。格式化仅处理自建代码，不能直接格式化原站发布包。Git 保留运行资源、代码、测试和验收摘要；原始网络记录、大型截图/视频、依赖、构建产物及本地快照保留在本地。

原站程序、素材及商标归原作者及其注明的权利人所有；本仓库不对这些内容授予新的许可。未取得原作者开发工程和服务器源码，整站再分发及公开部署许可尚未确认。音频及模型等原始署名保留在资源和记录中。

## 早期自建原型：云栖山寺

以下是保留的早期版本，使用根目录的 `src/`、`server/`、`public/` 和 `package.json`；启动入口与当前镜像不同。

可独立运行的浏览器 3D 寺庙。项目以山寺公开访客体验为参照，使用自建场景、角色和房间服务。当前完成范围和复刻差距见[验收记录](docs/acceptance.md)。

## 启动

需要 Node.js 22 或更高版本。在项目目录执行：

```sh
npm ci
npm run build
npm start
```

打开 http://127.0.0.1:4173/。双开独立浏览器窗口，选相同房间即可体验共处。开发模式使用 `npm run dev`，`PORT` 可覆盖本地端口。

## 操作

点击或轻触地面行走，拖动转向，滚轮或双指缩放。桌面支持方向键及 WASD。数字键 1 礼拜、2 念珠、3 合掌、5 木鱼。靠近法堂蒲团后可以落座。地图可快速到达山门、法堂、莲池、灯径和茶舍。

## 验证

```sh
npm test
npm run build
npm run test:e2e
```

浏览器测试需要本机 Chrome。测试启动独立端口并阻断外站请求，浏览器截图写入 `test-results/`。

## 取证和授权

`RECON/` 保留原站公开客户端的取证文件，用于对照。`dist/` 仅包含本地实现。诵念录音采用韩国著作权委员会发布的 CC BY 4.0 音源，详见 [署名文件](public/audio/ATTRIBUTION.txt)。
