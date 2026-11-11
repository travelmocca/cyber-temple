# 对照证据索引

同条件主样板：Chrome / Metal，1920×902，DPR 1，白天，同角色位置与观测相机。每侧完整条件见 `gate/*/samples.json`。

| 样本 | 原站 | 本地 |
|---|---|---|
| 山门正面 | [截图](gate/source/gate-front.png) | [截图](gate/local/gate-front.png) |
| 人物近景 | [截图](gate/source/avatar-close.png) | [截图](gate/local/avatar-close.png) |
| 法堂入口 | [截图](gate/source/hall-entry.png) | [截图](gate/local/hall-entry.png) |
| 池畔 | [截图](gate/source/pond.png) | [截图](gate/local/pond.png) |
| 半圈/整圈 | [半圈](gate/source/orbit-half.png) · [回正](gate/source/orbit-full.png) | [半圈](gate/local/orbit-half.png) · [回正](gate/local/orbit-full.png) |
| 完整移动+环视录像 | [原站录像](gate/source/route-and-orbit.webm) | [本地录像](gate/local/route-and-orbit.webm) |
| 12 地点到达与返回 | [逐项结果](roundtrips/source/results.json) | [逐项结果](roundtrips/local/results.json) |
| 上香完整仪式 | [状态](../comparisons/source-incense/results.json) · [录像](source-incense/ritual.webm) | [状态](local-incense/results.json) · [录像](local-incense/ritual.webm) |
| 咖啡制作 | [截图](source-actions/coffee.png) · [状态](source-actions/results.json) | [截图](local-actions/coffee.png) · [状态](local-actions/results.json) |
| 个人诵念 | [两侧实际播放/停止](chant.json) | [同一记录](chant.json) |
| 25 次礼拜/个人咖啡 | [结果](source-self-coffee/results.json) | [结果](local-self-coffee/results.json) |
| 性能 | [各三次原始样本](performance.json) | [同一记录](performance.json) |

`source-complete/` 与 `local-complete/` 是早期连续遍历，`journeys.json` 保留当时实际状态。其中一次本地咖啡路线在服务重启后中断、法堂动作选择器曾选错，不能把这些日志里的 arrived 或 failed 当作最终验收。最终到达/返回以 roundtrips 的真实目标坐标记录为准，视觉条件以 gate 重新采集的样本为准。

原站在线访客、随机植被、小动物/衣摆/风动和施工全服进度不能冻结，不用调色、移模型或修图掩盖这些差异。原始 PNG/JSON/WebM 保留，不进行图像编辑。
