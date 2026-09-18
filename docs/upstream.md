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
