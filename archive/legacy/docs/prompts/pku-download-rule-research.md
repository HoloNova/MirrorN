# 可交给外部 Agent 的调研 Prompt

将以下正文整体交给另一个 Agent。它只负责探索和提出草案，不实施或部署；结果交回 MirrorN 主会话复核。

---

你是 MirrorN 的下载资源采集规则研究员。请以北京大学开源镜像站为完整样板，研究“通用模板＋软件特性”的规则体系，并交付可审核的规则草案。不要只给架构建议或几个成功例子。

## 产品目标与不可改变的边界

用户在本站按生态、软件、版本和镜像站找到安装下载链接。资源包括 Windows/macOS/Linux 软件安装器、预编译运行包，以及 Linux 系统安装镜像；软件的必要运行环境应如实标注。源码、文档、调试、校验文件、数据集、固件与辅助工具不能混成普通安装包。工具如果本身是独立可安装软件，例如 Rtools，应单独建身份。

只后台启动/定时采集元数据，动态得到版本、文件信息和具体直链，存 SQLite；前端/API 只查库，不触发源站抓取，不展示目录树。不下载安装包、不保存完整源索引，不恢复全部 APT/RPM/PyPI/pacman/conda 依赖采集。具体软件 DEB/RPM 可以审核研究，不能仅因其属于软件源就排除整个生态。

人工只维护生态/软件身份、采集入口、用途及识别规律，不维护逐版本文件清单和下载 URL。规则随源码审核、发布，**不开放规则修改接口、不热更新、不运行时调用 AI 判定文件**。外部研究结果一律 draft，由主会话决定是否采用。

## 资料与已知问题

北大源站：`https://mirrors.pku.edu.cn/`。后台目录元数据通常在 `/files/<路径>/`，实际下载在 `/<路径>/<文件名>`，不能将 `/files/` 接口或目录根当作文件链接。目录条目的 `type:"other"` 不代表不是文件；HTML、对象和 JSON 数组也不能混为同一种索引。

已有 40 条仓库身份（需核对当前目录，不能假定资料永远正确）：

```text
manjaro, ubuntu-releases, ubuntu-cdimage, ubuntu, ubuntu-ports,
epel, centos, centos-vault, centos-stream, archlinux, archlinuxcn,
opensuse, debian-cd, apache, debian, debian-security,
debian-multimedia, debian-nonfree, ctan, anaconda, CRAN, pypi,
kubernetes, openwrt, tensorlayerx, dl-release, termux,
bioconductor, openeuler, opnsense, immortalwrt, julia, loongarch,
archriscv, rocky, rocky-vault, almalinux, loongarch-lcpu, anthon,
nodejs-release
```

若能访问代码仓库（`https://github.com/HoloNova/MirrorN`），优先阅读：

- `docs/download-rule-system-design.md`
- `docs/pku-installer-collection-audit.md`
- `data/site-inventories/pku.json`、`data/site-resources/pku.json`、`data/ecosystem-taxonomy.json`
- `apps/server/src/indexing/software.ts`、`installers.ts`、`source.ts`

若没有本地代码访问能力，上述产品目标和仓库名单就是研究输入；明确没有读取源码，不假装做过代码级复现。

当前实现仅登记 Node.js、Miniconda、Anaconda、R 和发现 Apache 项目，强制 Apache 运行包名称带 bin/binary，整体排除 ISO 等格式；有下载的软件直接被当作生态。因此“只看到五个生态”不能用于推断镜像站支持范围。

2026-10-02 已取得的元数据线索（仅作样本，不静态登记这些版本为运行配置）：

- `apache/tomcat/tomcat-11/v11.0.26/bin/`：有 `.exe`、`-windows-x64.zip`、通用 `.tar.gz/.zip`，也有 fulldocs/deployer。
- `apache/kafka/4.3.1/`：`kafka_2.13-4.3.1.tgz` 是运行发行包；`kafka-4.3.1-src.tgz` 和 `kafka_2.13-4.3.1-site-docs.tgz` 应排除。Scala 与软件版本须分开。
- `ctan/systems/texlive/tlnet/`：有网络安装器、升级器、ISO 辅助安装器及 `TEXLIVE_2026` 标记。不能把全部同后缀文件当首次安装包。
- `ctan/systems/mac/mactex/`：有 `mactex-20260324.pkg`、`mactex-basictex-20260301.pkg` 和安装包别名；并非只有陈旧归档。
- `CRAN/bin/windows/Rtools/rtools45/files/`：有 `rtools45-6768-6492.exe` 和 ARM64 安装器。
- Ubuntu、Debian、Arch、Rocky、AlmaLinux、openEuler、openSUSE 已找到系统 ISO，不应整体排除。
- `kubernetes/core:/stable:/v1.34/deb/amd64/`：有 kubectl/kubeadm 等 DEB；不能因此恢复全发行版依赖扫描。

## 具体研究任务

### A. 覆盖所有仓库身份，不以根目录标签代替文件调查

对 40 条仓库逐项列出：对应生态、可提供的具体软件/系统、候选发布入口、实际文件样本、用途、适用系统/架构、版本含义、建议采集模板、是否当前验证、未知项。

同一仓库可包含多种用途，同一生态可包含多个软件，别把“仓库＝生态＝软件”混在一起。软件源、安装镜像、源码、数据集分别说明。若暂没发现安装资源，写“本次未发现/未确认及探索深度”，不能只看根目录便写“没有”。如当前仓库列表与输入不同，单独报告差异，不擅自启用其它镜像站。

Apache 的子项目另列候选表，覆盖不同发布布局，不能只验证 Maven/Tomcat/Kafka 后声称 Apache 已全覆盖。可分优先级批次，未核对的明确保留，不为完成数量盲目遍历所有历史版本。

### B. 提炼通用模板及软件特性

优先研究平铺安装包、版本目录发布、系统安装镜像、限定软件包子集等模板。说明每个模板需要哪些输入、能复用什么、不能决定什么。

软件特性应说明：审核根及下钻依据、身份识别、用途接受/拒绝、版本和复合版本、系统/架构、格式、安装变体、latest/current 别名、必要前置条件。能靠配置表达就提配置；复杂情况建议命名解析器，不造万能正则或可执行 DSL。

正则用于提取，不是用途判断的唯一证据。元数据、审核路径和命名规律应互相印证；多规则产生身份/版本/用途冲突要待核对，不能按第一条命中或分数自动放行。下划线形式 src、fulldocs、deployer、Scala 版本和 Unix 多系统适用性都必须考虑。

### C. 清洗、去重和未知项积累

给出字段归一化建议：原文件名/路径保留，格式最长后缀匹配，软件版本与发行版/语言运行时版本分开，平台/架构别名准确映射，变体不误合并，别名不冒充实际版本。

同 URL 更新一份；不同 URL 不凭同名或大小相同直接合并。未知布局/用途保存有限样本与原因，不成为第二套全量文件库，也不自动激活规则。

区分：源站文件消失、新规则明确排除、新规则认不出来。不能用新规则漏识别来删除旧有效数据，也不能因新下钻白名单漏选旧目录就当源站撤销。

## 调研执行边界

只读研究，不编辑业务代码、数据库、队列或生产配置，不 commit/push/deploy，不启动服务/浏览器，不再派发其它 Agent。可以输出研究工件与一次性元数据脚本；如具备仓库执行能力，优先复用现有 `SourceClient`。

源站请求仅限北大小元数据；官方静态文档可用于确认用途，注明文档来源及时间，不能将官方提供而北大没有的文件算作北大可下载。第三方没有许可的源码不复制。

北大研究预算：串行至少间隔 1 秒，总计最多 80 次元数据 GET、正文累计最多 16 MiB、单响应最多 4 MiB、单请求最多 30 秒。记录请求数/字节/时间/实际响应类型。禁止安装包或 ISO 包体、禁止 PyPI 根大索引、禁止全量 Packages/repodata/依赖展开。遇超限、跳转或格式不支持停止该入口，标未知，不自行放开限制。最新/代表版本用于研究，不意味着生产只采最新版或静态固定该版本。

工具或脚本持续失败时提交当前成果与原始错误，不反复调试耗尽时间、也不将失败包装为“该生态没有安装文件”。

## 必须交付

1. `coverage.md`：40 仓库总表、Apache 等多软件候选子表、可确认覆盖下界、优先级；证据分当前实测/历史资料/未确认。
2. `rule-proposals.json`：规则草案与站点绑定分开。每条至少包含 `id/softwareId/ecosystemId/templateId/status=draft/purpose`、入口绑定、接受/拒绝条件、字段提取、证据引用、限制。真实版本/文件名只作样本，不能写成生产白名单。
3. `samples.json`：每条拟接入规则尽可能提供真实正样本、容易混淆的负样本、期望分类和字段、source URL/checkedAt/实测状态。采不到就标缺失，不伪造源码样本冒充真实负样本；合成样本单独标记。
4. `open-questions.md`：未核实入口、版本含义、平台/架构、前置环境、模板不能覆盖的例外，以及预算内未完成项。

研究工件允许与最终 schema 不完全一致，但须写清字段含义，保持结构化，不能仅输出概念散文。配置草案必须包含不应命中的例子，不能为了覆盖率允许全部 zip/tar。

最终摘要回答：哪些能共用模板、哪些必须软件特例、此前具体漏在哪、哪些仍未确认。**不要把少数例子说成完整漏采总数；不要直接落地生产。**
