# 贡献指南

改动本仓库前请先读 `MAIN.md`（产品定位与技术边界）、`PLAN.md`（分阶段计划与验收标准）和 `docs/decisions.md`（已经做过的取舍及原因）。本文件只讲**怎么改数据、怎么验证**。

## 一、环境

```bash
corepack enable          # 使用 package.json 里固定的 pnpm 版本
pnpm install             # 安装依赖
pnpm dev                 # 前端 http://127.0.0.1:5173 + 后端 http://127.0.0.1:8787
```

只改前端时用 `pnpm dev:web`；只改后端时用 `pnpm dev:server`。端口规则与常见故障见 README。

## 二、数据在哪里

| 内容         | 文件                               | 说明                                              |
| ------------ | ---------------------------------- | ------------------------------------------------- |
| 镜像站       | `data/mirrors.json`                | 站点身份、主页、别名、可选探针与同步状态来源      |
| 生态与来源   | `data/ecosystems/<生态>.json`      | 生态信息、各镜像的仓库地址、各平台/版本的配置模板 |
| 排错卡片     | `data/troubleshooting/<生态>.json` | 每个生态至少要有一条                              |
| 前端读取方式 | 构建期直接 import                  | 静态模式下无后端也能完整使用                      |

**每个字段都要能追溯到公开文档**。`sources` 里的 `url` 必须是 HTTPS、`checkedAt` 写你实际核对的日期；`note` 说明这条来源支持了什么结论。数据校验会拒绝缺少来源或格式不符的条目。

## 三、最小示例

### 3.1 新增一个镜像站

```jsonc
{
  "id": "example-mirror", // 小写字母/数字/连字符，全局唯一
  "name": "示例镜像站",
  "kind": "university", // official | university | commercial | community
  "homepageUrl": "https://mirror.example.edu/",
  "aliases": ["example", "示例源"], // 搜索用：中英文、拼音、简称
  "sources": [
    {
      "url": "https://mirror.example.edu/help/",
      "checkedAt": "2026-09-19",
      "note": "该帮助页给出的仓库路径与配置写法。",
    },
  ],
}
```

可选字段：`probe`（测速探针，见 3.3）与 `statusSource`（上游同步状态文件，见 3.4）。

### 3.2 给已有生态加一个来源

在 `data/ecosystems/<生态>.json` 的 `supports` 里追加一条，然后按需要补 `guides`：

```jsonc
{
  "ecosystemId": "pip",
  "mirrorId": "example-mirror",
  "repositoryUrl": "https://mirror.example.edu/pypi/web/simple/", // 必须是 HTTPS
  "supportsPublish": false, // 该源是否支持发布包（大多数镜像站不支持）
  "sources": [/* 至少一条，说明这个地址来自哪份文档 */],
}
```

模板里可以使用的变量只有三个：`{{mirrorUrl}}`（上面这个仓库地址）、`{{packageName}}`（占位符 `<包名>`，页面会提醒用户替换）、`{{configPath}}`（当前模板的配置文件路径）。**不要**在模板里写入任何未经核实的主机名——换源地址必须来自 `repositoryUrl`。

### 3.3 新增一个生态

```jsonc
{
  "id": "example",
  "name": "示例生态",
  "packageManager": "example",
  "description": "一句话说明这个生态解决什么问题。",
  "prerequisites": ["需要示例工具 1.0 以上。", "只覆盖 xx 系统。"],
  "aliases": ["example", "示例", "换源"],
  "supports": [/* 至少一个来源 */],
  "guides": [
    {
      "id": "example-linux-bash",
      "os": "linux", // windows | macos | linux
      "shell": "bash", // powershell | cmd | bash | zsh
      "distribution": "ubuntu", // 可选：按发行版区分
      "version": "24.04", // 可选：按版本区分（必须同时写 distribution）
      "variables": ["mirrorUrl"],
      "temporary": {
        "label": "临时使用",
        "command": "example --mirror {{mirrorUrl}} {{packageName}}",
      },
      "persistent": { "label": "全局生效", "command": "example config set mirror {{mirrorUrl}}" },
      "configFile": {
        "path": "/etc/example/example.conf",
        "format": "ini", // ini | json | text
        "content": "[example]\nmirror = {{mirrorUrl}}\n",
        "instructions": "已存在时只合并该字段，不要整份覆盖。",
        "backup": "先备份原文件。",
      },
      "verification": {
        "command": "example config get mirror",
        "expected": "输出里包含所选镜像地址。",
      },
      "restore": { "command": "example config unset mirror", "expected": "恢复到官方默认行为。" },
      "sources": [/* 至少一条 */],
    },
  ],
  "sources": [/* 至少一条 */],
}
```

`temporary` / `persistent` / `configFile` 至少要有一个。**按版本区分的规则**：同一个「系统 + 终端」组合下，要么所有模板都写 `version`，要么都不写；同一个版本只能有一个模板（否则校验会报错，页面也不会替用户猜）。

### 3.4 探针与同步状态

- 探针（`mirror.probe`）必须是**审核过的小资源**，并且要实测浏览器能否读取响应：`mode` 必须显式写 `cors` 或 `no-cors`（不给默认值）。`cacheBust` 只在确认加查询参数不会被拒绝时才打开（清华的 robots.txt 加了就返回 403）。结论记入 `docs/probe-validation.md`。
- 同步状态（`mirror.statusSource` + `supports[].statusJob`）必须先核实端点格式、字段与状态枚举，并把核实过程写进 `docs/upstream.md`。没有公开接口的来源就不要声明——界面会明确显示“同步状态未知”，这比编一个数字更诚实。

## 四、提交前必须跑的命令

```bash
pnpm format:check     # 格式（改了文件先 pnpm format）
pnpm lint             # ESLint
pnpm typecheck        # 四个包的类型检查
pnpm validate:data    # 数据校验：必填字段、ID 唯一、来源可达性相关的规则、模板变量
pnpm test             # 单元测试（shared / server / web）
pnpm test:e2e         # 端到端（用系统 Chrome，全部拦截上游请求）
```

只改了数据时，至少跑 `pnpm validate:data` 与 `pnpm --filter @mirrorn/web test`。

改了数据里**已经审核过的地址**（探针、仓库地址、同步状态文件）时，请在 PR 里附上你实际执行的验证命令与输出——`docs/validation-matrix.md` 就是这类证据的记录位置。

## 五、几条硬性约束

1. 不编造数据：没有可核实的来源、没有实测过的探针模式、没有确认过的上游接口，就不要写进数据。
2. 不整份覆盖用户的配置文件：涉及 JSON/INI 这类多键配置时，向导只提供**合并**方式（见 `dockerhub` 的示例），并给出备份与还原。
3. 不修改系统：向导只生成文本，所有命令由用户自己执行。
4. 不引入计划外架构：技术栈与目录结构见 `MAIN.md` 第 5 节，`docs/decisions.md` 记录了为什么是现在这样。
5. 提交信息与代码注释使用中文，风格与本仓库保持一致。
