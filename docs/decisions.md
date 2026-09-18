# 架构决策记录

本文件记录会影响后续实现的取舍和实测数据，避免以后重新讨论或写出相互矛盾的代码。

## 前端不打包 zod，数据校验放在构建前与 CI

**日期：** 2026-09-18
**状态：** 已实施

**背景。** `packages/shared` 用 zod 定义数据契约，`apps/web` 最初在模块加载时调用 `MirrorListSchema.parse()` / `EcosystemListSchema.parse()`。这段校验在浏览器里没有新增保护：被打进前端产物的 JSON 来自同一个提交，而 CI 已经用同一份 schema 校验过它。

**实测体积（本次构建，zod 3.25.76）：**

| 方案                 | 压缩后       |
| -------------------- | ------------ |
| `zod`（v3 经典 API） | 13.8 KB gzip |
| `zod/v4`             | 45.9 KB gzip |
| `zod/v4-mini`        | 6.3 KB gzip  |

zod v3 无法 tree-shaking：只用一个 `z.object({ a: z.string() })` 也是 13.8 KB。

**决定。** 前端只用类型（`import type`），不认识 schema。数据校验保留在 `scripts/validate-data.ts`（CLI/CI）和 `apps/server`（阶段 5 接入上游数据时）。

**实测结果。**

|                 | 变更前                    | 变更后                   |
| --------------- | ------------------------- | ------------------------ |
| 前端 JS         | 142.09 KB / 44.78 KB gzip | 86.26 KB / 32.09 KB gzip |
| Vite 处理模块数 | 28                        | 15                       |

产物中已确认不含 `ZodError`、`safeParse` 等 zod 标记；镜像地址数据本身仍在包内。

**代价与对策。**

1. `apps/web/src/lib/ecosystems.ts` 里存在一处显式类型断言，属于信任边界。JSON 模块的字符串字面量会被推断为 `string`，无法直接赋给 `official | university | commercial | community` 这类联合类型，所以断言无法避免。该文件顶部的注释说明了这条信任链。
2. 校验一旦被跳过，前端不会报错，只会渲染错误内容。因此 `build`、`build:web`、`dev:web`、`dev` 都先执行 `validate:data`；`validate:data` 在数据目录为空时也会失败。
3. 类型断言只覆盖字段结构，不覆盖语义。镜像地址是否真的服务该生态仍靠人工核对，记录在 `docs/upstream.md`。

**对后续阶段的影响。** 阶段 2 的命令生成器会被前端调用，因此它必须保持零运行时依赖：只使用类型和纯函数，不 import schema。如果 `packages/shared` 的入口同时导出 schema 和生成器，前端引入生成器时会连带把 zod 打进产物。届时应拆分子路径导出（如 `@mirrorn/shared/generators` 与 `@mirrorn/shared/schemas`），而不是把 zod 重新加回前端。

## shared 包按子路径导出：schema 与生成器分开

**日期：** 2026-09-18
**状态：** 已实施

**背景。** 阶段 2 的命令生成器要被前端调用，而 `@mirrorn/shared` 的入口同时导出 zod schema。前端一旦从入口导入生成器，整个入口模块图都会进入浏览器产物，zod 就会重新回到前端。

**决定。** 拆成两个子路径：`@mirrorn/shared`（schema、类型、数据集校验，供 CLI 与服务端使用）和 `@mirrorn/shared/generators`（零运行时依赖的纯函数，供前端使用）。生成器只用 `import type` 引用类型，返回值全是字符串和纯对象。

**验证方式。** 编译后检查 `packages/shared/dist/generators/*.js` 不含 zod 引用；前端构建产物中不含 `ZodError`、`safeParse` 等标记。新增任何会被前端调用的 shared 代码时，都要维持这条约束：需要同时导出 schema 和运行时函数时，拆子路径，而不是合并入口。

## 前端路由使用 hash 模式

**日期：** 2026-09-18
**状态：** 已实施

**决定。** `apps/web` 使用 `createWebHashHistory()`，链接形如 `/#/ecosystems/pip`。

**原因。** 阶段 6 要把前端作为纯静态产物托管（可放任意静态服务器、对象存储或本地文件），hash 模式不需要为每条路径配置 history fallback，也不会在刷新时 404。代价是 URL 里带 `#`，对当前场景不重要。

**如需改用 history 模式。** 必须同时交付托管侧的 fallback 规则并在 README 中写明；不要只改前端而不改部署说明。

## 图标库使用 @lucide/vue 而不是 lucide-vue-next

**日期：** 2026-09-18
**状态：** 已实施

**背景。** `MAIN.md` 提到 `lucide-vue-next`。实际安装时该包已被标记为 deprecated，提示改用 `@lucide/vue`。

**决定。** 使用 `@lucide/vue`（1.47.0），图标以具名方式按需导入（`import { Copy } from '@lucide/vue'`），保持矢量、单色、无 Emoji 的视觉规范。构建产物中确认未使用的图标不会被打包。

## 搜索使用 Fuse.js，意图词写在代码里、身份别名写在数据里

**日期：** 2026-09-18
**状态：** 已实施

**决定。** 前端用 Fuse.js 在内存中做检索（实测 min+gzip 9.3 KB，前端产物从 50.07 KB gzip 增至 64.20 KB gzip，含新增的镜像别名数据与搜索代码）。区分两类关键词：

- **身份别名**（`python`、`pip`、`装python`、`tuna`、`淘宝源`）属于数据事实，写在 `data/` 里，社区 PR 直接扩充。因此 `Mirror` schema 增加了必需的 `aliases` 数组，与 `Ecosystem.aliases` 对称。
- **语言层面的意图词**（`换源`、`huanyuan`、`镜像`、`加速`）对所有生态都成立，不是某个生态的事实，因此作为常量写在 `apps/web/src/lib/search.ts`。这样新增生态不需要重复填写这些词。

多词查询按“每个词都要命中”合并得分，`阿里云 pip` 会缩小范围而不是放宽范围；结果上限 8 条。

**结果卡片必须可以点进下一步。** 镜像命中时不显示无法点击的说明卡，而是展开该镜像在当前数据中真正服务的生态，由用户选择；没有对应生态的镜像不进入索引。这一条是对 `MAIN.md` 中“换源总览”页面的替代：阶段 3 不新增只有标题、没有目标的页面，`换源` 作为意图词直接命中各个生态。

## 键盘与输入法：判定逻辑与渲染分离

**日期：** 2026-09-18
**状态：** 已实施

**背景。** 搜索需要支持 `/`、Ctrl/Cmd+K、上下键、Enter、Esc，并且在中日韩输入法组词期间不能把 Enter 当作确认。真实输入法无法在无头浏览器里可靠复现。

**决定。** 键盘判定抽成纯函数（`apps/web/src/lib/keys.ts` 的 `resolveSearchKey`、`shouldFocusSearch`、`isEditableElement`、`moveIndex`），组件只负责调用和渲染。单测覆盖 `isComposing`、在输入框内不劫持 `/`、以及边界循环；E2E 覆盖真实按键流程，并用 `compositionstart`/`compositionend` 事件序列模拟组词状态。真正依赖具体输入法行为的部分无法自动化验证，这一点在 E2E 文件里写明。

## 搜索结果排序：生态优先于镜像

**日期：** 2026-09-18
**状态：** 已实施

**背景。** 初版只按 Fuse 模糊得分排序，输入 `pip` 时首个结果是"PyPI 官方源"（镜像），回车只会展开生态入口而不会进入向导。生态名与镜像名共用了同一批关键词（镜像的索引词里包含它支持的生态名），因此得分无法区分用户意图。

**决定。** 排序键改为 `（类型：生态 0 / 镜像 1）→ 模糊得分 → id`。搜到生态名时用户最可能想配置该生态；而镜像品牌名（`tuna`、`腾讯云`、`淘宝源`）不会与生态名竞争，因此这条规则不会遮住镜像结果，镜像命中仍然留在列表中作为第二种入口。单测固定了 `pip` / `npm` / `pypi` 的首位结果和镜像品牌仍然可搜。
