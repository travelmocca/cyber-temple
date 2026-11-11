# 当前发布客户端与本地在线服务

## 证据与版本

原站主包 `assets/game-U0Pmc8tU.js`，SHA-256 `d60f3877ae848853e2e4ea2d41dadf9c9cd4736a4d768b6c93f2f67456e64d18`。以下区分 SOURCE（发布文件或实际原站响应）、PARTIAL（仅部分分支）和 INFERENCE（本地替代规则）。

- SOURCE：`network/source-dual-session.json` 的两名独立访客处于同一 `maru-20`、实例 0，并互相在快照中看到对方。
- SOURCE：`network/source-room-directory.json` 为本轮实际房间目录响应。
- SOURCE：`network/source-incense-near-altar.json` 记录原站加入、获准、队首开始和退出；`comparisons/source-incense/` 另有真实浏览器完成仪式的截图、状态和录像。
- SOURCE：`comparisons/source-actions-first-attempt/results.json` 有礼拜完成确认与计数；`comparisons/source-actions/results.json` 有真实制作赠送杯的请求和反馈。
- SOURCE：`network/source-ws.json` 记录前端实际访问的连接与帧，令牌被脱敏。二进制帧仅保存长度，不宣称已经保存完整解码的所有运动记录。
- PARTIAL：公开服务的座位耗尽、长时间断网、施工完成与跨服溢出、所有咖啡交接和许愿分支未全量观测。

## 接口和握手

| 接口 | 当前客户端用途 | 本地行为 |
|---|---|---|
| `GET /api/rooms/village` | `ok/map/rooms/serverTime`；目录中 `id/number/count/capacity/checkedAt/stale` | 20 个房间；room=auto 选择首个有空位房间，默认每房 50 个真实连接；目录不计原前端自带的 4 位常住僧 |
| `WS /presence/village` | `map=village-1`，`protocol=2`，`wire=3`，room、instance、region、resume、visit、garden、cafe25、construction 等参数 | 相同路径和客户端可接受的 JSON 快照、增量与事件 |
| `POST /api/entry-stage` | 客户端启动阶段遥测 | 204；不影响游戏状态 |
| 本地 `/__mirror/payment` | 无原站对应服务 | 明确标识的支付模拟反馈，不转发到原支付商 |

当前原站使用二进制增量（magic `1397642035`，28 字节头，profile JSON 与运动记录）和 JSON 消息混合传输。原客户端同时接受 JSON `delta`，本地使用这条兼容分支，未实现原站二进制压缩和 ACK 背压策略。原客户端原样发送 ACK；本地消费但不施加原服务拥塞规则。

客户端实际移动发送通常被限流到约 500 ms。初次协议探针因缺少 ACK/发送节奏不符不能证明原站拒绝上香；补齐 ACK、按客户端节奏发送后取得获准结果。失败探针保留为 `source-incense-first-attempt.json`，不计入通过。

## 消息处理表

| 客户端消息 | 关键字段 | 响应/广播 | 状态与依据 |
|---|---|---|---|
| move | 有限数值 x/z/yaw，pose=walk/kneel/beads/dance | delta/upserts/revision/serverTime | SOURCE 字段；本地校验坐标范围但没有重建原服务移动反作弊 |
| hello / bow / bead | type | event，礼拜另有 bowAt | SOURCE；同房广播 |
| seat | 正整数 requestId | seat-granted(seat) / seat-unavailable | SOURCE；本地选空闲近邻坐垫，原服务选择策略仍为替代 |
| stand | type | 清除 cushion 的 delta | SOURCE；释放坐垫 |
| incense-join | requestId | incense-queue-result(accepted) + incense-queue(queue) | SOURCE；本地入口距离兼容原界面，准确原服务阈值未确定 |
| incense-start | type | incense-start(id,at,serverTime) | SOURCE；仅队首可开始 |
| incense | requestId | incense-result(accepted) + incense(offering) | SOURCE；offering 恰含 id/visitorId/at/expiresAt，寿命 120 秒 |
| incense-leave / incense-abandon | type | incense-queue | SOURCE 名称与取消；本地断线/队首推进的完整规则为 INFERENCE |
| sync | type | snapshot | SOURCE |
| ping / pong | type | pong/serverTime 或消费 | SOURCE |
| ack | revision | 消费 | SOURCE，原二进制背压不复现 |
| entry-active / entry-idle | type | 本地消费活动/释放空闲连接状态 | SOURCE 客户端；空闲政策不是原服务一致性声明 |
| leave | type | 释放访客、坐垫、队列、临时活动 | SOURCE；显式退出不允许继续恢复该令牌 |
| room-switch | room/requestId | 本地 snapshot / room-switch-denied | 原客户端保留的回退路径；本轮原服务对直接消息返回 invalid-message，弹性模式实际新建 WS。不能称该消息原站成功 |
| interest | bbox/requestId | 本地全量 update + interestId | SOURCE 客户端字段；本地不启用原兴趣区域裁剪 |
| village-bell | type | village-bell(id,at,serverTime) | SOURCE 客户端；本地同房广播，完整原服务节流未取证 |
| construction | action=equip/take/drop/return + requestId | construction-result(ok) + construction-state | SOURCE schema/客户端顺序；本地按工位距离和顺序校验，1000 张目标；本地跨房间溢出已实现，原站精确分配仍未验证 |
| lantern-yard-hang | requestId/slot/wish/palette | lantern-yard-result(unavailable) | 客户端存在，当前原站快照未开放 lanternYard；明确拒绝，未伪造可用功能 |
| cafe25 | action/payload/requestId | cafe25-result(result.state) + 各访客 cafe25-state | SOURCE schema；具体本地服务规则为替代 |

未识别消息返回 `error/unsupported-message`。JSON 非法、有限值或请求标识错误返回 `error/invalid-message`。所有已识别客户端发送类型均有消费、成功/失败响应或明确拒绝，没有用静默丢弃使请求永久等待。

## 快照和状态归属

snapshot 包含 `map/room/instance/region/selfId/visitors/revision/serverTime/visitToken/resumed/entryIdle/incense/incenseQueue/construction/cafe25`。访客包含 `id/name/seat/cushion/color/joinedAt/pose/position`，可附 `bowAt`。坐垫合法索引为 0–23，预留常住僧位置 0、5、6、11；真实访客不能占用这些坐垫。坐垫坐标公式直接来自当前客户端 `mo()`，没有沿用旧镜像的 10 列布局。

queue 恰含 `revision/members/activeId/expiresAt`。队首等于 members[0]，空队列为 null/0；队首租期 60 秒。后续访客入列不能重置正在进行的仪式或延长队首租期。迟到的同 requestId 请求不重复生效；退出、换房和断线均清理占位。

cafe25 state 有 `authorityEpoch/revision/selfId/bows/credit/cup/cups/incoming/outgoing/seats/effect/effects`。本地实现 sync、measure、bow-complete、mint、pickup、sip、clear、dispose、offer、request、approve、accept、decline、cancel、seat、stand。当前在线客户端的制作时长为 5 秒，完成后由服务端将 pickedUp 置真；旧客户端本地 fallback 的 4.8 秒不能替代此规则。个人杯需 25 个礼拜积分，每杯 3 口，赠送杯不能自行饮用。完整交接动画、所有垃圾桶政策、原服务距离和持久化边界没有逐项对齐，不计为原服务完整通过。

## 明确替代与尚未对齐

1. 仅一个本地 Node 进程、一个地区/实例；20 房间和状态均在内存，服务重启清空。没有原站多地区弹性调度、长期存储或原始后端源码。
2. 短暂掉线最多保留 30 分钟的身份、位置、积分和杯子，释放坐垫/队列；原服务完整保留时限、容量和分配细节未验证。连接中的同一令牌不能再创建重复访客。
3. 本地不注入虚拟玩家。4 位常住僧由未修改的原前端生成，不计作第二个真实在线访客。
4. 座位选择、上香近场阈值、咖啡交接时序/距离、施工工位容差、并发拒绝和持续状态属于本地规则；单元测试验证其一致性，不自动升级为原站相同规则。
5. 施工跨服溢出/全服完成的原站精确时序、许愿灯当前开放条件、所有咖啡交接分支、限时活动、设备与异常组合仍有未验证项目，详见体验矩阵。
