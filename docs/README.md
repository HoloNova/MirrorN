# 项目文档地图

当前是新定位的规范与归档阶段，不是功能完成声明。进度只在 [PLAN.md](../PLAN.md) 维护。

| 文档 | 唯一职责 |
| --- | --- |
| [MAIN.md](../MAIN.md) | 产品目标、页面行为、范围边界 |
| [DESIGN.md](../DESIGN.md) | 布局、颜色与交互视觉规范 |
| [PLAN.md](../PLAN.md) | 全周期路线、当前状态、退役区与条件扩展 |
| [architecture.md](architecture.md) | 技术选择、模块地图、数据流 |
| [content-spec.md](content-spec.md) | 内容格式与组件契约 v1 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献者操作、PR 审核与日常维护 |
| [delivery.md](delivery.md) | 命令职责、CI、部署、缓存与回退 |
| [acceptance.md](acceptance.md) | 可观察的完成条件与人工验收 |
| [decisions.md](decisions.md) | 重大决策的原因与替代方案 |
| [归档说明](../archive/README.md) | 历史基线与本地数据去向 |

## 文档更新约定

产品行为变化修改 MAIN；内容字段或组件属性变化修改内容规范并处理版本兼容；结构变化修改架构地图；阶段完成修改 PLAN；重要取舍追加决策记录。其他文档链接到权威定义，不复制一套会分叉的字段表。

历史文档移入 archive，不再作为当前需求依据。每次实现只更新受影响的文档，不能把“设计完成”“代码完成”“通过验收”“已经上线”写成同一个状态。
