---
schemaVersion: 1
id: temurin-jdk
name: Eclipse Temurin JDK
summary: Eclipse Temurin 25 LTS（Java 开发工具包）Windows x64 MSI 安装包下载、安装与 java 命令检查。
category: runtime
tags:
  domain: [java]
  platform: [windows]
  arch: [x64]
  origin: [official, github]
  format: [installer]
aliases: [Temurin, JDK, OpenJDK, Java 开发工具包, Java 环境, Adoptium, Java]
authors: [HoloNova]
publishedAt: 2026-10-08
draft: true
status: active
official: https://adoptium.net/
---

## 下载 JDK

写 Java 程序需要 JDK（Java 开发工具包）。它包含编译程序的 `javac`，也包含运行程序的 `java`。Eclipse Temurin 是 Adoptium 项目发布的 OpenJDK 构建。

Adoptium 目前最新的 LTS（长期支持版）是 JDK 25。课程指定 Java 21 或其他版本时，请换成课程要求的版本，不要自行替换。

::download{source="official-msi" label="下载 Temurin 25 LTS（Windows x64 MSI）"}

文件名为 `OpenJDK25U-jdk_x64_windows_hotspot_25.0.4.1_1.msi`。Adoptium 在同一发布中提供了同名的 `.sha256.txt` 校验文件，校验值如下：

::checksum{artifact="win-x64-msi"}

## 安装

:::steps
1. 双击下载的 `.msi` 文件，按向导点击 Next。
2. 在 **Custom Setup（自定义安装）** 页面，确认 **Update the JAVA_HOME environment variable** 和 **Add the installation to the PATH environment variable** 两项为勾选状态。前一项让其他程序能找到 JDK 的位置，后一项让终端能直接运行 `java` 和 `javac`。
3. 完成安装后，关闭已经打开的终端。
:::

## 检查是否成功

打开一个新的终端，依次运行：

```powershell title="PowerShell"
java -version
javac -version
$env:JAVA_HOME
```

`java -version` 的第一行应以 `openjdk version` 开头，版本号以 25 开头。`javac -version` 应显示以 `javac 25` 开头的版本。`$env:JAVA_HOME` 会显示 JDK 的安装目录。

## 常见问题

:::details{title="终端提示找不到 java 或 javac"}
通常是安装后没有重新打开终端，或者安装时没有勾选 PATH 相关选项。关闭所有终端窗口后重新打开。仍然找不到时，重新运行安装程序，选择 Modify 修改安装，并确认 PATH 选项已勾选。
:::

:::details{title="java -version 显示的版本不是 25"}
电脑上可能还装有其他 Java 版本，终端先找到了旧版本。在 PowerShell 中运行 `where.exe java`，查看它找到的路径。如果列表里有旧 JDK，请调整系统环境变量中 PATH 的顺序，或卸载不再需要的旧版本。
:::

:::details{title="装好了 JDK，却无法编译 Java 程序"}
编译需要 `javac`。只安装了 JRE（运行环境），或者只有 `java` 命令时，无法编译程序。确认 `javac -version` 能正常输出版本号；如果不能，请重新安装本页的 JDK 安装包。
:::

## 官方资料

::source-list{group="official-docs"}
