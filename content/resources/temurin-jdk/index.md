---
schemaVersion: 1
id: temurin-jdk
name: Eclipse Temurin JDK
summary: Eclipse Temurin 25、21、17 三个 LTS 版本的 Windows x64 安装包下载，以及安装和检查方法，适合 Java 课程。
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
draft: false
status: active
official: https://adoptium.net/
---

## 下载 JDK

写 Java 程序需要 JDK（Java 开发工具包）。它包含编译程序的 `javac`，也包含运行程序的 `java`。这里提供 Eclipse Temurin 的 25、21、17 三个 LTS（长期支持版）。课程指定版本时以课程为准；没有要求时，选 25。

::::choice{label="选择 JDK 版本"}
:::option{label="JDK 25（最新版，推荐）"}
课程没有指定版本时，选这个版本。

::download{source="official-25" label="下载 Temurin 25 LTS（Windows x64 安装包）"}

文件名为 `OpenJDK25U-jdk_x64_windows_hotspot_25.0.4.1_1.msi`。
:::
:::option{label="JDK 21"}
课程或老师明确要求 21 时，选这个版本。

::download{source="official-21" label="下载 Temurin 21 LTS（Windows x64 安装包）"}

文件名为 `OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.msi`。
:::
:::option{label="JDK 17"}
课程或项目明确要求 17 时，选这个版本。

::download{source="official-17" label="下载 Temurin 17 LTS（Windows x64 安装包）"}

文件名为 `OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.msi`。
:::
::::

## 安装

:::steps
1. 双击下载的 `.msi` 文件，按向导点击 Next。
2. 在 **Custom Setup（自定义安装）** 页面，确认 **Update the JAVA_HOME environment variable** 和 **Add the installation to the PATH environment variable** 两项为勾选状态。前一项让其他程序能找到 JDK 的位置，后一项让终端能直接运行 `java` 和 `javac`。
3. 完成安装后，关闭已经打开的终端。
:::

同时安装多个版本时，`JAVA_HOME` 和 `java` 命令只会指向其中一个。

## 检查是否成功

打开一个新的终端，依次输入下面两条命令：

```powershell title="PowerShell"
java -version
javac -version
```

两条命令都显示你安装的版本号（25、21 或 17 开头），说明安装成功。`java -version` 的第一行会以 `openjdk version` 开头。

## 常见问题

:::details{title="终端提示找不到 java 或 javac"}
通常是安装后没有重新打开终端，或者安装时没有勾选 PATH 相关选项。关闭所有终端窗口后重新打开。仍然找不到时，重新运行安装程序，选择 Modify 修改安装，并确认 PATH 选项已勾选。
:::

:::details{title="java -version 显示的版本不对"}
电脑上可能还装有其他 Java 版本，终端先找到了旧版本。在 PowerShell 中运行 `where.exe java`，查看它找到的路径。如果列表里有旧 JDK，请调整系统环境变量中 PATH 的顺序，或卸载不再需要的旧版本。
:::

:::details{title="装好了 JDK，却无法编译 Java 程序"}
编译需要 `javac`。只安装了 JRE（运行环境），或者只有 `java` 命令时，无法编译程序。确认 `javac -version` 能正常输出版本号；如果不能，请重新安装本页的 JDK 安装包。
:::

## 官方资料

::source-list{group="official-docs"}
