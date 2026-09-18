# MirrorN

MirrorN 是面向初学者与开发者的智能镜像导航和开发环境配置平台。当前已完成阶段 1–3：数据层与工程骨架、四步配置向导、前端搜索。测速、后端数据同步与资源共享尚未实现，见 `PLAN.md`。

## 本地启动

要求：Node.js `>=20.19.0`、pnpm `12`。

```bash
pnpm install
pnpm dev
```

- 前端：<http://127.0.0.1:5173>
- 后端健康检查：<http://127.0.0.1:8787/api/health>

只启动前端：

```bash
pnpm dev:web
```

只启动后端：

```bash
PORT=8787 pnpm dev:server
```

说明：

- `PORT` 可覆盖后端端口，默认 `8787`；如果当前 shell 已导出 `PORT`，后端会继承它而不是用默认值。
- **前端目前不请求后端**：镜像、生态与排错数据都随前端包一同构建，后端只有健康检查接口。因此做界面验收时只需 `pnpm dev:web`，关闭后端不会影响任何功能。真正的“静态单机模式 / 全功能模式”切换要到阶段 5 接入 MirrorZ 数据后才会出现。
- `pnpm dev`、`pnpm dev:web`、`pnpm build` 和 `pnpm build:web` 都会先执行数据校验，避免未校验的数据进入页面。

## 手动验收

启动 `pnpm dev:web` 后，按下面顺序检查（括号内是预期结果）：

1. 打开 <http://127.0.0.1:5173>（大搜索框居中，下方是 npm 与 pip 两张生态卡片）。
2. 按 `/` 键（焦点进入搜索框），输入 `tuna`（出现清华大学镜像站结果；按 Enter 展开它支持的生态入口）。
3. 输入 `pip` 后按回车（进入 pip 向导，显示前置条件与四个步骤）。
4. 切成 `Linux` 与 `Bash`，点“下一步”（列出官方、清华、阿里云三个来源）。
5. 点“清华大学”（命令变为 `python3 -m pip install --index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/ <包名>`）。
6. 依次查看“全局生效”和“配置文件”（前者是 `pip config set`，后者给出 `~/.config/pip/pip.conf` 并提示合并而不是覆盖）。
7. 点两次“下一步”到步骤 3 与 4（分别给出验证命令与还原命令，并说明页面不会执行命令）。
8. 展开底部排错卡片（每条带来源链接与核对日期）。

浏览器控制台应当没有错误；页面上不应出现任何测速数字，也不应有 Emoji。当前尚未实现的部分：真实测速与推荐排序（阶段 4）、MirrorZ 同步状态（阶段 5）、资源中心与 LLM（首版之后）。

## 质量检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:data
pnpm build
pnpm test:e2e
```

`pnpm test` 是各包的单元测试；`pnpm test:e2e` 需要系统已安装 Chrome，会先做数据校验再启动开发服务器。

`pnpm validate:data` 会校验 `data/` 下的 JSON、镜像与生态引用、HTTPS 地址以及命令模板变量；数据目录为空、引用了不存在的镜像，或某个生态没有排错条目时都会以非零状态退出。

## 页面结构

- `/#/`：生态目录与搜索框：`/` 或 Ctrl/Cmd+K 唤起，上下键选择，Enter 确认，Esc 清空。
- `/#/ecosystems/:id`：该生态的四步配置向导（系统与终端 → 镜像与配置方式 → 验证 → 恢复与还原），下方附排错卡片。
- 其他路径：未找到页面。

阶段 2 已完成：向导只展示仓库中审核过的模板，命令由 `@mirrorn/shared/generators` 渲染，页面不会执行任何命令，也不会读取或写入你的配置。

阶段 3 已完成：搜索完全在浏览器内存中进行，不请求后端；支持 `/` 与 Ctrl/Cmd+K 唤起、上下键选择、Enter 确认、Esc 清空，输入法组词期间不误触发导航。结果上限 8 条，镜像结果会直接给出该站支持的生态入口。

## 设计约束

前端不引入 zod：`data/` 的 JSON 在构建时就已经过 schema 校验，浏览器只消费结果。因此 `apps/web` 只从 `packages/shared` 取类型，不取运行时 schema；作为代价，`pnpm validate:data` 是构建的前提而不是可选项。取舍依据和实测体积见 `docs/decisions.md`。

## 目录

- `apps/web`：Vue 3 + Vite 前端，包含首页搜索与四步配置向导。
- `apps/server`：Node.js + Hono 后端，目前提供健康检查接口。
- `packages/shared`：Zod schema、共享类型、数据集校验函数，以及零运行时依赖的命令生成器（`@mirrorn/shared/generators`）。
- `data`：声明式镜像、生态与排错数据；镜像的 `aliases` 与生态的 `aliases` 供搜索使用，社区 PR 可直接扩充。
- `docs`：上游来源记录（`upstream.md`）、命令核对记录（`command-validation.md`）和架构取舍（`decisions.md`）。
- `e2e`：Playwright 端到端测试，覆盖键盘搜索流程、动效降级与窄屏布局；使用系统已安装的 Chrome，不额外下载浏览器。
- `MAIN.md`：完整产品与技术规划。
- `PLAN.md`：分阶段实施计划。

阶段 1 的数据来源和命令核对边界见 `docs/upstream.md` 与 `docs/command-validation.md`。
