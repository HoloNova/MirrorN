---
schemaVersion: 1
id: python
name: Python
summary: Python 3.14.8 与 3.12.10 的 Windows 64 位安装程序下载，以及安装和检查方法，适合初学者。
category: runtime
tags:
  domain: [python]
  platform: [windows]
  arch: [x64]
  origin: [official]
  format: [installer]
aliases: [Python 3, Python 3.14, Python 3.12, Python 解释器, Python 安装, CPython, Python 下载]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: false
status: active
official: https://www.python.org/
---

## 下载 Python

Python 是入门编程课程常用的语言。课程指定版本时以课程为准；没有要求时，选 3.14.8。

::::choice{label="选择版本"}
:::option{label="3.14.8（最新版，推荐）"}
课程没有指定版本时，选这个版本。

::download{source="official-314" label="下载 Python 3.14.8（Windows 64 位安装程序）"}

文件名为 `python-3.14.8-amd64.exe`。
:::
:::option{label="3.12.10（3.12 系列）"}
课程、教材或第三方库明确要求 3.12 时，选这个版本。

::download{source="official-312" label="下载 Python 3.12.10（Windows 64 位安装程序）"}

这是 3.12 系列最后一个提供 Windows 安装包的版本。文件名为 `python-3.12.10-amd64.exe`。
:::
::::

## 安装

:::steps
1. 双击下载的安装文件。如果系统弹出权限确认，选择“是”。
2. 勾选安装窗口底部的 **Add python.exe to PATH**。这一步能让终端直接找到 `python` 命令，不勾选的话，之后还要手动配置。
3. 选择默认的一键安装，等待安装完成。
:::

## 检查是否成功

打开一个新的终端，输入下面的命令：

```powershell title="PowerShell"
python --version
```

显示 `Python 3.14.8`（或你安装的版本号），说明安装成功。如果提示找不到 `python`，请看下面的常见问题。

同时安装了两个版本时，用下面的命令指定版本运行：

```powershell title="PowerShell"
py -V:3.12 --version
py -V:3.14 --version
```

## 常见问题

:::details{title="输入 python 后打开了 Microsoft Store"}
这是 Windows 的“应用执行别名”把 `python` 指向了商店。打开 Windows 设置，搜索“应用执行别名”，关闭 `python.exe` 和 `python3.exe` 的开关，然后重新打开终端。
:::

:::details{title="提示找不到 python"}
通常是安装时没有勾选 Add python.exe to PATH，或者安装后没有重新打开终端。先关闭所有终端窗口再打开。仍然找不到时，重新运行安装程序，选择 Modify 修改安装，并勾选 Add python.exe to PATH。
:::

:::details{title="不知道该装哪个版本"}
课程有明确要求时以课程为准。没有要求时装 3.14.8。两个版本可以同时安装。
:::

## 官方资料

::source-list{group="official-docs"}
