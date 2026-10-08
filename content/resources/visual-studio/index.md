---
schemaVersion: 1
id: visual-studio
name: Visual Studio
summary: Visual Studio Community 官方安装器、WinGet 安装命令与 C/C++ 桌面开发环境配置。
category: software
tags:
  domain: [cpp, dotnet]
  platform: [windows]
  format: [installer]
  origin: [official]
aliases: [VS, Visual Studio Community, Visual Studio 2022, Visual Studio 2026]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: false
status: active
official: https://visualstudio.microsoft.com/
---

## 下载 Visual Studio

Visual Studio 是集成开发环境，与 **Visual Studio Code（VS Code）不是同一款软件**。学习 Windows 上的 C/C++、C# 等开发，可按课程要求安装 Community 版。个人使用与组织使用的许可条件不同，使用前查看 [Community 许可说明](https://visualstudio.microsoft.com/vs/community/)。

### Community 当前稳定版

::download{source="community-stable" label="下载 Visual Studio Community 在线安装器"}

官方稳定通道会随发布更新，当前为 Visual Studio 2026 系列；这里不是固定版本文件，也不是完整离线安装包。安装器启动后还会下载你选择的开发组件。

### 课程指定 Visual Studio 2022

::download{source="community-2022" label="下载 Visual Studio 2022 Community 在线安装器"}

老师明确要求 2022 时使用这个入口；它属于 2022 的 17.x 发布通道，不是更早的单个补丁版本。不要仅因为另一版更新就替换课程环境。

## 使用命令安装

Windows 已安装 WinGet 时，可以在 PowerShell 中运行。下面两条**按需选一条**，不要为同一课程重复安装两个大版本。

::::choice{label="选择 Visual Studio 版本"}
:::option{label="Community 当前稳定版"}
::install-command{source="winget-stable"}
:::
:::option{label="Community 2022"}
::install-command{source="winget-2022"}
:::
::::

WinGet 安装完成后，打开 **Visual Studio Installer** 选择工作负载；只安装 IDE 并不意味着所需编译工具已经齐全。如果提示找不到 `winget`，先通过 Microsoft Store 安装或更新“应用安装程序”，也可以直接使用上面的安装器。

:::details{title="用命令安装 C/C++ 桌面开发组件"}
先把上面的官方安装器保存为当前目录下的 `vs_community.exe`，在 PowerShell 中运行：

```powershell
.\vs_community.exe --add Microsoft.VisualStudio.Workload.NativeDesktop --includeRecommended --passive --wait
```

`--add` 选择“使用 C++ 的桌面开发”；`--includeRecommended` 同时加入推荐组件；`--passive` 显示安装进度而不逐步交互；`--wait` 等待安装器结束。命令可能请求管理员权限，需要联网和足够磁盘空间；工作负载仍以安装器最终显示的清单为准。
:::

## 安装 C/C++ 开发环境

:::steps
1. 在 Visual Studio Installer 中勾选 **使用 C++ 的桌面开发**，不是只勾选 C# 或 Web 开发。
2. 在安装详细信息中确认 MSVC 工具集与 Windows SDK 已选中，再按需选择安装位置。
3. 安装完成后打开 Visual Studio，选择“创建新项目”。
4. 搜索并选择 C++ 的“控制台应用”，填写项目名称后创建。
5. 运行模板程序，或用下面的程序替换源文件内容，选择“不调试启动”（通常为 `Ctrl + F5`）。
:::

```cpp title="hello.cpp"
#include <iostream>

int main() {
    std::cout << "Hello, World!\n";
    return 0;
}
```

输出 `Hello, World!` 表示这次构建运行成功。Visual Studio 的“启动”是运行项目，不是任意打开一个 `.cpp` 文件就会自动生成完整工程。

:::notice{type="note" title="C 语言课程"}
C 语言源文件应使用 `.c` 后缀。Visual Studio 使用 MSVC，不是 Dev-C++ 使用的 GCC；编译选项、部分扩展和标准支持可能不同，作业与考试以课程要求为准。
:::

## 常见问题

:::details{title="找不到 C++ 控制台项目模板"}
打开 Visual Studio Installer，在对应版本旁选择“修改”，检查是否已安装“使用 C++ 的桌面开发”。只安装 IDE、.NET 或 Web 工作负载不会提供完整 C++ 桌面工具链。
:::

:::details{title="终端提示找不到 cl"}
普通 PowerShell 通常没有 MSVC 编译环境变量。使用开始菜单里的“Developer PowerShell for VS”或“x64 Native Tools Command Prompt for VS”，再运行 `cl`；不要靠随意添加单个可执行文件目录代替完整环境初始化。
:::

:::details{title="想制作离线安装包"}
上面的 `.exe` 是引导安装器，不能代替全部组件。官方支持 `--layout` 创建离线布局，但需预先下载所选组件并维护更新；这里不提供未经准备的离线包。具体步骤见下方官方离线安装文档。
:::

## 官方资料与相关工具

::source-list{group="official-docs"}
::resource-card{resource="vscode"}
::resource-card{resource="dev-cpp"}
