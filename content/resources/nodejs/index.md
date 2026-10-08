---
schemaVersion: 1
id: nodejs
name: Node.js
summary: Node.js LTS 官方 Windows 安装包、安装检查与 npm 说明，适合 Web 与前端课程。
category: runtime
tags:
  domain: [web]
  platform: [windows]
  arch: [x64]
  origin: [official]
  format: [installer]
aliases: [Node, Node.js LTS, nodejs, npm]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: true
status: active
official: https://nodejs.org/
---

## 下载 Node.js

Node.js 让 JavaScript 能在电脑上运行，前端、Web 和全栈类课程常用到它。只学 C 语言或 C++ 时不需要安装。

::download{source="official-msi" label="下载 Node.js v24.21.0 LTS（Windows x64）"}

请选择 **LTS** 版本，它的支持周期更长，适合作业和课程环境。安装包已包含 npm，也就是 Node 的包管理工具。

::checksum{artifact="win-x64-lts"}

## 安装

:::steps
1. 双击下载的 `.msi` 文件，按向导点击 Next。
2. 保持默认的安装位置和组件，不需要额外勾选。
3. 安装完成后，关闭已经打开的终端，再重新打开一个新的终端。
:::

## 检查是否安装成功

在新的终端中依次运行下面两条命令：

```powershell title="PowerShell"
node -v
npm -v
```

两条命令都输出版本号即表示安装成功。版本号的具体数字可能与本页不同，因为 LTS 版本会陆续发布补丁更新。

## 常见问题

:::details{title="终端提示找不到 node 或 npm"}
通常是安装后没有重新打开终端。关闭所有终端窗口，再打开一个新的窗口。仍然找不到时，卸载后重新安装，并保持安装向导的默认设置。
:::

:::details{title="PowerShell 提示无法加载 npm.ps1"}
这是 Windows 的脚本执行策略限制。可以改用“命令提示符（cmd）”运行 `npm`；如果需要在 PowerShell 中使用，请在自己的账户下执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，并确认这是你能接受的设置。
:::

:::details{title="不知道该装哪个版本"}
课程有明确要求时以课程为准。没有要求时选择 LTS 版本。非 LTS 版本的新功能较多，但支持周期较短。
:::

## 官方资料

::source-list{group="upstream"}
