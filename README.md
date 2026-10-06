# MirrorN

**由贡献者通过 Git 共同维护的资源目录与文档站。**

MirrorN 人工整理软件、运行时、软件包、数据集、模型、系统镜像、容器和学习文档，将来源、安装方式和使用说明组织成可阅读、可交互的资源页面。不再作为镜像采集、测速或后台数据库管理系统开发。

## 当前状态

2026-10-06：旧项目已归档，新项目的产品、架构、内容、视觉和交付规范已建立。**新站尚未实现；当前根目录没有可运行应用、package.json 或新站 CI。** 不要执行归档中的旧启动命令来验证新站。

旧受控文件的原始字节和 SHA256 清单均已保留。P0 已经用户确认，本次提交包含旧项目归档与新架构规范；P1 尚未开始。资源写作格式为普通 Markdown＋自定义指令，站点统一映射为可复用组件，不要求作者编写 MDX／JSX 标签。归档入口：[archive/README.md](archive/README.md)。

## 阅读入口

| 需要了解 | 权威文档 |
| --- | --- |
| 产品定位、页面行为与范围 | [MAIN.md](MAIN.md) |
| 整个开发流程、阶段门槛、当前进度 | [PLAN.md](PLAN.md) |
| 视觉、顶部导航与响应式布局 | [DESIGN.md](DESIGN.md) |
| 技术架构、模块边界与目标目录 | [docs/architecture.md](docs/architecture.md) |
| 资源文档、Front Matter、来源和组件契约 | [docs/content-spec.md](docs/content-spec.md) |
| PR、贡献与内容维护 | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 构建、部署、回退与日常维护 | [docs/delivery.md](docs/delivery.md) |
| 全项目验收条件 | [docs/acceptance.md](docs/acceptance.md) |
| 为什么放弃旧方向 | [docs/decisions.md](docs/decisions.md) |

## 使用与贡献

最终网站提供「首页」「已收录」「关于本站」三个顶层入口。首页搜索资源，已收录页按类别展开名称卡片，资源页展示文档与下载／安装组件。网站公开访问，无用户账号或管理后台。

内容以 Git 中的资源目录为唯一事实来源。通过 PR 添加、修订、下架资源；审核合并后由静态构建发布。新命令将在工程骨架完成时加入本文件，在此之前不提供伪造的安装或启动步骤。

生产域名、实际贡献仓库链接和项目许可证尚未配置；首次公开发布前按 [交付门槛](docs/delivery.md#6-首次公开发布门槛)落实。`example.com` 仅是原需求占位，不作为真实贡献入口。
