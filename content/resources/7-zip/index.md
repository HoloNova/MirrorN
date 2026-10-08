---
schemaVersion: 1
id: 7-zip
name: 7-Zip
summary: 7-Zip 64 位 Windows 安装程序下载与安装说明，用于打开 7z、ZIP、RAR 等常见压缩包。
category: software
tags:
  platform: [windows]
  arch: [x64]
  origin: [official, github]
  format: [installer]
aliases: [7zip, 7z, 解压, 解压软件, 解压缩软件, 压缩软件]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: true
status: active
official: https://www.7-zip.org/
---

## 下载 7-Zip

7-Zip 是免费的压缩与解压软件。Windows 自带的压缩功能主要处理 ZIP 格式，遇到 `.7z`、`.rar` 等压缩包时，需要装上 7-Zip 才能打开。官网说明它是免费软件，采用 GNU LGPL 许可，部分代码另有 unRAR 许可限制。

大多数 Intel 或 AMD 电脑选择下面的 **Windows x64** 安装程序。ARM 设备需要到官方下载页选择 ARM64 版本。

::download{source="official-exe" label="下载 7-Zip 26.04（Windows x64 安装程序）"}

官方下载页当前标注的版本是 26.04，文件名为 `7z2604-x64.exe`。文件由 7-zip.org 下载页链接到的官方发布提供，本站不托管。官网没有给出这个文件的 SHA-256，因此本页不显示校验值。

## 安装

:::steps
1. 双击下载的 `7z2604-x64.exe`。如果系统弹出权限确认，选择“是”。
2. 安装窗口保持默认选项，按提示完成安装。
3. 安装完成后关闭窗口，不需要额外设置。
:::

## 检查是否成功

在任意一个 `.zip` 或 `.7z` 文件上点击右键。如果菜单中出现 **7-Zip** 子菜单，说明安装成功。也可以在开始菜单中搜索“7-Zip”，打开它的文件管理器。

## 日常使用

- **解压**：右键压缩包，打开 7-Zip 子菜单，选择解压相关的命令。第一次使用时，建议解压到一个新建的文件夹，避免文件散落在下载目录里。
- **压缩**：选中要打包的文件或文件夹，右键打开 7-Zip 子菜单，选择添加到压缩包的命令，再选择格式。一般使用 `.zip` 或 `.7z`。
- **RAR**：7-Zip 可以打开 RAR 压缩包，但不能创建 RAR 格式。需要创建 RAR 时，要使用其他软件。

## 常见问题

:::details{title="压缩包提示需要密码"}
这个压缩包已经加密，7-Zip 不能绕过密码。请向发送文件的人确认密码，再输入即可。
:::

:::details{title="右键菜单里没有 7-Zip"}
先确认安装程序已经完成。如果刚安装，重新启动电脑后再看一次。仍然没有时，卸载后重新安装。
:::

:::details{title="下载到的文件名和本页不一致"}
本页下载文件名应为 `7z2604-x64.exe`。文件名或来源不一致时，先不要运行它，回到本页的官方入口重新下载。
:::

## 官方资料

::source-list{group="official-docs"}
