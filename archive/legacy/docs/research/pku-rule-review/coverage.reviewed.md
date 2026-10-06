# 北大40仓库逐项复核状态

仅研究稿。根级身份40/40均有主会话本轮证据；叶子验证仅覆盖选定用途，不能解读为各仓库全量验证。

| 仓库              | 现有生态 ID        | 本轮证据级别       | 修订规则配置                       | 缺口/处理                                                                                                  |
| ----------------- | ------------------ | ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| manjaro           | manjaro            | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| ubuntu-releases   | ubuntu             | 已核实选定文件叶子 | ubuntu                             | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| ubuntu-cdimage    | ubuntu             | 已核实选定文件叶子 | kubuntu                            | Kubuntu 有叶子文件证据；其它 flavour、ports、daily/snapshot 尚未逐项验证；保留候选，不按最高目录判稳定版。 |
| ubuntu            | ubuntu             | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| ubuntu-ports      | ubuntu             | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| epel              | epel               | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| centos            | centos             | 仅根级身份         | 暂无已审核模板绑定                 | 根可见数字版本，深层 isos 未复核；需区分历史 CentOS 与 Stream，不能冒称完备 ISO。                          |
| centos-vault      | centos             | 仅根级身份         | 暂无已审核模板绑定                 | 历史归档根已验证；ISO 叶子、架构与历史身份待验证。                                                         |
| centos-stream     | centos             | 仅根级身份         | 暂无已审核模板绑定                 | 9-stream/10-stream 根可见；深层 ISO 布局、版本和架构待验证。                                               |
| archlinux         | archlinux          | 已核实选定文件叶子 | archlinux                          | iso/ 已验证；images/ 是 QCOW2，bootstrap 是不同用途，不能混作 ISO。                                        |
| archlinuxcn       | archlinuxcn        | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| opensuse          | opensuse           | 已核实选定文件叶子 | opensuse-leap, opensuse-tumbleweed | Leap 与 Tumbleweed 需独立软件/版本语义；MicroOS、Rescue 和其它介质仍为候选。                               |
| debian-cd         | debian             | 已核实选定文件叶子 | debian                             | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| apache            | apache-archive     | 已核实选定文件叶子 | tomcat, kafka, maven, spark, ant   | 仅六个项目进入修订草案；其余子项目保留发现候选，未深入不等于源码-only。                                    |
| debian            | debian             | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| debian-security   | debian             | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| debian-multimedia | debian             | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| debian-nonfree    | debian             | 仅根级身份         | 暂无已审核模板绑定                 | 根明确有 images-including-firmware/cd-including-firmware；旧固件镜像与新版 Debian 的关联待验证。           |
| ctan              | texlive-ctan       | 已核实选定文件叶子 | texlive, mactex, basictex          | MacTeX、BasicTeX 分开；TeX Live 读年度标记，不硬编码年份；MiKTeX 未找到/未验证正式入口，不判定不存在。     |
| anaconda          | anaconda-installer | 已核实选定文件叶子 | anaconda, miniconda                | 两种软件身份分开；Python2、Python3、内置 Python 版本与发行版构建号不丢失；别名未核实不合并。               |
| CRAN              | r-cran             | 已核实选定文件叶子 | r-windows, r-macos, rtools         | 已补 Intel/ARM/Sonoma 入口；历史版本、其它 macOS 分支和旧 Rtools 保留待核实。                              |
| pypi              | pip-pypi           | 仅根级身份         | 暂无已审核模板绑定                 | 根含 web/generation/mirrored-files；不展开包名大索引；PyPI 生态身份保留，未审核独立软件目标。              |
| kubernetes        | kubernetes         | 已核实选定文件叶子 | kubernetes-tools                   | 四个工具分别建软件身份；已核验 amd64 DEB，RPM/其它架构待样本，不扩为全 APT 索引。                          |
| openwrt           | openwrt            | 仅根级身份         | 暂无已审核模板绑定                 | 保留生态/仓库身份；固件硬件与刷写模式另审，尚无本轮叶子证据，不自动接入通用三平台下载。                    |
| tensorlayerx      | dataset            | 仅根级身份         | 暂无已审核模板绑定                 | 根是 model/datasets；本阶段不采模型/数据集，但根证据不证明每个文件都无可安装用途。                         |
| dl-release        | dataset            | 仅根级身份         | 暂无已审核模板绑定                 | 根是论文项目；未深入审计所有论文文件，本阶段不全采数据集，不能宣称无任何软件。                             |
| termux            | termux             | 仅根级身份         | 暂无已审核模板绑定                 | Android/apt 根可见；本阶段不扩 Android，APK 安装器是否存在没有叶子证据。                                   |
| bioconductor      | r-bioconductor     | 仅根级身份         | 暂无已审核模板绑定                 | R 库发行版根可见；不全库采依赖；独立安装工具未审核，不直接断言全无。                                       |
| openeuler         | openeuler          | 已核实选定文件叶子 | openeuler                          | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| opnsense          | opnsense           | 已核实选定文件叶子 | 暂无已审核模板绑定                 | 本轮有 DVD/IMG 叶子证据；目标是 FreeBSD，不可标 Linux，当前平台建模未支持，保持候选。                      |
| immortalwrt       | immortalwrt        | 仅根级身份         | 暂无已审核模板绑定                 | 保留生态/仓库身份；同 OpenWrt，不继承其机型或版本规则。                                                    |
| julia             | julia              | 仅根级身份         | 暂无已审核模板绑定                 | root 的 artifact/package/registry 是缓存布局；不取大 UUID 索引，Julia 安装器入口未确认。                   |
| loongarch         | loongarch          | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| archriscv         | archriscv          | 已核实选定文件叶子 | archriscv                          | ISO 已验证；rootfs tar.zst、latest alias 用途/指向另外处理。                                               |
| rocky             | rocky              | 已核实选定文件叶子 | rocky                              | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| rocky-vault       | rocky              | 仅根级身份         | 暂无已审核模板绑定                 | 历史版本根已验证；未验证叶子与当前源范围分离。                                                             |
| almalinux         | almalinux          | 已核实选定文件叶子 | almalinux                          | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| loongarch-lcpu    | loongarch          | 仅根级身份         | 暂无已审核模板绑定                 | 当前仅核实仓库根；未审核具体软件子集。不恢复全量依赖扫描，也不把该生态删除。                               |
| anthon            | aosc               | 已核实选定文件叶子 | aosc                               | 已找到 installer ISO；不能把 desktop 的 tar.xz/squashfs 全部当系统安装器；其它架构/livekit 待定。          |
| nodejs-release    | nodejs             | 已核实选定文件叶子 | nodejs                             | 当前 v22.14.0 文件证据；旧版本未带架构 MSI 等命名仍待样本，不能静默删除。                                  |

根级证据见 `metadata-evidence.json`；可验证样本见 `samples.reviewed.json`。没有模板绑定不等于生态不受支持，也不等于源站没有安装文件。
