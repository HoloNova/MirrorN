---
schemaVersion: 1
id: python
name: Python
summary: Python 3.14.8 Windows 64 位安装程序下载、PATH 设置与命令行检查，适合 Python 入门课程。
category: runtime
tags:
  domain: [python]
  platform: [windows]
  arch: [x64]
  origin: [official]
  format: [installer]
aliases: [Python 3, Python 3.14, Python 解释器, Python 安装, CPython, Python 下载]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: true
status: active
official: https://www.python.org/
---

## 下载 Python

Python 是入门编程课程常用的语言，适合写脚本、做数据处理和练习基础语法。课程指定版本时以课程为准。没有要求时，选择 python.org Windows 下载页标注为最新稳定版的 3.14.8。

::download{source="official-exe" label="下载 Python 3.14.8（Windows 64 位安装程序）"}

文件名为 `python-3.14.8-amd64.exe`，由 python.org 提供。python.org 发布页给出了这个文件的 SHA-256 校验值：

::checksum{artifact="win-x64-exe"}

下载完成后，在 PowerShell 中运行下面的命令，计算本地文件的 SHA-256，与上面的值对照：

```powershell title="PowerShell"
Get-FileHash .\python-3.14.8-amd64.exe -Algorithm SHA256
```

## 安装

:::steps
1. 双击下载的 `python-3.14.8-amd64.exe`。如果系统弹出权限确认，选择“是”。
2. 勾选安装窗口底部的 **Add python.exe to PATH** 选项。这一步让终端能直接找到 `python` 命令，不勾选的话，之后还要手动配置。
3. 选择默认的一键安装，保持默认设置，等待安装完成。
:::

## 检查是否成功

打开一个新的终端，依次运行：

```powershell title="PowerShell"
python --version
py --version
```

正常情况下两条命令都会显示 `Python 3.14.8`。如果 `python` 无法运行，但 `py` 可以，说明 PATH 选项没有勾选，请参考下面的常见问题。

## 常见问题

:::details{title="输入 python 后打开了 Microsoft Store"}
这是 Windows 的“应用执行别名”把 `python` 指向了商店。打开 Windows 设置，搜索“应用执行别名”，关闭 `python.exe` 和 `python3.exe` 的开关，然后重新打开终端。
:::

:::details{title="终端找不到 python，但已经安装"}
安装时可能没有勾选 Add python.exe to PATH，或者没有重新打开终端。先关闭所有终端窗口再打开。仍然找不到时，重新运行安装程序，选择 Modify 修改安装，并勾选 Add python.exe to PATH。
:::

:::details{title="不知道该装哪个 Python 版本"}
课程有明确要求时以课程为准。没有要求时，使用本页推荐的 3.14.8。
:::

## 官方资料

::source-list{group="official-docs"}
