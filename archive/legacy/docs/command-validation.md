# 命令模板核对记录

核对日期：2026-09-18。

本文件区分三件事：文档核对（命令形状是否与官方文档一致）、真实执行（在一台机器上实际跑过并记录输出）、未验证（本环境不具备条件，未执行）。未执行的项不得当作已验证。

## 环境

| 项目     | 版本                                           |
| -------- | ---------------------------------------------- |
| 操作系统 | Linux（Ubuntu 22.04 容器）                     |
| Python   | 3.10.12                                        |
| pip      | 22.0.2（`/usr/lib/python3/dist-packages/pip`） |
| Node.js  | 24.21.0                                        |
| npm      | 11.19.0                                        |

隔离方式：pip 用 `HOME=/tmp/mirrorn-home` 指向临时目录，npm 用 `npm_config_userconfig=/tmp/mirrorn-verify/npmrc` 指向临时文件，避免改动本机真实配置。

## 真实执行结果（Linux / Bash）

### pip

| 命令                                                                                                      | 结果                                                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `python3 -m pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/`        | 成功，输出 `Writing to /tmp/mirrorn-home/.config/pip/pip.conf`                 |
| `python3 -m pip config get global.index-url`                                                              | 输出 `https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/`                   |
| `python3 -m pip config unset global.index-url`                                                            | 成功移除该项；随后 `get` 以非零状态退出并提示 `No such key - global.index-url` |
| `python3 -m pip download --no-deps --index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/ six` | 下载成功（`six-1.17.0-py2.py3-none-any.whl`）                                  |
| `python3 -m pip download --no-deps --index-url https://mirrors.aliyun.com/pypi/simple/ six`               | 下载成功                                                                       |
| `python3 -m pip download --no-deps --index-url https://pypi.org/simple/ six`                              | 下载成功                                                                       |

结论：`data/ecosystems/pip.json` 中的三个索引地址在真实 pip 上可用，`pip config set/get/unset` 的写法与配置键 `global.index-url` 正确，Linux 下的用户级配置文件路径确认为 `~/.config/pip/pip.conf`，与数据中的说法一致。

### npm

| 命令                                                                        | 结果                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm config set registry https://mirrors.tencent.com/npm/`                  | 成功，写入隔离的 userconfig 文件，内容为 `registry=https://mirrors.tencent.com/npm/` |
| `npm config get registry`                                                   | 输出 `https://mirrors.tencent.com/npm/`                                              |
| `npm config delete registry`                                                | 成功后 `npm config get registry` 回到 `https://registry.npmjs.org/`                  |
| `npm view six version --registry=https://registry.npmmirror.com/`           | 输出 `0.0.12`，Registry 可用                                                         |
| `npm view six version --registry=https://mirrors.tencent.com/npm/`          | 输出 `0.0.12`，Registry 可用                                                         |
| `npm view six version --registry=https://mirrors.tuna.tsinghua.edu.cn/npm/` | 404，该地址不提供 npm Registry                                                       |

结论：`data/ecosystems/npm.json` 中 npmmirror 与腾讯云的 Registry 地址真实可用；清华只提供 Node.js 发行包镜像而不提供 npm Registry，数据中没有为 npm 收录清华是正确的。

## 未验证项

| 生态      | 平台                                         | 原因                                                    |
| --------- | -------------------------------------------- | ------------------------------------------------------- |
| pip / npm | Windows（PowerShell、CMD）                   | 本环境没有 Windows，未执行；命令形状仅与官方文档核对    |
| pip / npm | macOS（Bash、Zsh）                           | 本环境没有 macOS，未执行                                |
| pip       | Windows 配置文件路径 `%APPDATA%\pip\pip.ini` | 依赖 `pip config debug` 在 Windows 上的实际输出，未执行 |
| npm       | Windows 配置文件路径 `%USERPROFILE%\.npmrc`  | 未执行                                                  |

上表所列平台在进入阶段 3 之前需要在对应系统或等价的隔离环境中执行一次，并把版本与输出补回本文件。

## 验证过程中的发现

1. `PIP_CONFIG_FILE` 只影响 pip 读取配置的来源，**不会**改变 `pip config set` 的写入目标：设置该变量后执行 `pip config set`，pip 仍然写入了 `~/.config/pip/pip.conf`。验证时因此改用 `HOME` 隔离。这一点也说明向导必须明确写出配置文件层级，而不是笼统地说“写入配置文件”。
2. 上述 `pip config unset` 后再执行 `get` 会以非零状态退出，属于正常行为；向导的验证说明已写成“输出中包含所选镜像地址”，避免让用户误以为必须有成功退出码。
3. 页面上的命令全部由用户自己执行，本项目不会代为运行，也不会读取用户的配置输出。
