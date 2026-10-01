# 北京大学开源镜像站 40 条仓库：资源表核实记录（2026-09-29）

配套数据文件：`docs/research/pku-resource-taxonomy.json`（40 条，字段与来源逐条见 `evidence`/`uncertain`）。

本文件回答三个问题：哪些仓库有官方帮助文档、每条仓库该归为哪一种 `kind`、以及哪些条目需要人工定夺。所有结论都来自本次实际请求，没有凭记忆填写。

## 一、数据来源与请求方式

- 官方仓库清单：`data/site-inventories/pku.json`（40 条）。清单来源 `https://mirrors.pku.edu.cn/monitor/mirrors` 本次重新请求过，返回的 40 个 id、名称、路径与 pku.json 一致。
- 目录事实：`https://mirrors.pku.edu.cn/files/<仓库 id>/` 及其子目录。该接口返回 JSON 目录列表（`name/type/mtime/size`）；本次只取小体积列表，最小 82 字节、最大约 2.9 MB（`archlinuxcn/x86_64/`，20,768 项）。
- 单文件可用性：用 `HEAD` 只取响应头（`Content-Length`/`Last-Modified`），不下载正文。
- 帮助文档：`https://mirrors.pku.edu.cn/static/help/<名称>.md`（.md 由 nginx 以 `application/octet-stream` 返回）。文档路径来自站点前端 bundle（`static/js/0.30d2be74e70df7f7b0cf.js`）：目录组件写死 `ArchLinux.md`、`CTAN.md`、`Anaconda.md`、`Pypi.md`、`Kubernetes.md`、`Ubuntu.md`+`Ubuntu2404.md`、`Debian*.md`、`CentOS/<版本>.md`、`CentOS-Vault/<版本>.md`，其余走兜底组件 `/static/help/<help 字段>.md`。
- 明确没做的事：没有下载任何 ISO / 安装器 / 硬盘镜像正文；没有拉 `https://mirrors.pku.edu.cn/files/pypi/web/simple/` 的正文（只用 HEAD，`Content-Length` 47,806,562，正文未取）；没有改动 `data/` 与 `apps/`，没有提交、部署，没有启动常驻进程。

## 二、结论摘要

- 40 条仓库的**顶层** `/files/<id>/` 本次全部返回 `200 application/json`。题目预期“有些目录返回 HTML”，实际在顶层没有出现；HTML 出现在更深层和不存在的路径上（见第五节）。
- `kind` 计数：`distro-repo` 26、`language-repo` 5、`iso-only` 4、`installer` 3、`dataset` 2。
- `ecosystem` 计数：debian 4；centos 3；ubuntu 2、ubuntu-releases 2、rocky 2、loongarch 2、dataset 2；manjaro / archlinux / archlinuxcn / opensuse / epel / almalinux / openeuler / openwrt / immortalwrt / opnsense / termux / kubernetes / archriscv / aosc / texlive-ctan / anaconda-installer / r-cran / r-bioconductor / pip-pypi / julia / nodejs / debian-cd / apache-archive 各 1（`python-conda` 本次没有用上，原因见第六节）。

## 三、官方帮助文档覆盖情况

`/monitor/mirrors` 里带 `help` 字段的正好 20 条仓库，对应的文档都实测存在（HTTP 200）：

| 仓库 id       | 页面名（help） | 实际文档                                                             |
| ------------- | -------------- | -------------------------------------------------------------------- |
| manjaro       | Manjaro        | `/static/help/Manjaro.md`                                            |
| ubuntu        | Ubuntu         | `Ubuntu.md` + `Ubuntu2404.md`（按版本切换）                          |
| epel          | EPEL           | `/static/help/EPEL.md`                                               |
| centos        | CentOS         | `CentOS/CentOS7.md`、`CentOS/CentOS8.md`、`CentOS/CentOS8-Stream.md` |
| centos-vault  | CentOS-Vault   | `CentOS-Vault/CentOS7Before.md`、`CentOS-Vault/CentOS8.md`           |
| centos-stream | CentOS-Stream  | `CentOS-Stream.md`                                                   |
| archlinux     | ArchLinux      | `/static/help/ArchLinux.md`                                          |
| archlinuxcn   | Archlinux CN   | `/static/help/Archlinux%20CN.md`（文件名含空格）                     |
| opensuse      | openSUSE       | `/static/help/openSUSE.md`                                           |
| debian        | Debian         | `Debian.md`、`Debian12.md`、`Debiansid.md`、`Debiantesting.md`       |
| ctan          | CTAN           | `/static/help/CTAN.md`                                               |
| anaconda      | Anaconda       | `/static/help/Anaconda.md`                                           |
| CRAN          | CRAN           | `/static/help/CRAN.md`                                               |
| pypi          | Pypi           | `/static/help/Pypi.md`                                               |
| kubernetes    | Kubernetes     | `/static/help/Kubernetes.md`                                         |
| openwrt       | Openwrt        | `/static/help/Openwrt.md`                                            |
| bioconductor  | bioconductor   | `/static/help/bioconductor.md`                                       |
| openeuler     | openeuler      | `/static/help/openeuler.md`                                          |
| immortalwrt   | immortalwrt    | `/static/help/immortalwrt.md`                                        |
| rocky         | Rocky          | `/static/help/Rocky.md`                                              |

几个必须记住的例外：

- **termux**：清单里这一条把键写成了 `"Termux"` 而不是 `"help"`，前端只认 `help`，所以帮助页不会列出它；但 `/static/help/Termux.md` 实际存在（1456 字节，讲 `termux-change-repo`）。属于站点数据笔误，不是缺文档。
- **centos-stream**：文档只有 8 字节，内容是 `writing`，是占位符，不能当使用指南用。
- **Ubuntu 有一份没被引用的文档**：`/static/help/Ubuntu2204.md` 返回 200，但前端只请求 `Ubuntu.md` 与 `Ubuntu2404.md`，不会展示它。
- **没有文档的 19 条仓库**：ubuntu-releases、ubuntu-cdimage、ubuntu-ports、debian-cd、apache、debian-security、debian-multimedia、debian-nonfree、tensorlayerx、dl-release、opnsense、julia、loongarch、archriscv、rocky-vault、almalinux、loongarch-lcpu、anthon、nodejs-release（加上没被引用的 termux，共 20 条仓库在帮助页里没有入口）。另外试探了 Apache.md、Julia.md、Nodejs.md、NodeJS.md、Opnsense.md、Ubuntu-releases.md、Debian-cd.md、Archriscv.md、LoongArch.md、Loongarch.md、Anthon.md、dl-release.md、Ubuntu-ports.md、Debian-security.md、Debian-multimedia.md、Debian-nonfree.md、Rocky-Vault.md、AlmaLinux.md、TensorLayerX.md、aosc.md 共 20 个候选文件名，全部 404。

## 四、kind 判断与理由

### installer（3 条：anaconda、apache、nodejs-release）

站内可以给出直接的下载文件，但都没有“发行版版本层级 + 换源入口”的语义（anaconda 的换源入口是另一条资源，见第六节）：

- **anaconda**：`miniconda/` 下 1606 项，包含 `Miniconda3-latest-*` 多平台别名文件（Linux/macOS 的 .sh/.pkg、Windows 的 .exe，2026-08-28 更新）与带日期文件；实测 `miniconda/Miniconda3-latest-Linux-x86_64.sh` 200（197,973,354 字节）。
- **nodejs-release**：898 项（绝大多数是 `vX.Y.Z/` 版本目录，从 v0.1.x 起，另有 `npm/`、`patch/`；**没有 latest 目录**），目录内按平台分文件（`node-v24.1.0-linux-x64.tar.xz`、`win-x64.zip`、`darwin-arm64.tar.gz/.pkg`、`arm64.msi`、`SHASUMS256.txt`）。实测 `v24.1.0/node-v24.1.0-linux-x64.tar.xz` 200（31.6 MB）。
- **apache**：263 个项目目录 → 版本目录 → 源码/二进制包（实测 `activemq/6.3.2/` 下有 `apache-activemq-6.3.2-bin.tar.gz`、`-bin.zip`、`-source-release.zip`）。它既不是单一安装器也不是包管理器仓库，固定 kind 里没有“软件归档”，见第六节。

### distro-repo（26 条）

判据是“客户端配置一个 base URL，包按版本/组件层级解析”，页面应给版本层级与入口，而不是逐个列包：

manjaro、ubuntu、ubuntu-ports、epel、centos、centos-vault、centos-stream、archlinux、archlinuxcn、opensuse、debian、debian-security、debian-multimedia、debian-nonfree、kubernetes、openwrt、termux、openeuler、immortalwrt、loongarch、loongarch-lcpu、archriscv、rocky、rocky-vault、almalinux、anthon。

其中几条的形态值得单独记：

- **kubernetes**：仓库根只有 `core:/` 与 `addons:/` 两组目录（目录名带冒号）；`core:/stable:/v1.24`–`v1.37`，每个版本下再有 `rpm/` 与 `deb/`，`rpm/{x86_64,aarch64,ppc64le,s390x}/repodata`。帮助文档给的 `baseurl` 用的是 `/kubernetes/yum/repos/kubernetes-el7-$basearch`，实测该前缀 404，文档与实际目录不一致。
- **termux**：`apt/<渠道>/`（termux-main、termux-main-21、termux-root、termux-x11，apt 仓库结构）与 `termux-main/`（bootstrap 包）是两套东西；换源用 apt 仓库。
- **archriscv**：没有 `os/<arch>/` 中间层，`repo/{core,extra,community,multilib,unsupported}/` 目录内直接是 `core.db`、`core.files` 与 `*.pkg.tar.zst`（riscv64）。
- **loongarch / loongarch-lcpu**：`archlinux/{core,extra,…}/os/loong64/`（LoongArch 版 Arch 仓库），另有 `iso/`、`netboot/`；两者的 `core.db` 字节数与 `Last-Modified` 完全相同（92,086 / 2026-09-26 17:40:24）。
- **anthon**：`debs/`（dists+pool 的 apt 仓库）、`aosc-os/`（18 个架构的安装镜像）、`oma/`、`pubkeys/` 等，是 AOSC 相关仓库，但站点没给任何说明文字。
- **debian-nonfree**：没有 `dists/` 索引，实际内容只有 `firmware/<代号>/<点版本>/` 里的固件压缩包（12.15.0 下有 `firmware.tar.gz`、`firmware.cpio.gz`、`firmware.zip`），`images-including-firmware/`、`cd-including-firmware/` 只有 `HEADER.html`。

### language-repo（5 条：ctan、CRAN、pypi、bioconductor、julia）

判据是“给工具用的包索引/仓库地址”，教程对应 `~/.Rprofile`、`pip config`、`tlmgr` 之类：

- ctan → `systems/texlive/tlnet`（tlmgr 源，含 `install-tl-unx.tar.gz`）
- CRAN → `src/contrib`、`bin/{windows,macosx}`，换源是 `options(repos=…)`
- pypi → `web/simple`（pip index-url）；首页 47.8 MB，自动检查必须走包名级子目录或只看头
- bioconductor → `packages/<版本>/bioc/src/contrib`，当前版本 3.24；换源是 `BioC_mirror`
- julia → Julia 包服务器布局（`artifact/`、`package/`、`registry/<uuid>/`、`registries` 指针文件），本次未验证作为 `JULIA_PKG_SERVER` 的用法

（anaconda 的 conda 通道本来也属于这一类，但同一仓库里 Miniconda 安装器更直接，见上；`python-conda` id 本次因此没用上。）

### dataset（2 条：tensorlayerx、dl-release）

只有数据/模型文件，没有包索引：

- **tensorlayerx**：`datasets/`（LibriSpeech、coco2017、widerface、mjsynth、enfr，大文件分片 `.tar.gz.0–.7`）与 `model/{speech,text,vision}/`。
- **dl-release**：9 个论文/项目目录（BiAssembly-ICML2025、DexGraspNet-ICRA2023、UniDexGrasp_CVPR2023…）加根目录上的压缩包；站点清单只写 “papers”。

### iso-only（4 条：ubuntu-releases、ubuntu-cdimage、debian-cd、opnsense）

内容是按版本/介质排列的安装镜像，没有包索引：

- ubuntu-releases：`24.04/` 下 `ubuntu-24.04.5.1-desktop-amd64.iso`（6.25 GB，实测 200）
- debian-cd：`current/amd64/iso-cd/debian-13.7.0-amd64-netinst.iso`（实测 200）
- opnsense：`releases/<版本>/` 下 `OPNsense-<版本>-dvd-amd64.iso.bz2` 与 nano/serial/vga 镜像（实测 25.7 的 ISO 200）
- ubuntu-cdimage：`daily-live/current/` 仍是 2021 年的 hirsute ISO，`releases/` 下只有 `streams/v1` 索引

## 五、请求中发现的异常与坑

1. **`/files/` 有时返回 HTML 而不是 JSON**：`/files/bioconductor/packages/3.21/`、`/files/bioconductor/release/` 返回 101 字节 HTML（`<meta http-equiv="refresh" content="0;url=BiocViews.html#___Software">`），不是目录 JSON；不存在的路径返回 nginx 的 404 HTML（如 `/files/kubernetes/yum/`）。解析目录时必须同时判 `Content-Type` 与状态码，不能假定 200 就是 JSON。
2. **k8s 帮助文档的路径已失效**：`/kubernetes/yum/repos/kubernetes-el7-x86_64/repodata/repomd.xml` 404，实际仓库根是 `core:/`、`addons:/`。
3. **ubuntu 仓库里有自引用目录**：`/files/ubuntu/`、`/files/ubuntu/ubuntu/`、`/files/ubuntu/ubuntu/ubuntu/` 返回同一组 6 项（dists、indices、pool、project、ubuntu、ls-lR.gz），看起来是 `ubuntu -> .` 之类的符号链接；任何递归目录爬取都要防环。
4. **镜像内部的“新鲜度”差异很大，不能只看一个文件**：`debian/dists/bookworm/Release` 是 2026-07-11，而 `bookworm-security/Release` 是 2026-09-28；`centos/7` 与 `centos-vault/7.9.2009` 的 repomd 都停在 2020-10-29（EOL，正常）；`openwrt`/`immortalwrt` 24.10.0 的 `Packages.gz` 是 2025-02；`ubuntu-cdimage` 停在 21.04。
5. **历史版本不保证存在**：`bioconductor/packages/3.22/bioc/src/contrib/PACKAGES.gz` 404，只有当前版本 3.24 能确认。
6. **latest 别名的可靠性不一致**：`nodejs-release` 完全没有 latest 目录；`anaconda/miniconda/` 有 `Miniconda3-latest-*` 文件（2026-08-28 更新），但清单里能看到的带日期文件较旧（如 `Miniconda3-py310_24.11.1-0-Linux-x86_64.sh`），两者不一定对应同一版本。
7. **pypi 索引页 47.8 MB**：`/pypi/web/simple/` 只能 HEAD 或按包名取子目录；这也说明“把资源表的 downloadEntry 直接当探针 URL”会出事。

## 六、需要人工定夺的条目

| 仓库 id                    | 问题                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apache                     | 既不是安装器也不是包仓库；固定 kind 里没有“软件归档”。本表暂记 `installer`（下载型），呈现方式（按项目 → 版本 → 文件）需要确认                                                                                                               |
| anaconda                   | 同一仓库既是 Miniconda 安装器（下载型）又是 conda 通道（配置型，官方帮助文档 Anaconda.md 讲的是后者）。本表按题目示例把 miniconda 记为主资源（`anaconda-installer` / `installer`）；若资源表还要保存换源入口，要再加一条 `python-conda` 资源 |
| ubuntu-cdimage             | 固定生态清单没有这个 id，暂用 `ubuntu-releases`；且镜像内容停在 21.04，是否还值得入库需确认                                                                                                                                                  |
| ubuntu-ports               | 与 ubuntu 同生态（同一 pocket 结构，面向非 x86 架构），是否要拆成独立资源、`platforms` 怎么写需确认                                                                                                                                          |
| debian-multimedia          | 第三方源（deb-multimedia），与 Debian 官方仓库不是同一上游；本表暂归 `debian`                                                                                                                                                                |
| debian-nonfree             | 没有 dists 索引，只有 firmware 压缩包与空的镜像目录；`distro-repo` 这个 kind 是否合适需确认                                                                                                                                                  |
| tensorlayerx               | 固定生态清单没有 TensorLayerX/深度学习框架 id，只能记 `dataset`                                                                                                                                                                              |
| dl-release                 | 站点没有说明用途（只写 “papers”），按内容记 `dataset`                                                                                                                                                                                        |
| anthon                     | 仓库名、描述都缺；按内容判为 AOSC 生态，`aosc` id 是否符合预期需确认                                                                                                                                                                         |
| loongarch / loongarch-lcpu | 两份 archlinux 树看起来是同一份内容（core.db 字节数与时间戳一致），是否合并或区分需确认                                                                                                                                                      |
| bioconductor               | 历史版本目录的 `/files/` 列表返回 HTML，且旧版本（3.22）PACKAGES.gz 404；自动检查只能按当前版本做                                                                                                                                            |
| pypi                       | 入口索引 47.8 MB，必须约定“禁止整页抓取”，否则后续检查会拉大文件                                                                                                                                                                             |
| termux                     | 清单里的 `Termux` 键是笔误；帮助文档存在但帮助页不显示，是否需要报给站点维护方（本项目不代第三方提交 issue）                                                                                                                                 |
| centos-stream              | 帮助文档是 `writing` 占位符                                                                                                                                                                                                                  |
| kubernetes                 | 帮助文档的换源地址实测 404，与实际目录不一致                                                                                                                                                                                                 |
| julia                      | 没有帮助文档；作为 Julia 包服务器的配置方式未核实，不能由目录形态推断                                                                                                                                                                        |
| nodejs-release             | 是 Node.js 运行时发行包（官方 dist 镜像），不是 npm registry；接入 nodejs 生态时不要与 npm 换源混用                                                                                                                                          |

（JSON 里另有两条 `uncertain` 只是信息性说明、不需要决策：`centos` 帮助页按版本切换 `CentOS7/CentOS8/CentOS8-Stream` 三个文档；`debian` 帮助页按版本切换 `Debian.md`、`Debian12.md`、`Debiansid.md`、`Debiantesting.md`。）

补充的平台取值约定：本表 `platforms` 指资源服务的目标平台，惯例用 `linux`（发行版/ISO）、`windows`/`macos`/`linux`（跨平台安装器与语言仓库）、`android`（termux）、`freebsd`（opnsense）。如果入库 schema 想固定成 `windows|macos|linux` 三值，`termux`、`opnsense` 两条要另定。

## 七、本次未做与后续建议

- 没有验证任何镜像的**同步状态**（`/monitor/mirrors` 之外的状态源未查），也没有做可用性探针；本表只回答“这个仓库里有什么、该怎么归类、入口在哪”。
- 没有验证镜像站与上游官方站点的同步关系（例如 ubuntu-cdimage 停更是否只是本站的问题）。
- 建议后续入库时：目录抓取一律带 `Content-Type` 校验与深度上限；探针 URL 不要直接用 `downloadEntry`（pypi 索引 47.8 MB）；`helpDocUrl` 只填实测 200 的地址，`centos-stream`、`kubernetes` 这类文档要么等站点修好、要么在数据里标注状态。
