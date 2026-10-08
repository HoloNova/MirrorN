---
schemaVersion: 1
id: vscode
name: Visual Studio Code
summary: VS Code 各平台官方下载、安装命令、中文界面设置和常用命令行操作。
category: software
tags:
  domain: [web, cpp, documentation]
  platform: [windows, macos, linux]
  arch: [x64, arm64]
  origin: [official]
  format: [installer, archive]
aliases: [VSCode, VS Code, Visual Studio Code 编辑器]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: false
status: active
official: https://code.visualstudio.com/
---

## 下载 VS Code

VS Code 是跨平台代码编辑器，区分于 Visual Studio。下面是微软官方稳定通道的文件入口，会随稳定版发布更新；不是固定版本镜像，也不需要先进入下载页面。

### Windows

::download{source="windows-x64" label="下载 Windows x64 用户安装包"}
::download{source="windows-arm64" label="下载 Windows ARM64 用户安装包"}

多数 Intel / AMD 电脑使用 x64；Windows on ARM 设备使用 ARM64。这里提供 **User Setup**，安装到当前用户目录；需要系统级安装或其他格式时访问官方完整下载页。

### macOS

::download{source="macos-universal" label="下载 macOS 通用版 ZIP"}

解压后将 Visual Studio Code 拖入“应用程序”。通用版包含 Intel 与 Apple Silicon 架构。要在终端使用 `code`，在 VS Code 的命令面板运行 **Shell Command: Install 'code' command in PATH**。

### Linux

| 发行版 | 常用包格式 |
| --- | --- |
| Debian / Ubuntu | `.deb` |
| Fedora / RHEL 系列 | `.rpm` |

::download-select{group="linux-packages"}

选择与系统一致的 x64 或 ARM64 架构。不要将 `.deb` 安装到只支持 RPM 的发行版，也不要把两个格式当成同一个文件的替代下载源。

## 使用命令安装

::::choice{label="选择安装方式"}
:::option{label="Windows · WinGet"}
::install-command{source="winget"}
安装后重新打开终端。WinGet 包清单可能晚于官方下载通道更新，两种方式获得的版本不一定同时一致。
:::
:::option{label="Debian / Ubuntu · 已下载的 DEB"}
在下载目录打开终端，把 `FILE.deb` 换成你下载的**准确文件名**：

```bash
sudo apt install ./FILE.deb
```
:::
:::option{label="Fedora · 已下载的 RPM"}
在下载目录打开终端，把 `FILE.rpm` 换成你下载的**准确文件名**：

```bash
sudo dnf install ./FILE.rpm
```
:::
::::

## 中文界面与常用命令

先确认 `code --version` 能输出版本。Windows 安装后需重新打开终端，macOS 需完成上文的 PATH 操作。

安装微软简体中文语言包，然后重启 VS Code；也可以在命令面板执行 **Configure Display Language** 并选择简体中文。

```bash
code --install-extension MS-CEINTL.vscode-language-pack-zh-hans
```

在终端切换到项目目录后打开当前文件夹：

```bash
code .
```

其他常用操作：

```bash
code --new-window .
code --list-extensions
code --install-extension ms-vscode.cpptools
```

最后一条安装微软 C/C++ 扩展，提供语言支持与调试集成；这些命令只在你复制到本机执行后生效，本站不会运行它们。

## 用 VS Code 学习 C/C++

:::notice{type="warning" title="扩展不是编译器"}
VS Code 和 C/C++ 扩展都不附带 C/C++ 编译器。还需要安装 GCC、Clang 或 MSVC 等工具链，并为编译和调试配置环境。只安装扩展，不能直接运行任意 `.cpp` 文件。
:::

Windows 使用 MSVC 时，可以通过 Visual Studio Installer 安装“使用 C++ 的桌面开发”，并从配置好环境的开发者终端启动 VS Code。Linux 可按发行版安装 GCC / Clang，macOS 可按需要安装 Xcode 命令行工具。具体配置见下方微软 C/C++ 文档；老师要求 Dev-C++ 时，不用 VS Code 擅自替代课程环境。

## 常见问题

:::details{title="终端找不到 code"}
Windows 安装时保留加入 PATH 的选项，并关闭旧终端再打开；macOS 执行“Install 'code' command in PATH”；Linux 检查所用安装方式是否已提供 `code` 命令。不要为了修复 PATH 随意把不明脚本加入系统环境。
:::

:::details{title="下载文件或安装包架构选错"}
在系统信息中查看 CPU / 系统架构。x64 与 ARM64 是不同文件；若发行版、架构或最低系统版本不匹配，应重新选择对应包。完整系统要求以官方平台说明为准。
:::

## 官方资料与相关工具

::source-list{group="official-docs"}
::resource-card{resource="visual-studio"}
::resource-card{resource="dev-cpp"}
