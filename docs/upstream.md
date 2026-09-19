# 上游来源与核对记录

> 本文记录阶段 1 使用的公开文档和字段边界。核对日期：2026-09-18。

## pip / PyPI

- pip 官方安装参数：<https://pip.pypa.io/en/stable/cli/pip_install/>
- pip 官方配置命令：<https://pip.pypa.io/en/stable/cli/pip_config/>
- pip 官方配置层级：<https://pip.pypa.io/en/stable/topics/configuration/>
- 清华 TUNA PyPI 帮助：<https://mirrors.tuna.tsinghua.edu.cn/help/pypi/>
- 阿里云 PyPI 镜像说明：<https://developer.aliyun.com/mirror/pypi>

已记录的 PyPI 仓库地址：

- 官方：`https://pypi.org/simple/`
- 清华：`https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/`
- 阿里云：`https://mirrors.aliyun.com/pypi/simple/`

这些地址作为 pip 安装索引使用，不代表发布权限。阶段 1 不抓取同步状态，也不把站点身份转换为稳定性或延迟分数。

## npm

- npm 官方 Registry：<https://docs.npmjs.com/cli/v11/using-npm/registry>
- npm 官方配置命令：<https://docs.npmjs.com/cli/v11/commands/npm-config>
- 阿里云 npm 镜像说明：<https://developer.aliyun.com/mirror/NPM>
- 腾讯云软件源说明：<https://cloud.tencent.com/document/product/213/8623>

已记录的 npm Registry 地址：

- 官方：`https://registry.npmjs.org/`
- npmmirror：`https://registry.npmmirror.com/`
- 腾讯云：`https://mirrors.tencent.com/npm/`

npmmirror 和腾讯云地址都标记为非官方 Registry，阶段 1 不允许发布操作，不写入 npm publish 配置。

## 上游边界

- MirrorZ 的实时 API 尚未在阶段 1 接入；阶段 5 接入前必须重新核对真实端点、字段、状态枚举和许可证。
- chsrc 仅作为规则来源线索，阶段 1 未复制其代码或完整数据。
- `data/mirrors.json` 中的 `homepageUrl` 只用于展示来源主页；每个生态的 `repositoryUrl` 单独记录并引用文档，不能由主页地址拼接推断。
- 本阶段的 `checkedAt` 表示文档和地址核对日期，不是实时同步时间，也不是测速结果。

## 阶段 5 上游核实（MirrorZ 同步状态）

> 核对日期：2026-09-19。所有结论都来自实际请求或仓库源码阅读，未根据文档推测。

### 已核实的可用端点

| 站点      | 端点                                                        | 实测                                       | 覆盖我们数据里的                         |
| --------- | ----------------------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| 清华 TUNA | `https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json` | 200，`application/json`，74 KB，182 条记录 | 镜像 `tuna`、生态 `pip`（作业名 `pypi`） |

`tunasync.json` 是 tunasync 的作业状态文件，每条记录包含：

```json
{
  "name": "pypi",
  "is_master": true,
  "status": "success",
  "last_update": "2026-09-19 09:16:39 +0800",
  "last_update_ts": 1789760213,
  "last_started_ts": 1789759909,
  "last_ended_ts": 1789760213,
  "next_schedule_ts": 1789803413,
  "upstream": "https://pypi.org",
  "size": "1.60T"
}
```

- **状态枚举**（TUNA 实测分布）：`success` 167、`failed` 9、`syncing` 5、`paused` 1。cross-check：`mirrorz-config/parser/tunasync.js` 的映射表还接受 `fail` 与 `unknown`，我们同样按防御式处理。
- **时间字段用 epoch**（`*_ts`）。`last_update` 等字符串是 `+0800` 本地时间，解析会引入时区风险，因此只作展示来源，不用作计算。
- `name` 是**上游作业名**，与我们的镜像 ID、生态 ID 都不同，必须显式映射（见下）。

### 站点标识的交叉验证

`mirrorz-config/sites/tuna/tuna.js` 用的正是同一个端点：

```js
tunasync('https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json');
options('https://mirrors.tuna.tsinghua.edu.cn/static/js/options.json', mirrors);
isoinfo('https://mirrors.tuna.tsinghua.edu.cn/static/status/isoinfo.json');
```

即清华自己发布的状态文件就是 MirrorZ 的数据源，两者一致。我们只用其中的 tunasync 状态；`options.json`、`isoinfo.json` 分别描述仓库展示选项与 ISO 镜像，与本项目无关。

### 已核实的不可用项（避免以后重复试探）

对以下主机实测了 `/static/tunasync.json`、`/static/status/isoinfo.json`、`/mirrorz.json`、`/.well-known/mirrorz-org-mirrors.json` 四个路径，**全部 404**：

- `mirrors.aliyun.com`、`mirrors.tencent.com`、`registry.npmmirror.com`、`mirrors.ustc.edu.cn`、`mirrors.pku.edu.cn`。
- npmmirror 的 `https://npmmirror.com/api/sync` 返回的是 HTML 页面（6712 B），页面本身不再请求任何状态 JSON；`/-/api/stats`、`/-/api/sync/stats` 均 404。
- 官方入口 `pypi.org`、`registry.npmjs.org` 不是镜像站，不存在同步状态（它们是上游本身）。

结论：**按当前 `data/mirrors.json` 的收录范围，只有清华的 pip 有可核实的机器可读同步状态**；阿里云、npmmirror、腾讯云显示“未知”，两个官方入口显示“官方源（无同步概念）”。

### 命名映射

上游作业名 →（我们的镜像 ID、生态 ID）：

| 上游 `name` | 镜像 ID | 生态 ID | 备注                                                                         |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------- |
| `pypi`      | `tuna`  | `pip`   | 上游 `upstream` 字段为 `https://pypi.org`，与本地审核的仓库地址一致          |
| （无）      | `tuna`  | `npm`   | 清华未镜像 npm registry（作业列表里只有 `nodejs-release`），本地数据也未收录 |

`mirrorz-config/cname.json` 提供上游作业名到展示名的映射，可作为**命名参考**；由于该仓无许可证声明，我们不复制它，只在自己数据里维护所需的最小映射。

### 许可证与数据使用边界

- `mirrorz-org/mirrorz`：**MIT**（GitHub API 读取 `spdx_id`）。
- `mirrorz-org/mirrorz-config`：**无 LICENSE 文件**（实测 `license: None`）。仅作参考阅读，**不复制其代码或规则数据**。
- 清华的 `tunasync.json`：未找到明确的数据许可声明。我们的处理方式：只读取状态字段，在内存与服务端快照中保存**归一化后的最小字段**（状态、最近成功/尝试时间、下次计划时间、上游地址），**不转载上游文件本身**，也不对外提供上游原始数据。

### 不作为推荐输入的信号

`https://mirrors.cernet.edu.cn/api/scoring`（200，`application/json`，2351 B）返回的是 302 重定向服务的选源评分：

```json
{
  "scores": [
    {
      "pos": 0,
      "mask": 0,
      "geo": 1e100,
      "isp": 0,
      "delta": 0,
      "unknown": true,
      "abbr": "BFSU",
      "label": "bfsu",
      "resolve": "mirrors.bfsu.edu.cn",
      "repo": ""
    }
  ]
}
```

它是**服务端视角**的网络距离评分（`geo`/`isp`/`mask` 基于请求到来的 IP 计算），不是同步状态，也不能代表访问者浏览器到镜像站的路径。项目已在 `docs/decisions.md`（阶段 4）记录过同一结论：出口指纹只反映服务端出口。因此该接口不进入推荐评分，仅作为以后可能的地理定位参考记录在此。
