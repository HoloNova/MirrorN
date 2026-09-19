# 第三方许可与署名

本文件记录两件事：**代码依赖**的许可，以及**数据来源**的署名与许可。版本号取自本仓库当前的锁文件（2026-09-19）。

## 一、运行时依赖

这些包会进入最终产物（前端 bundle 或后端单文件）。

| 包                | 版本    | 许可       | 仓库                                   |
| ----------------- | ------- | ---------- | -------------------------------------- |
| vue               | 3.5.43  | MIT        | https://github.com/vuejs/core          |
| vue-router        | 4.6.4   | MIT        | https://github.com/vuejs/router        |
| fuse.js           | 7.5.0   | Apache-2.0 | https://github.com/krisk/Fuse          |
| @lucide/vue       | 1.47.0  | ISC        | https://github.com/lucide-icons/lucide |
| hono              | 4.13.8  | MIT        | https://github.com/honojs/hono         |
| @hono/node-server | 1.19.17 | MIT        | https://github.com/honojs/node-server  |
| zod               | 3.25.76 | MIT        | https://github.com/colinhacks/zod      |

## 二、开发与构建依赖

只在开发、构建、测试时使用，不进入运行产物（后端单文件打包时 esbuild 会把用到的依赖内联，前端 bundle 只包含上面的运行时依赖）。

| 包                     | 版本    | 许可       | 仓库                                                   |
| ---------------------- | ------- | ---------- | ------------------------------------------------------ |
| vite                   | 6.4.3   | MIT        | https://github.com/vitejs/vite                         |
| @vitejs/plugin-vue     | 5.2.4   | MIT        | https://github.com/vitejs/vite-plugin-vue              |
| vitest                 | 2.1.9   | MIT        | https://github.com/vitest-dev/vitest                   |
| typescript             | 5.9.3   | Apache-2.0 | https://github.com/microsoft/TypeScript                |
| vue-tsc                | 2.2.12  | MIT        | https://github.com/vuejs/language-tools                |
| tsx                    | 4.23.13 | MIT        | https://github.com/privatenumber/tsx                   |
| esbuild                | 0.28.2  | MIT        | https://github.com/evanw/esbuild                       |
| eslint                 | 9.39.5  | MIT        | https://github.com/eslint/eslint                       |
| @eslint/js             | 9.39.5  | MIT        | https://github.com/eslint/eslint                       |
| eslint-plugin-vue      | 9.33.0  | MIT        | https://github.com/vuejs/eslint-plugin-vue             |
| eslint-config-prettier | 9.1.2   | MIT        | https://github.com/prettier/eslint-config-prettier     |
| typescript-eslint      | 8.70.0  | MIT        | https://github.com/typescript-eslint/typescript-eslint |
| globals                | 15.15.0 | MIT        | https://github.com/sindresorhus/globals                |
| prettier               | 3.9.7   | MIT        | https://github.com/prettier/prettier                   |
| @playwright/test       | 1.63.0  | Apache-2.0 | https://github.com/microsoft/playwright                |
| concurrently           | 9.2.4   | MIT        | https://github.com/open-cli-tools/concurrently         |
| @types/node            | 22.20.3 | MIT        | https://github.com/DefinitelyTyped/DefinitelyTyped     |

MIT / ISC 类依赖需要在分发时保留版权声明；Apache-2.0（fuse.js、TypeScript、Playwright）还需要保留其 NOTICE（如有）。当前交付形态是**构建产物 + 源码同仓**，依赖的许可文本随 `node_modules` 分发或由使用者自行安装，不额外打包许可文件。

## 三、数据来源与署名

| 数据                             | 来源                                                                                                       | 许可与说明                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 镜像站仓库地址与配置写法         | 各镜像站自己的帮助页（清华、阿里云、腾讯云、npmmirror 等，逐条记录在 `data/` 的 `sources` 里，含核对日期） | 各站帮助页未声明开源许可，因此我们**只引用地址事实与写法**，不复制其页面文本；每条数据的 `sources.note` 说明了这条来源支持了什么结论                           |
| Ubuntu 官方归档、Docker 官方仓库 | Ubuntu / Docker 官方文档与仓库目录                                                                         | 官方公开资源；仅使用地址、包名与配置字段                                                                                                                       |
| 上游同步状态                     | 清华大学 `static/tunasync.json`                                                                            | 第三方维护的公开状态文件。我们只抓取并归一化“状态 / 时间戳 / 作业名 / 来源地址”这几项最小字段，不转载其原始数据，也不对外提供原始文件（见 `docs/upstream.md`） |
| MirrorZ                          | <https://github.com/mirrorz-org/mirrorz>                                                                   | MIT：仅用于**核对**端点与字段（见 `docs/upstream.md`），没有复制代码或数据文件                                                                                 |
| mirrorz-config                   | <https://github.com/mirrorz-org/mirrorz-config>                                                            | **没有 LICENSE 文件**：因此只作为交叉验证的阅读材料，不复制其代码、规则或数据                                                                                  |
| chsrc                            | <https://github.com/RubyMetric/chsrc>                                                                      | 仅参考其“换源规则”的思路（例如按发行版版本区分配置格式），不复制实现或数据                                                                                     |
| 应用图标与字体                   | 项目内 SVG 与系统字体栈                                                                                    | 自绘图标；未打包任何第三方字体                                                                                                                                 |

## 四、给二次分发者的提醒

1. 镜像站的地址与配置写法会变化，转发本项目的**数据**前请重新核对，不要沿用旧日期。
2. 上游同步状态是第三方文件，抓取方需要自行确认使用方式是否被接受（本项目的做法与边界记录在 `docs/upstream.md`）。
3. 网络指纹只使用 HMAC 后的前缀（IPv4 /24、IPv6 /48），不记录原始 IP；部署时请保留这一约束（见 `docs/deployment.md`）。
