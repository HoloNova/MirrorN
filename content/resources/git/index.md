---
schemaVersion: 1
id: git
name: Git for Windows
summary: Git 2.56.0 Windows 64 位安装程序下载、安装与命令行检查，用于代码版本管理和协作。
category: software
tags:
  platform: [windows]
  arch: [x64]
  origin: [official, github]
  format: [installer]
aliases: [Git, Git Bash, 版本控制, Git 版本控制, git-scm]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: true
status: active
official: https://git-scm.com/
---

## 下载 Git

Git 是版本控制工具。它会记录代码的每一次修改，方便回退到旧版本，也方便和同学一起维护同一个项目。课程要求使用 Git，或者要从 GitHub 拉取代码时，才需要安装它。只写简单 C 或 Python 程序、不涉及版本管理的课程，可以先不装。

大多数 Intel 或 AMD 电脑选择 64 位安装程序。ARM 设备请到官方安装页选择 arm64 版本。

::download{source="official-exe" label="下载 Git 2.56.0（Windows 64 位安装程序）"}

文件名为 `Git-2.56.0.2-64-bit.exe`，由 git-scm.com 安装页链接到的 Git for Windows 官方发布提供。官方发布中没有单独的 SHA-256 校验文件，因此本页不显示校验值。

## 安装

:::steps
1. 双击下载的 `Git-2.56.0.2-64-bit.exe`，按向导点击 Next。
2. 遇到选择编辑器、默认分支名或 PATH 设置的页面，保持推荐选项即可。PATH 选项的作用是让终端能直接找到 `git` 命令。
3. 等待安装完成，关闭已经打开的终端，再重新打开一个新的终端。
:::

## 检查是否成功

在新的终端中运行：

```powershell title="PowerShell"
git --version
```

输出以 `git version` 开头、带有版本号，说明安装成功。

第一次使用还需要设置名字和邮箱。提交记录会显示这两项信息，公开仓库里也能看到，请填写自己愿意公开的内容：

```powershell title="PowerShell"
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

## 常见问题

:::details{title="终端提示找不到 git"}
通常是安装后没有重新打开终端，或者安装时 PATH 选项没有选推荐项。关闭所有终端窗口后重新打开。仍然找不到时，卸载后重新安装，并保留推荐选项。
:::

:::details{title="推送代码时弹出登录窗口"}
通过 HTTPS 连接 GitHub 时，系统可能弹出登录或授权窗口，按提示完成账号授权即可。不要把账号密码写进代码或文档里。
:::

:::details{title="不确定下载的是不是官方文件"}
本页下载文件名应为 `Git-2.56.0.2-64-bit.exe`。文件名或来源不一致时，请回到本页的官方入口重新下载，不要使用来路不明的安装包。
:::

## 官方资料

::source-list{group="official-docs"}
