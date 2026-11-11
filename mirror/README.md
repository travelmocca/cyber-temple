# Sansa 发布产物本地镜像

原站：[sansatemple.com](https://sansatemple.com/)。2026-11-11 冻结公开发布程序，在保留 Three.js r180 渲染、模型、材质和交互的基础上提供简体中文界面；本地 Node.js 服务替代原在线服务。没有取得原作者开发工程或服务器源码。

```sh
npm ci
npm run verify:assets
npm test
npm start
```

打开 [本地镜像](http://127.0.0.1:4191/)。另开独立浏览器窗口/隐私窗口并选择相同服务器，即可互相看见。没有注入虚拟访客；场景中 4 位常住僧由原前端自带。

入场先选择求财、事业、姻缘、健康、学业、家庭、转运、心安之一，再从五座推荐佛寺中查看介绍、换批或进入。84座佛寺覆盖34个地区，资料与依据存于 `entry/catalog.json`，每区2至5座。选寺只改变当前浏览器的山门匾额，继续使用原有场景、房间及活动。真实寺院资料在入场前介绍，场景采用统一虚拟呈现。

入口以实际山门截图 `entry/gate-background.jpg` 为全屏背景，心愿、推荐与介绍在同一悬浮面板中切换；手机可横滑寺院卡片。选寺后才加载游戏，真实场景就绪后淡出入口，失败时在浮层重试并恢复选寺记录。

`entry/` 为独立静态入场模块，通过 `/temple-entry/` 提供。`npm run entry:patch` 根据当前本地化补丁重建入口与匾额的两项审计补丁。`npm run localize` 会自动继续重建入场补丁。原始只读基准不变。

浏览器回归：`npm run test:e2e`，使用本机 Chrome。`PORT=4192 npm start` 可更换端口。测试使用独立临时端口。

## 自建代码结构

```text
server/
  index.mjs                  创建服务、启动、关闭
  http.mjs                   HTTP 路由、静态文件、音频 Range
  websocket.mjs              握手、来源检查、限速、消息收发
  presence.mjs               房间、会话、断线恢复、广播
  protocol/
    constants.mjs            地图、房间、消息类型、坐垫坐标
    dispatch.mjs             消息校验、请求去重、业务调用顺序
  activities.mjs             保持原接口与状态的活动入口
  activities/
    incense.mjs              上香排队、仪式、有效期
    construction.mjs         施工工序和进度规则
    cafe25.mjs                咖啡、礼拜积分、赠送、座位
tests/
  fixtures/                  重构前冻结的协议及 HTTP 行为
  helpers/                   固定时钟、随机 ID 和行为采集
  browser/                   Chrome 真实界面回归
tools/                       原站取证、资源校验和对照脚本
locales/                     简体中文词典与文本处理
```

`PresenceHub` 管理生命周期，`dispatchMessage` 决定消息处理与事件顺序，活动模块承载规则。上香和施工函数操作 `Activities` 持有的状态，保持原有字段、方法及调用方兼容。修改某项规则时应进入对应活动模块；修改网络入口时应进入传输模块。

```sh
npm run format        # 格式化自建服务、工具及测试
npm run check         # 格式、发布资源完整性、全部单元/集成测试
npm run test:e2e      # Chrome 界面回归
```

格式化命令明确限定自建文件，并排除发布资源、只读基准和审计补丁。Prettier 版本锁定在开发依赖中。行为基线来自重构前实现，测试覆盖 478 个操作步骤、711 条有序协议消息与状态，以及 35 种 HTTP 请求。不要为消除重构差异重新生成期望值；真正修改功能时单独评审基线变化。

重构前快照位于 `.snapshots/pre-maintainability-refactor-2026-11-11/`，验证记录位于 `RECON/refactor-2026-11-11/`。现有内存存储、离线账户/礼拜记录残留和不支持的原站功能均沿用当前行为。本次测试不代表原服务规则已全部复现。

浏览器证据可用 `MIRROR_E2E_OUTPUT=/absolute/output/directory npm run test:e2e` 输出到独立目录，保留历史验收记录。

`baseline/site` 是不可修改的原始响应。`site` 是运行副本；改动只允许通过 `patches/patches.json` 中的精确哈希补丁登记。当前 9 项补丁包括移除统计脚本、替换两个支付跳转、4项中文文本和语言元数据补丁，以及入场加载和山门匾额两项补丁。

中文词典位于 `locales/zh-CN.json`，覆盖 588 个文本片段（含模拟支付和默认访客名）。修改后运行 `npm run format`、`npm run localize`、`npm run check`，再运行浏览器回归。生成器仅编辑 JS 字符串/模板文字并核对可执行语法树，保留表达式、标识符、HTML 属性结构及原始素材；详细边界见 [中文说明](../docs/zh-CN-localization.md)。

当前验收结论和差异见 [验收记录](../docs/mirror-acceptance.md)，完整复现方式见 [运行说明](../docs/mirror-runbook.md)。

来源与许可：原站内容与商标归原作者及其标注的权利人所有。保留原站音频、博物馆模型等署名。未确认整站再分发许可，本项目按本地研究保存，不公开部署。第三方研究参考 [studyguy/studyguy.github.io](https://github.com/studyguy/studyguy.github.io) 未发现 LICENSE；运行程序和素材由原站重新获取，未采用其汉化包或虚拟玩家服务。
