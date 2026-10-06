# MirrorN 软件镜像站调研报告与技术清单

> **调研背景与目标**：为开源项目 [MirrorN](https://github.com/HoloNova/MirrorN) 调研全球及中国大陆用户可用的公开软件镜像站，从仅覆盖 `pip`、`npm`、`Ubuntu apt`、`Docker CE`、`Docker Hub` 拓展至 **Go (GOPROXY)**、**Maven**、**Cargo (Rust Crates.io)**，以及 **Debian**、**Arch Linux**、**Alpine Linux**、**CRAN** 等高需求开发者生态。
> **测试环境与网络位置**：海外东京节点（Tokyo, Japan，AS14593 SpaceX Starlink 出口，用于验证全球可达性、CORS 头及大陆站点对外响应边界）。
> **测试时间**：2026-09-28
> **原则遵循**：低频小流量实测、严格区分“站点宣称”与“真实元数据拉取已验证”、不以首页 200 代替仓库核实、去重别名与联盟入口、不产生换源命令与机器配置改动。

---

## 目录

1. [可机器处理的 JSON 完整清单](#1-可机器处理的-json-完整清单)
2. [逐站调查记录与端点映射深度分析](#2-逐站调查记录与端点映射深度分析)
   - [2.1 高校开源镜像站](#21-高校开源镜像站)
   - [2.2 头部商业云与企业级镜像站](#22-头部商业云与企业级镜像站)
   - [2.3 专有生态高速镜像与公共代理服务](#23-专有生态高速镜像与公共代理服务)
   - [2.4 官方全球基准源](#24-官方全球基准源)
   - [2.5 镜像联盟、跳转入口与失效站点甄别](#25-镜像联盟跳转入口与失效站点甄别)
3. [去重后的优先级决策清单](#3-去重后的优先级决策清单)
   - [3.1 第一梯队：可立即接入 (Ready to Integrate)](#31-第一梯队可立即接入-ready-to-integrate)
   - [3.2 第二梯队：需补验证 / 条件可用 (Conditionally Viable)](#32-第二梯队需补验证--条件可用-conditionally-viable)
   - [3.3 排除项与废弃站点 (Excluded / Deprecated)](#33-排除项与废弃站点-excluded--deprecated)
4. [调研覆盖边界与未覆盖说明](#4-调研覆盖边界与未覆盖说明)

---

## 1. 可机器处理的 JSON 完整清单

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-09-28T18:45:00+08:00",
  "surveyor": "Antigravity Research Engine for MirrorN",
  "networkEnvironment": {
    "executionLocation": "Tokyo, Japan (AS14593 SpaceX Starlink)",
    "probeCriteria": "Low-frequency, small-flow metadata/header verification (<100KB), non-intrusive"
  },
  "sites": [
    {
      "id": "ustc",
      "name": "中国科学技术大学开源软件镜像站",
      "operator": "中国科学技术大学 Linux 用户协会 (USTC LUG) / 网络信息中心",
      "homepageUrl": "https://mirrors.ustc.edu.cn/",
      "aliases": ["ustc", "lug.ustc", "中科大", "科大源", "中国科大"],
      "evidence": [
        "https://mirrors.ustc.edu.cn/static/json/index.json",
        "https://mirrors.ustc.edu.cn/help/crates.io-index.html",
        "https://mirrors.ustc.edu.cn/help/debian.html"
      ],
      "statusEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json",
      "inventoryEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://mirrors.ustc.edu.cn/crates.io-index/",
          "versions": [],
          "sourceUrl": "https://mirrors.ustc.edu.cn/help/crates.io-index.html",
          "verification": {
            "method": "GET https://mirrors.ustc.edu.cn/crates.io-index/config.json & GET crate dl",
            "timestamp": "2026-09-28T18:42:40+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/json",
            "cors": "unknown",
            "sampleResponse": "config.json: dl=https://mirrors.ustc.edu.cn/crates.io/api/v1/crates; sample rand dl HTTP 200 (87113 B)"
          },
          "statusEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json (item: crates.io-index)",
          "inventoryEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json",
          "limitations": "同时提供 sparse 索引和本地 crate 反向代理缓存，支持 cargo search 与实际依赖完整拉取。"
        },
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.ustc.edu.cn/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.ustc.edu.cn/help/debian.html",
          "verification": {
            "method": "HEAD https://mirrors.ustc.edu.cn/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json (item: debian)",
          "inventoryEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json",
          "limitations": "none"
        },
        {
          "ecosystem": "archlinux",
          "repositoryUrl": "https://mirrors.ustc.edu.cn/archlinux/",
          "versions": ["x86_64"],
          "sourceUrl": "https://mirrors.ustc.edu.cn/help/archlinux.html",
          "verification": {
            "method": "HEAD https://mirrors.ustc.edu.cn/archlinux/core/os/x86_64/core.db",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "core.db size 129884 bytes"
          },
          "statusEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json (item: archlinux)",
          "inventoryEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json",
          "limitations": "none"
        },
        {
          "ecosystem": "alpine",
          "repositoryUrl": "https://mirrors.ustc.edu.cn/alpine/",
          "versions": ["v3.18", "v3.19", "v3.20", "v3.21", "edge"],
          "sourceUrl": "https://mirrors.ustc.edu.cn/help/alpine.html",
          "verification": {
            "method": "HEAD https://mirrors.ustc.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "APKINDEX size 473603 bytes"
          },
          "statusEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json (item: alpine)",
          "inventoryEndpoint": "https://mirrors.ustc.edu.cn/static/json/index.json",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "tsinghua",
      "name": "清华大学开源软件镜像站",
      "operator": "清华大学信息化工作办公室 / 清华大学 TUNA 协会",
      "homepageUrl": "https://mirrors.tuna.tsinghua.edu.cn/",
      "aliases": ["tuna", "tsinghua", "thu", "清华源", "清华大学"],
      "evidence": [
        "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
        "https://mirrors.tuna.tsinghua.edu.cn/help/crates.io-index/",
        "https://mirrors.tuna.tsinghua.edu.cn/help/debian/"
      ],
      "statusEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
      "inventoryEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/",
          "versions": [],
          "sourceUrl": "https://mirrors.tuna.tsinghua.edu.cn/help/crates.io-index/",
          "verification": {
            "method": "GET https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/config.json",
            "timestamp": "2026-09-28T18:41:40+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/json",
            "cors": "unknown",
            "sampleResponse": "{\"dl\":\"https://static.crates.io/crates\",\"api\":\"https://crates.io\"}"
          },
          "statusEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json (job: crates.io-index)",
          "inventoryEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
          "limitations": "重要限制：其 config.json 中的 dl 字段指向官方 static.crates.io，即仅镜像 sparse/git 元数据索引，crate 二进制下载直接回源官方，无境内二进制缓存加速效果。"
        },
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.tuna.tsinghua.edu.cn/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.tuna.tsinghua.edu.cn/help/debian/",
          "verification": {
            "method": "HEAD https://mirrors.tuna.tsinghua.edu.cn/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json (job: debian)",
          "inventoryEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
          "limitations": "法律与政策声明标明不对欧盟用户服务；robots.txt 带 query 参数会返回 403。"
        },
        {
          "ecosystem": "archlinux",
          "repositoryUrl": "https://mirrors.tuna.tsinghua.edu.cn/archlinux/",
          "versions": ["x86_64"],
          "sourceUrl": "https://mirrors.tuna.tsinghua.edu.cn/help/archlinux/",
          "verification": {
            "method": "HEAD https://mirrors.tuna.tsinghua.edu.cn/archlinux/core/os/x86_64/core.db",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "core.db size 129884 bytes"
          },
          "statusEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json (job: archlinux)",
          "inventoryEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
          "limitations": "Tier 1 官方同步源，更新频率高。"
        },
        {
          "ecosystem": "alpine",
          "repositoryUrl": "https://mirrors.tuna.tsinghua.edu.cn/alpine/",
          "versions": ["v3.18", "v3.19", "v3.20", "v3.21", "edge"],
          "sourceUrl": "https://mirrors.tuna.tsinghua.edu.cn/help/alpine/",
          "verification": {
            "method": "HEAD https://mirrors.tuna.tsinghua.edu.cn/alpine/v3.20/main/x86_64/APKINDEX.tar.gz",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "APKINDEX size 473603 bytes"
          },
          "statusEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json (job: alpine)",
          "inventoryEndpoint": "https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "sjtug",
      "name": "上海交通大学 Linux 用户组开源镜像站 (思源/致远)",
      "operator": "上海交通大学 Linux 用户组织 (SJTUG) / 网络信息中心",
      "homepageUrl": "https://mirrors.sjtug.sjtu.edu.cn/",
      "aliases": ["sjtu", "sjtug", "siyuan", "zhiyuan", "交大源", "上交"],
      "evidence": [
        "https://mirrors.sjtug.sjtu.edu.cn/docs/maven-central",
        "https://mirrors.sjtug.sjtu.edu.cn/crates.io-index/config.json",
        "https://mirror.sjtu.edu.cn/crates.io/crates/rand/rand-0.8.5.crate"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://mirrors.sjtug.sjtu.edu.cn/crates.io-index/",
          "versions": [],
          "sourceUrl": "https://mirrors.sjtug.sjtu.edu.cn/crates.io-index/config.json",
          "verification": {
            "method": "GET config.json & GET crate dl via S3 backend",
            "timestamp": "2026-09-28T18:40:20+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/x-tar",
            "cors": "*",
            "sampleResponse": "config.json dl=https://mirror.sjtu.edu.cn/crates.io/crates/{crate}/{crate}-{version}.crate -> 301 to S3 -> 200 87113 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "底层采用交大私有云 S3 对象存储（s3.jcloud.sjtu.edu.cn）承载全量 crate 下载，支持完整 CORS。"
        },
        {
          "ecosystem": "maven",
          "repositoryUrl": "https://mirrors.sjtug.sjtu.edu.cn/maven-central/",
          "versions": [],
          "sourceUrl": "https://mirrors.sjtug.sjtu.edu.cn/docs/maven-central",
          "verification": {
            "method": "GET https://mirrors.sjtug.sjtu.edu.cn/maven-central/org/apache/commons/commons-lang3/maven-metadata.xml",
            "timestamp": "2026-09-28T18:39:50+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/xml",
            "cors": "unknown",
            "sampleResponse": "302 redirect from Caddy to https://repo.maven.apache.org/maven2/... then 200"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "重要发现：实质为 Caddy 反代/重定向层，直接 302 跳转至上游 Maven Central，非本地全量独立物理缓存。"
        }
      ]
    },
    {
      "id": "aliyun",
      "name": "阿里云开发者镜像站",
      "operator": "阿里云计算有限公司 (Alibaba Cloud)",
      "homepageUrl": "https://developer.aliyun.com/mirror/",
      "aliases": ["aliyun", "alibaba", "阿里源", "阿里云"],
      "evidence": [
        "https://developer.aliyun.com/mirror/maven",
        "https://developer.aliyun.com/mirror/goproxy",
        "https://mirrors.aliyun.com/crates.io-index/config.json"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "go",
          "repositoryUrl": "https://mirrors.aliyun.com/goproxy/",
          "versions": [],
          "sourceUrl": "https://developer.aliyun.com/mirror/goproxy",
          "verification": {
            "method": "GET https://mirrors.aliyun.com/goproxy/golang.org/x/text/@v/v0.14.0.info",
            "timestamp": "2026-09-28T18:40:41+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/json",
            "cors": "unknown",
            "sampleResponse": "{\"Version\":\"v0.14.0\",\"Time\":\"2023-10-11T21:58:48Z\"}"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "根路径 /goproxy/ 返回 404；必须按照 Go module 协议请求具体包名。列表响应 Content-Type 固定为 application/json。"
        },
        {
          "ecosystem": "maven",
          "repositoryUrl": "https://maven.aliyun.com/repository/public/",
          "versions": [],
          "sourceUrl": "https://developer.aliyun.com/mirror/maven",
          "verification": {
            "method": "GET https://maven.aliyun.com/repository/public/org/apache/commons/commons-lang3/maven-metadata.xml",
            "timestamp": "2026-09-28T18:41:15+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/xml",
            "cors": "unknown",
            "sampleResponse": "<metadata modelVersion=\"1.1.0\">... commons-lang3"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "聚合 central、jcenter、public 组；根路径返回 404，不可通过浏览器目录遍历。"
        },
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://mirrors.aliyun.com/crates.io-index/",
          "versions": [],
          "sourceUrl": "https://mirrors.aliyun.com/crates.io-index/config.json",
          "verification": {
            "method": "GET config.json & HEAD crate dl",
            "timestamp": "2026-09-28T18:41:40+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "config.json dl=https://mirrors.aliyun.com/crates/api/v1/crates; sample rand dl 200 OK (87113 B)"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "国内多线 CDN 节点加速，同时支持 sparse 索引和真实 crate 文件直接拉取。"
        },
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.aliyun.com/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://developer.aliyun.com/mirror/debian",
          "verification": {
            "method": "HEAD https://mirrors.aliyun.com/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        },
        {
          "ecosystem": "alpine",
          "repositoryUrl": "https://mirrors.aliyun.com/alpine/",
          "versions": ["v3.18", "v3.19", "v3.20", "v3.21", "edge"],
          "sourceUrl": "https://developer.aliyun.com/mirror/alpine",
          "verification": {
            "method": "HEAD https://mirrors.aliyun.com/alpine/v3.20/main/x86_64/APKINDEX.tar.gz",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "APKINDEX size 473603 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "tencent",
      "name": "腾讯云软件源",
      "operator": "腾讯云计算（北京）有限责任公司 (Tencent Cloud)",
      "homepageUrl": "https://mirrors.tencent.com/",
      "aliases": ["tencent", "tx", "腾讯源", "腾讯云镜像", "mirrors.cloud.tencent.com"],
      "evidence": [
        "https://mirrors.tencent.com/source.js",
        "https://cloud.tencent.com/document/product/213/8623"
      ],
      "statusEndpoint": "https://mirrors.tencent.com/source.js",
      "inventoryEndpoint": "https://mirrors.tencent.com/source.js",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "go",
          "repositoryUrl": "https://mirrors.tencent.com/go/",
          "versions": [],
          "sourceUrl": "https://mirrors.tencent.com/source.js",
          "verification": {
            "method": "GET https://mirrors.tencent.com/go/golang.org/x/text/@v/v0.14.0.info",
            "timestamp": "2026-09-28T18:40:41+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain; charset=utf-8",
            "cors": "unknown",
            "sampleResponse": "{\"Version\":\"v0.14.0\",\"Time\":\"2023-10-11T21:58:48Z\"}"
          },
          "statusEndpoint": "https://mirrors.tencent.com/source.js (item: go, status: Success)",
          "inventoryEndpoint": "https://mirrors.tencent.com/source.js",
          "limitations": "根路径 /go/ 返回 404；在 source.js 中声明同步状态为 Success。"
        },
        {
          "ecosystem": "maven",
          "repositoryUrl": "https://mirrors.tencent.com/maven/",
          "versions": [],
          "sourceUrl": "https://mirrors.tencent.com/source.js",
          "verification": {
            "method": "GET https://mirrors.tencent.com/maven/org/apache/commons/commons-lang3/maven-metadata.xml",
            "timestamp": "2026-09-28T18:41:15+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/xml",
            "cors": "unknown",
            "sampleResponse": "<metadata modelVersion=\"1.1.0\">... commons-lang3"
          },
          "statusEndpoint": "https://mirrors.tencent.com/source.js (item: maven, status: Success)",
          "inventoryEndpoint": "https://mirrors.tencent.com/source.js",
          "limitations": "同时提供 mirrors.tencent.com/maven/ 与 mirrors.cloud.tencent.com/nexus/repository/maven-public/，前者响应延迟更低。"
        },
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.tencent.com/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.tencent.com/source.js",
          "verification": {
            "method": "HEAD https://mirrors.tencent.com/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "https://mirrors.tencent.com/source.js (item: debian, status: Success)",
          "inventoryEndpoint": "https://mirrors.tencent.com/source.js",
          "limitations": "none"
        },
        {
          "ecosystem": "alpine",
          "repositoryUrl": "https://mirrors.tencent.com/alpine/",
          "versions": ["v3.18", "v3.19", "v3.20", "v3.21", "edge"],
          "sourceUrl": "https://mirrors.tencent.com/source.js",
          "verification": {
            "method": "HEAD https://mirrors.tencent.com/alpine/v3.20/main/x86_64/APKINDEX.tar.gz",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "APKINDEX size 473603 bytes"
          },
          "statusEndpoint": "https://mirrors.tencent.com/source.js (item: alpine, status: Success)",
          "inventoryEndpoint": "https://mirrors.tencent.com/source.js",
          "limitations": "none"
        },
        {
          "ecosystem": "cran",
          "repositoryUrl": "https://mirrors.tencent.com/CRAN/",
          "versions": [],
          "sourceUrl": "https://mirrors.tencent.com/source.js",
          "verification": {
            "method": "HEAD https://mirrors.tencent.com/CRAN/src/contrib/PACKAGES",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "PACKAGES size 7277407 bytes"
          },
          "statusEndpoint": "https://mirrors.tencent.com/source.js (item: CRAN, status: Success)",
          "inventoryEndpoint": "https://mirrors.tencent.com/source.js",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "huaweicloud",
      "name": "华为开源镜像站",
      "operator": "华为云计算技术有限公司 (Huawei Cloud)",
      "homepageUrl": "https://mirrors.huaweicloud.com/",
      "aliases": [
        "huawei",
        "hwcloud",
        "huaweicloud",
        "华为源",
        "华为镜像站",
        "repo.huaweicloud.com"
      ],
      "evidence": [
        "https://mirrors.huaweicloud.com/mirrorDetail/5be541620a22eb28114f05ba",
        "https://repo.huaweicloud.com/repository/goproxy/",
        "https://repo.huaweicloud.com/repository/maven/"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "go",
          "repositoryUrl": "https://repo.huaweicloud.com/repository/goproxy/",
          "versions": [],
          "sourceUrl": "https://mirrors.huaweicloud.com/",
          "verification": {
            "method": "GET https://repo.huaweicloud.com/repository/goproxy/golang.org/x/text/@v/v0.14.0.info",
            "timestamp": "2026-09-28T18:40:41+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain;charset=UTF-8",
            "cors": "unknown",
            "sampleResponse": "{\"Version\":\"v0.14.0\",\"Time\":\"2023-10-11T21:58:48Z\"}"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "仓库根路径 /repository/goproxy/ 返回 403 Forbidden，禁止目录遍历；包元数据和源码包正常提供服务。"
        },
        {
          "ecosystem": "maven",
          "repositoryUrl": "https://repo.huaweicloud.com/repository/maven/",
          "versions": [],
          "sourceUrl": "https://mirrors.huaweicloud.com/",
          "verification": {
            "method": "GET https://repo.huaweicloud.com/repository/maven/org/apache/commons/commons-lang3/maven-metadata.xml",
            "timestamp": "2026-09-28T18:41:15+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream;charset=UTF-8",
            "cors": "unknown",
            "sampleResponse": "<metadata modelVersion=\"1.1.0\">... commons-lang3"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "根路径 /repository/maven/ 返回 403 Forbidden，需使用具体 artifact 路径。"
        },
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://repo.huaweicloud.com/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.huaweicloud.com/",
          "verification": {
            "method": "HEAD https://repo.huaweicloud.com/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        },
        {
          "ecosystem": "alpine",
          "repositoryUrl": "https://repo.huaweicloud.com/alpine/",
          "versions": ["v3.18", "v3.19", "v3.20", "v3.21", "edge"],
          "sourceUrl": "https://mirrors.huaweicloud.com/",
          "verification": {
            "method": "HEAD https://repo.huaweicloud.com/alpine/v3.20/main/x86_64/APKINDEX.tar.gz",
            "timestamp": "2026-09-28T18:42:14+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "APKINDEX size 473603 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "goproxy-cn",
      "name": "Goproxy 中国 (goproxy.cn)",
      "operator": "上海七牛信息技术有限公司 (Qiniu Cloud) / 盛傲飞",
      "homepageUrl": "https://goproxy.cn/",
      "aliases": ["goproxy.cn", "七牛go", "qiniu go proxy"],
      "evidence": ["https://goproxy.cn/", "https://github.com/goproxy/goproxy.cn"],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "go",
          "repositoryUrl": "https://goproxy.cn",
          "versions": [],
          "sourceUrl": "https://goproxy.cn/",
          "verification": {
            "method": "GET https://goproxy.cn/golang.org/x/text/@v/v0.14.0.info",
            "timestamp": "2026-09-28T18:40:41+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain; charset=utf-8",
            "cors": "unknown",
            "sampleResponse": "{\"Version\":\"v0.14.0\",\"Time\":\"2023-10-11T21:58:48Z\"}"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "专注于 Go module proxy 代理服务，中国大陆开发者首选之一。"
        }
      ]
    },
    {
      "id": "goproxy-io",
      "name": "Goproxy.io 社区服务",
      "operator": "Goproxy.io 开放社区",
      "homepageUrl": "https://goproxy.io/",
      "aliases": ["goproxy.io", "goproxy global"],
      "evidence": ["https://goproxy.io/", "https://github.com/goproxyio/goproxy"],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "go",
          "repositoryUrl": "https://goproxy.io",
          "versions": [],
          "sourceUrl": "https://goproxy.io/",
          "verification": {
            "method": "GET https://goproxy.io/golang.org/x/text/@v/v0.14.0.info",
            "timestamp": "2026-09-28T18:40:41+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain; charset=UTF-8",
            "cors": "*",
            "sampleResponse": "{\"Version\":\"v0.14.0\",\"Time\":\"2023-10-11T21:58:48Z\"}"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "全球与国内双网络路由，支持跨域 CORS 头 (*)。"
        }
      ]
    },
    {
      "id": "rsproxy-cn",
      "name": "RsProxy (字节跳动 Rust 镜像代理)",
      "operator": "北京字跳网络技术有限公司 / 字节跳动基础架构 Dev Infra",
      "homepageUrl": "https://rsproxy.cn/",
      "aliases": ["rsproxy", "rsproxy.cn", "bytedance rust", "字节rust镜像"],
      "evidence": [
        "https://rsproxy.cn/",
        "https://bytedance.feishu.cn/docs/doccn8vZuDB541t8zTJyTUbZZxc"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "https://rsproxy.cn/index/config.json",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://rsproxy.cn/index/",
          "versions": [],
          "sourceUrl": "https://rsproxy.cn/",
          "verification": {
            "method": "GET https://rsproxy.cn/index/config.json & GET crate dl",
            "timestamp": "2026-09-28T18:43:18+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "redirects to https://lf9-static.rsproxy.cn/obj/rsproxy/crates/rand/0.8.5.crate 200 OK 87113 B"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "https://rsproxy.cn/index/config.json",
          "limitations": "每分钟同步一次；支持 sparse 协议、git 协议、rustup 工具链与 cargo search/publish 代理。"
        }
      ]
    },
    {
      "id": "golang-official",
      "name": "Go 官方 Module 镜像",
      "operator": "Google LLC / Go Team",
      "homepageUrl": "https://proxy.golang.org/",
      "aliases": ["golang official", "proxy.golang.org", "go官方源"],
      "evidence": ["https://proxy.golang.org/", "https://go.dev/ref/mod#module-proxy"],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "go",
          "repositoryUrl": "https://proxy.golang.org",
          "versions": [],
          "sourceUrl": "https://go.dev/ref/mod#module-proxy",
          "verification": {
            "method": "GET https://proxy.golang.org/golang.org/x/text/@v/v0.14.0.info",
            "timestamp": "2026-09-28T18:40:41+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain; charset=UTF-8",
            "cors": "*",
            "sampleResponse": "{\"Version\":\"v0.14.0\",\"Time\":\"2023-10-11T21:58:48Z\",\"Origin\":...}"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "全球上游基准源；中国大陆网络环境下直接访问受阻或不稳定，需作为 fallback 或海外用户基准。"
        }
      ]
    },
    {
      "id": "maven-central-official",
      "name": "Maven Central 官方仓库",
      "operator": "Sonatype / Apache Software Foundation",
      "homepageUrl": "https://central.sonatype.com/",
      "aliases": ["maven central", "repo1.maven.org", "repo.maven.apache.org", "maven官方源"],
      "evidence": ["https://repo1.maven.org/maven2/", "https://central.sonatype.com/"],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "maven",
          "repositoryUrl": "https://repo1.maven.org/maven2/",
          "versions": [],
          "sourceUrl": "https://repo1.maven.org/maven2/",
          "verification": {
            "method": "GET https://repo1.maven.org/maven2/org/apache/commons/commons-lang3/maven-metadata.xml",
            "timestamp": "2026-09-28T18:41:15+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/xml",
            "cors": "unknown",
            "sampleResponse": "<metadata>... commons-lang3"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "全球 Maven 官方主干；国内拉取延迟高，仅适合全球节点或作为上游对比。"
        }
      ]
    },
    {
      "id": "crates-official",
      "name": "Cargo Crates.io 官方源",
      "operator": "Rust Foundation / Crates.io Team",
      "homepageUrl": "https://crates.io/",
      "aliases": ["crates.io", "static.crates.io", "index.crates.io", "cargo官方源"],
      "evidence": [
        "https://index.crates.io/config.json",
        "https://static.crates.io/crates/rand/rand-0.8.5.crate"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "https://index.crates.io/config.json",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://index.crates.io/",
          "versions": [],
          "sourceUrl": "https://doc.rust-lang.org/cargo/reference/registries.html",
          "verification": {
            "method": "GET https://index.crates.io/config.json & HEAD crate dl",
            "timestamp": "2026-09-28T18:41:40+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "*",
            "sampleResponse": "config.json dl=https://static.crates.io/crates; sample rand dl 200 OK"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "https://index.crates.io/config.json",
          "limitations": "Rust 官方 sparse 协议基准；全球 Fastly CDN 加速，支持完整 CORS。"
        }
      ]
    },
    {
      "id": "volcengine",
      "name": "火山引擎开源镜像站",
      "operator": "北京火山引擎科技有限公司 (Volcengine / ByteDance)",
      "homepageUrl": "https://mirrors.volces.com/",
      "aliases": ["volces", "volcengine", "火山引擎", "字节跳动镜像"],
      "evidence": [
        "https://mirrors.volces.com/debian/dists/bookworm/InRelease",
        "https://mirrors.volces.com/alpine/v3.20/main/x86_64/APKINDEX.tar.gz"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.volces.com/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.volces.com/",
          "verification": {
            "method": "HEAD https://mirrors.volces.com/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:43:39+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "火山引擎官方云镜像，国内访问速度极快。"
        },
        {
          "ecosystem": "alpine",
          "repositoryUrl": "https://mirrors.volces.com/alpine/",
          "versions": ["v3.18", "v3.19", "v3.20", "v3.21", "edge"],
          "sourceUrl": "https://mirrors.volces.com/",
          "verification": {
            "method": "HEAD https://mirrors.volces.com/alpine/v3.20/main/x86_64/APKINDEX.tar.gz",
            "timestamp": "2026-09-28T18:43:39+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "APKINDEX size 473603 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "nju",
      "name": "南京大学开源软件镜像站",
      "operator": "南京大学 e-Science 中心 / 网络信息中心",
      "homepageUrl": "https://mirrors.nju.edu.cn/",
      "aliases": ["nju", "南大源", "南京大学"],
      "evidence": [
        "https://mirrors.nju.edu.cn/crates.io-index/config.json",
        "https://mirror.nju.edu.cn/crates.io/crates/rand/rand-0.8.5.crate",
        "https://mirrors.nju.edu.cn/debian/dists/bookworm/InRelease"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "https://mirrors.nju.edu.cn/crates.io-index/config.json",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "cargo",
          "repositoryUrl": "sparse+https://mirrors.nju.edu.cn/crates.io-index/",
          "versions": [],
          "sourceUrl": "https://mirrors.nju.edu.cn/crates.io-index/config.json",
          "verification": {
            "method": "GET config.json & HEAD crate dl",
            "timestamp": "2026-09-28T18:44:13+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "config.json dl=https://mirror.nju.edu.cn/crates.io/crates/{crate}/{crate}-{version}.crate -> HTTP 200 (87113 B)"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "https://mirrors.nju.edu.cn/crates.io-index/config.json",
          "limitations": "真实拉取已验证；但自动化客户端如未带标准 User-Agent 或遭遇校园网安全过滤时可能触发 302 临时重定向。"
        },
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.nju.edu.cn/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.nju.edu.cn/",
          "verification": {
            "method": "HEAD https://mirrors.nju.edu.cn/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:43:56+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "application/octet-stream",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "kernel-org",
      "name": "Kernel.org 镜像网络",
      "operator": "Linux Kernel Organization, Inc.",
      "homepageUrl": "https://mirrors.kernel.org/",
      "aliases": ["kernel.org", "kernel mirrors", "linux kernel org"],
      "evidence": [
        "https://mirrors.kernel.org/debian/dists/bookworm/InRelease",
        "https://mirrors.kernel.org/archlinux/core/os/x86_64/core.db"
      ],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.kernel.org/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.kernel.org/",
          "verification": {
            "method": "HEAD https://mirrors.kernel.org/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:44:59+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain; charset=utf-8",
            "cors": "unknown",
            "sampleResponse": "InRelease size 151075 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "全球骨干开源镜像网络，北美与欧洲节点极佳，国内直连视国际出口波动。"
        },
        {
          "ecosystem": "archlinux",
          "repositoryUrl": "https://mirrors.kernel.org/archlinux/",
          "versions": ["x86_64"],
          "sourceUrl": "https://mirrors.kernel.org/",
          "verification": {
            "method": "HEAD https://mirrors.kernel.org/archlinux/core/os/x86_64/core.db",
            "timestamp": "2026-09-28T18:44:59+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "actual_pull_verified",
            "httpStatus": 200,
            "contentType": "text/plain; charset=utf-8",
            "cors": "unknown",
            "sampleResponse": "core.db size 129884 bytes"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "none"
        }
      ]
    },
    {
      "id": "cernet-federation",
      "name": "CERNET 镜像联盟 302 调度入口",
      "operator": "中国教育和科研计算机网 (CERNET)",
      "homepageUrl": "https://mirrors.cernet.edu.cn/",
      "aliases": ["cernet", "cernet mirror", "教育网镜像联盟"],
      "evidence": [
        "https://mirrors.cernet.edu.cn/api/scoring",
        "https://mirrors.cernet.edu.cn/debian/dists/bookworm/InRelease"
      ],
      "statusEndpoint": "https://mirrors.cernet.edu.cn/api/scoring",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "debian",
          "repositoryUrl": "https://mirrors.cernet.edu.cn/debian/",
          "versions": ["bookworm", "trixie", "bullseye"],
          "sourceUrl": "https://mirrors.cernet.edu.cn/",
          "verification": {
            "method": "HEAD https://mirrors.cernet.edu.cn/debian/dists/bookworm/InRelease",
            "timestamp": "2026-09-28T18:45:00+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "address_verified",
            "httpStatus": 302,
            "contentType": "text/html; charset=utf-8",
            "cors": "unknown",
            "sampleResponse": "302 Found -> Location: https://mirrors.hit.edu.cn/debian/dists/bookworm/InRelease"
          },
          "statusEndpoint": "https://mirrors.cernet.edu.cn/api/scoring",
          "inventoryEndpoint": "unknown",
          "limitations": "非独立实体镜像存储！实质为基于客户端出口 IP 的 302 调度网关，动态重定向到哈工大 (HIT)、北外 (BFSU)、清华 (TUNA) 等联盟成员高校。不应作为独立物理镜像录入。"
        }
      ]
    },
    {
      "id": "163-netease",
      "name": "网易开源镜像站",
      "operator": "网易公司 (NetEase, Inc.)",
      "homepageUrl": "https://mirrors.163.com/",
      "aliases": ["163", "netease", "网易源", "网易镜像"],
      "evidence": ["https://mirrors.163.com/"],
      "statusEndpoint": "unknown",
      "inventoryEndpoint": "unknown",
      "checkedAt": "2026-09-28",
      "repositories": [
        {
          "ecosystem": "maven",
          "repositoryUrl": "https://mirrors.163.com/maven/",
          "versions": [],
          "sourceUrl": "https://mirrors.163.com/",
          "verification": {
            "method": "GET https://mirrors.163.com/maven/org/apache/commons/commons-lang3/maven-metadata.xml",
            "timestamp": "2026-09-28T18:41:15+08:00",
            "network_location": "Tokyo, Japan (AS14593)",
            "result": "unavailable_or_unconfirmed",
            "httpStatus": 0,
            "contentType": "unknown",
            "cors": "unknown",
            "sampleResponse": "Connection timed out (>10s)"
          },
          "statusEndpoint": "unknown",
          "inventoryEndpoint": "unknown",
          "limitations": "历史主流镜像，但现代构建依赖（Maven/npm等）已长期缺乏维护或网络超时不可用；建议排除。"
        }
      ]
    }
  ]
}
```

---

## 2. 逐站调查记录与端点映射深度分析

### 2.1 高校开源镜像站

#### 1. 中国科学技术大学 (USTC, `mirrors.ustc.edu.cn`)

- **实际请求端点**：
  - `GET https://mirrors.ustc.edu.cn/static/json/index.json` (HTTP 200, 78 KB, `schemaVersion: 1`)
  - `GET https://mirrors.ustc.edu.cn/crates.io-index/config.json` (HTTP 200, 102 B, `application/json`)
  - `HEAD https://mirrors.ustc.edu.cn/crates.io/api/v1/crates/rand/0.8.5/download` (HTTP 200, 87,113 B)
  - `HEAD https://mirrors.ustc.edu.cn/debian/dists/bookworm/InRelease` (HTTP 200, 151,075 B)
- **关键响应字段与更新机制**：
  - `index.json` 为 USTC 自研生成的同步索引，包含 `generatedAt`（精确到秒，如 `2026-09-28 18:10:04`）、`repositories`（148 个仓，含 `updatedAt`、`helpUrl`）、`reverseProxies`（8 个反代仓）。
- **清单到真实下载地址的映射**：
  - Cargo Sparse 索引根：`sparse+https://mirrors.ustc.edu.cn/crates.io-index/`。
  - 其 `config.json` 声明：`"dl": "https://mirrors.ustc.edu.cn/crates.io/api/v1/crates"`。Cargo 根据规范将 `{crate}/{version}/download` 追加在 dl 路径后，直接命中科大的反向代理缓存，实测下载 200。
- **接口公开性与稳定性**：
  - `index.json` 为公开静态 JSON，无需认证，每 5~10 分钟自动更新一次，稳定性极高，可作为 MirrorN 服务端解析 USTC 仓库状态的官方标准源。
- **失败与歧义澄清**：
  - USTC 早期文档常见 `git://` 形式的 `crates.io-index.git`，但在现代 Rust (>=1.68) 下已原生推荐 `sparse+https`，免去拉取超 1.3GB git 历史记录的沉重开销。

#### 2. 清华大学 TUNA 镜像站 (`mirrors.tuna.tsinghua.edu.cn`)

- **实际请求端点**：
  - `GET https://mirrors.tuna.tsinghua.edu.cn/static/tunasync.json` (HTTP 200, 74 KB, 182 条作业)
  - `GET https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/config.json` (HTTP 200, 68 B)
  - `HEAD https://mirrors.tuna.tsinghua.edu.cn/debian/dists/bookworm/InRelease` (HTTP 200, 151,075 B)
  - `HEAD https://mirrors.tuna.tsinghua.edu.cn/archlinux/core/os/x86_64/core.db` (HTTP 200, 129,884 B)
- **关键响应字段与状态**：
  - `tunasync.json` 包含 `name`, `status`, `last_update_ts`, `upstream`, `size` 等机器可读字段。实测 `crates.io-index`（7.9G）、`crates.io-index.git`（1.3G）、`debian`（全量）、`alpine` 状态均为 `success`。
- **清单到真实下载地址的映射与陷阱**：
  - 清华在 `tunasync.json` 中公开维护 `crates.io-index`，但经读取其 `config.json` 发现：
    ```json
    { "dl": "https://static.crates.io/crates", "api": "https://crates.io" }
    ```
    **关键陷阱**：TUNA 的 sparse 模式仅在本地镜像 crates 索引元数据，`dl` 字段依然指向官方海外 `static.crates.io`。国内开发者若无外网代理，依赖下载依然会慢甚至中断。若要使用 TUNA 的全量 crates 必须配置其 git 镜像或走其他代理。
- **接口公开性与稳定性**：
  - `tunasync.json` 无认证、极稳定；但 TUNA 开启了反爬限制：向其 `robots.txt` 附加 query 参数（如 cache-bust `?t=...`）会触发 403 Forbidden，MirrorN 探针必须保持 `cacheBust: false`。此外站点明确声明不服务欧盟用户。

#### 3. 上海交通大学 SJTUG (`mirrors.sjtug.sjtu.edu.cn`)

- **实际请求端点**：
  - `GET https://mirrors.sjtug.sjtu.edu.cn/crates.io-index/config.json` (HTTP 200, 193 B)
  - `HEAD https://mirror.sjtu.edu.cn/crates.io/crates/rand/rand-0.8.5.crate` (HTTP 301 -> 200, 87,113 B)
  - `GET https://mirrors.sjtug.sjtu.edu.cn/maven-central/org/apache/commons/commons-lang3/maven-metadata.xml` (HTTP 302 -> 200)
- **架构映射与实际下载链路**：
  - **Cargo (思源节点)**：SJTU 的 `config.json` 指向 `https://mirror.sjtu.edu.cn/crates.io/crates/{crate}/{crate}-{version}.crate`。实际拉取时，Caddy 将请求 301 重定向到交大自建对象存储 `s3.jcloud.sjtu.edu.cn/...`，返回 200，并带有 `Access-Control-Allow-Origin: *`，是极少数支持浏览器端直接读取的 crate 二进制存储源！
  - **Maven (致远节点)**：文档宣称提供 `maven-central`，但实测其 Caddy 服务端并非持久化制品库，而是直接 302 跳转到官方 `https://repo.maven.apache.org/maven2/...`。若访问端在国内直连，依然面临官方源的延迟。
- **接口稳定性**：
  - 无统一的全局 `tunasync.json`，各仓库文档静态生成，适合按具体生态接入。

#### 4. 南京大学 (`mirrors.nju.edu.cn`)

- **实际请求端点**：
  - `GET https://mirrors.nju.edu.cn/crates.io-index/config.json` (HTTP 200, 180 B)
  - `HEAD https://mirror.nju.edu.cn/crates.io/crates/rand/rand-0.8.5.crate` (HTTP 200, 87,113 B)
  - `HEAD https://mirrors.nju.edu.cn/debian/dists/bookworm/InRelease` (HTTP 200, 151,075 B)
- **映射与歧义**：
  - 南大 Cargo 镜像完备，`mirror.nju.edu.cn` 真实拉取 200。
  - **排查注意点**：南大主站前端具有特定的重定向行为，若爬虫未携带标准 `User-Agent` 或在特定安全规则下会发生 302 循环跳转，但在携带常规浏览器/curl UA 后正常响应。

---

### 2.2 头部商业云与企业级镜像站

#### 1. 阿里云开发者镜像站 (`mirrors.aliyun.com` / `maven.aliyun.com`)

- **实际请求端点**：
  - `GET https://mirrors.aliyun.com/goproxy/golang.org/x/text/@v/v0.14.0.info` (HTTP 200, 73ms, `application/json`)
  - `GET https://maven.aliyun.com/repository/public/org/apache/commons/commons-lang3/maven-metadata.xml` (HTTP 200, 77ms, `application/xml`)
  - `GET https://mirrors.aliyun.com/crates.io-index/config.json` (HTTP 200, 92 B)
  - `HEAD https://mirrors.aliyun.com/crates/api/v1/crates/rand/0.8.5/download` (HTTP 200, 87,113 B)
- **关键发现与映射**：
  - **Go**：地址为 `https://mirrors.aliyun.com/goproxy/`。**注意：直接访问根路径返回 404**，但请求具体模块（如 `/@v/list`、`/@v/v0.14.0.info`）完全符合 Go Proxy 标准协议，且响应延迟低至 70ms 级。
  - **Maven**：官方推荐公共聚合组为 `https://maven.aliyun.com/repository/public/`（聚合 central, jcenter, public），实测元数据与 jar 包下载完备；独立 central 组为 `https://maven.aliyun.com/repository/central/`。根路径同样禁止浏览，需使用具体制品路径。
  - **Cargo**：阿里已支持 sparse 索引 `sparse+https://mirrors.aliyun.com/crates.io-index/`，其 `config.json` 的 `dl` 指向 `https://mirrors.aliyun.com/crates/api/v1/crates`，实测拉取 200 OK。
- **状态接口**：无机器可读的全局状态 JSON，需通过端点探活。

#### 2. 腾讯云软件源 (`mirrors.tencent.com`)

- **实际请求端点**：
  - `GET https://mirrors.tencent.com/source.js` (HTTP 200, 16.5 KB)
  - `GET https://mirrors.tencent.com/go/golang.org/x/text/@v/v0.14.0.info` (HTTP 200, 376ms)
  - `GET https://mirrors.tencent.com/maven/org/apache/commons/commons-lang3/maven-metadata.xml` (HTTP 200, 185ms)
  - `HEAD https://mirrors.tencent.com/crates.io-index/config.json` (HTTP 404)
- **重大突破：腾讯云原生状态与清单接口**：
  - 经分析首页静态脚本，发现腾讯云维护了一份实时、无需认证的公开状态文件：`https://mirrors.tencent.com/source.js`。
  - 脚本执行赋值 `document.mirrorsContent = { "return_data": { "data": { "items_count": 48, "items": [...] } } }`。
  - 每条记录包含 `source_name`、`sync_status`（如 `Success`）、`updated_time`（如 `2026-09-28 15:55:01`）、`sync_method`、`description`。
  - 证实腾讯云官方明确提供 **`go`**、**`maven`**、**`npm`**、**`composer`**、**`CRAN`**、**`debian`**、**`ubuntu`**、**`alpine`** 等 48 个仓库。
- **映射验证**：
  - Go 代理地址：`https://mirrors.tencent.com/go/`（实际拉取成功）。
  - Maven 地址：`https://mirrors.tencent.com/maven/` 与 `https://mirrors.cloud.tencent.com/nexus/repository/maven-public/`（均实测 200，前者延迟更低）。
  - Cargo：腾讯云目前**未提供** crates.io 镜像，请求返回 404。

#### 3. 华为开源镜像站 (`repo.huaweicloud.com` / `mirrors.huaweicloud.com`)

- **实际请求端点**：
  - `GET https://repo.huaweicloud.com/repository/goproxy/golang.org/x/text/@v/v0.14.0.info` (HTTP 200, 80ms)
  - `GET https://repo.huaweicloud.com/repository/maven/org/apache/commons/commons-lang3/maven-metadata.xml` (HTTP 200, 100ms)
  - `GET https://repo.huaweicloud.com/repository/npm/-/ping` (HTTP 200)
  - `HEAD https://repo.huaweicloud.com/repository/pypi/simple/` (HTTP 429 Rate Limit)
  - `HEAD https://repo.huaweicloud.com/repository/crates/config.json` (HTTP 404)
- **关键映射与限制**：
  - Go 代理根：`https://repo.huaweicloud.com/repository/goproxy/`（根路径返回 403 禁止遍历，但模块请求 200 正常）。
  - Maven 根：`https://repo.huaweicloud.com/repository/maven/`（根路径返回 403，artifact 元数据 200 正常）。
  - **重要限制**：华为云针对海外出口 IP 设置了较为严格的安全风控，例如 `pypi/simple/` 在海外并发或测试时会返回 HTTP 429。境内网络环境下通常正常。

#### 4. 火山引擎 / 字节跳动 (`mirrors.volces.com` & `rsproxy.cn`)

- **实际请求端点**：
  - `HEAD https://mirrors.volces.com/debian/dists/bookworm/InRelease` (HTTP 200, 151,075 B)
  - `HEAD https://mirrors.volces.com/alpine/v3.20/main/x86_64/APKINDEX.tar.gz` (HTTP 200, 473,603 B)
  - `GET https://rsproxy.cn/index/config.json` (HTTP 200, 73ms)
  - `HEAD https://rsproxy.cn/api/v1/crates/rand/0.8.5/download` (HTTP 200 -> 302 -> 200, 87,113 B)
- **发现与架构分工**：
  - 字节跳动采用分立架构：`mirrors.volces.com` 主要提供 Linux 发行版（Debian, Ubuntu, Alpine, Rocky, CentOS）；而针对 Rust 开发者专门由基础架构 Dev Infra 团队以公益形式运营独立域名 **`rsproxy.cn`**。
  - `rsproxy.cn` 是国内极少数同时支持 **sparse 协议**、**git 协议**、**rustup 工具链**与 **cargo publish/search 代理**的专业 Rust 镜像。

---

### 2.3 专有生态高速镜像与公共代理服务

| 站点标识     | 针对生态 | 官方主页              | 实际仓库根地址                     | 实测状态 / 延迟 | CORS | 关键机制与限制                                                                           |
| :----------- | :------- | :-------------------- | :--------------------------------- | :-------------- | :--- | :--------------------------------------------------------------------------------------- |
| `goproxy-cn` | Go       | `https://goproxy.cn/` | `https://goproxy.cn`               | 200 / 250ms     | 无   | 由七牛云赞助运营，国内最广泛使用的 Go Module 代理；完全遵循 Go 代理协议。                |
| `goproxy-io` | Go       | `https://goproxy.io/` | `https://goproxy.io`               | 200 / 1051ms    | `*`  | 社区项目，全球 CDN 分发，支持直接在浏览器中通过 fetch/CORS 探测。                        |
| `rsproxy-cn` | Cargo    | `https://rsproxy.cn/` | `sparse+https://rsproxy.cn/index/` | 200 / 73ms      | 无   | 字节跳动运营，分钟级同步，实测通过 TOS CDN (`lf9-static.rsproxy.cn`) 高速分发 crate 包。 |

---

### 2.4 官方全球基准源

| 官方源标识               | 生态     | 官方标准地址                      | 实测状态 / 响应头                                   | 适用场景与局限                                                            |
| :----------------------- | :------- | :-------------------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------ |
| `golang-official`        | Go       | `https://proxy.golang.org`        | 200, `Access-Control-Allow-Origin: *`, `text/plain` | 全球官方基准。在中国大陆直连经常遭遇连接超时或 DNS 污染，海外用户首选。   |
| `maven-central-official` | Maven    | `https://repo1.maven.org/maven2/` | 200, `application/xml`                              | 全球 Java 生态根。国内单线程拉取大 jar 包较慢，适合海外 CI 或对比源。     |
| `crates-official`        | Cargo    | `sparse+https://index.crates.io/` | 200, `Access-Control-Allow-Origin: *`               | Rust 官方 sparse 协议源。由 Fastly CDN 全球加速，境外开发与 CI 极其敏捷。 |
| `kernel-org`             | Linux OS | `https://mirrors.kernel.org/`     | 200, `text/plain; charset=utf-8`                    | Linux 官方基金会镜像，北美、欧洲骨干节点速度极佳，涵盖 Debian, Arch 等。  |

---

### 2.5 镜像联盟、跳转入口与失效站点甄别

#### 1. CERNET 镜像联盟 (`mirrors.cernet.edu.cn`) —— **【应排除独立收录】**

- **实测 URL**：`HEAD https://mirrors.cernet.edu.cn/debian/dists/bookworm/InRelease`
- **实际返回**：`HTTP/1.1 302 Found` -> `Location: https://mirrors.hit.edu.cn/debian/dists/bookworm/InRelease`
- **结论**：CERNET 并非独立存储实体，而是基于 GeoDNS/BGP 的 302 路由网关。它根据访客出口 IP 动态跳向哈工大 (HIT)、北外 (BFSU)、大连理工 (DUT) 等成员站点。若收录它会导致用户测速和下载出现非预期的二次跳转，甚至跳到带宽受限的下游小站。

#### 2. 网易开源镜像站 (`mirrors.163.com`) —— **【应排除 / 标记失修】**

- **实测 URL**：`https://mirrors.163.com/maven/...`
- **实际返回**：连续多次超时（Connect timed out > 10s）。
- **结论**：163 曾是国内早期知名镜像，但其现代开发语言仓库（如 Maven、npm 等）维护停滞、网络可达性极差，不应在 MirrorN 中推荐或收录。

#### 3. 别名与重定向域名去重

- `mirrors.cloud.tencent.com` -> 统一归并在 `tencent`（腾讯云）。
- `mirrors4.ustc.edu.cn` / `mirrors6.ustc.edu.cn` -> 统一归并为 `ustc` 双栈主域名。
- `ipv4.mirrors.tuna.tsinghua.edu.cn` -> 统一归并为 `tsinghua`。

---

## 3. 去重后的优先级决策清单

### 3.1 第一梯队：可立即接入 (Ready to Integrate)

> **准入依据**：有确切运营主体、官方域名、文档齐备、真实拉取测试（小文件与元数据）100% 成功、仓库服务稳定且具备高并发承受力。

| 站点 ID                                                       | 建议扩充生态   | 仓库标准地址 (repositoryUrl)                                | 推荐理由与核心证据                                                                      |
| :------------------------------------------------------------ | :------------- | :---------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **`aliyun`**                                                  | **Go**         | `https://mirrors.aliyun.com/goproxy/`                       | 阿里官方 Go 代理，实测元数据拉取 73ms，稳定性极高。                                     |
| **`aliyun`**                                                  | **Maven**      | `https://maven.aliyun.com/repository/public/`               | 国内事实上的 Maven 中心加速标准，聚合 central、jcenter、public。                        |
| **`aliyun`**                                                  | **Cargo**      | `sparse+https://mirrors.aliyun.com/crates.io-index/`        | 阿里 sparse crates 镜像，实测 `config.json` 与 crate 二进制下载均为 200。               |
| **`tencent`**                                                 | **Go**         | `https://mirrors.tencent.com/go/`                           | 腾讯云官方 Go 代理，在 `/source.js` 中公布并处于 Success 状态，实测 200。               |
| **`tencent`**                                                 | **Maven**      | `https://mirrors.tencent.com/maven/`                        | 腾讯云官方 Maven 仓库，相比 nexus 反代端点更轻量直接，实测 200。                        |
| **`huaweicloud`**                                             | **Go**         | `https://repo.huaweicloud.com/repository/goproxy/`          | 华为云官方 Go 代理，拉取测试 80ms，支持高吞吐。                                         |
| **`huaweicloud`**                                             | **Maven**      | `https://repo.huaweicloud.com/repository/maven/`            | 华为云官方 Maven 镜像，实测 metadata 拉取成功。                                         |
| **`goproxy-cn`**                                              | **Go**         | `https://goproxy.cn`                                        | 七牛云运营，国内开发者首选，支持全量 Go 模块代理。                                      |
| **`goproxy-io`**                                              | **Go**         | `https://goproxy.io`                                        | 全球双线社区代理，唯一实测带 `CORS: *` 响应头的 Go 代理，方便前端测速。                 |
| **`rsproxy-cn`**                                              | **Cargo**      | `sparse+https://rsproxy.cn/index/`                          | 字节跳动官方维护，分钟级同步，支持 sparse、git、rustup 与 publish。                     |
| **`ustc`**                                                    | **Cargo**      | `sparse+https://mirrors.ustc.edu.cn/crates.io-index/`       | 中科大自研反代架构，完整提供 sparse 索引与本地反代二进制下载，状态公开在 `index.json`。 |
| **`sjtug`**                                                   | **Cargo**      | `sparse+https://mirrors.sjtug.sjtu.edu.cn/crates.io-index/` | 交大思源镜像，crate 二进制直接上交大 S3，带 `CORS: *`，拉取极顺畅。                     |
| **`ustc` / `tsinghua` / `aliyun` / `tencent`**                | **Debian**     | `https://mirrors.[...].edu.cn/debian/`                      | 顶级 Linux 基础发行版镜像，InRelease 签名均在数小时内更新。                             |
| **`ustc` / `tsinghua` / `aliyun`**                            | **Arch Linux** | `https://mirrors.[...].edu.cn/archlinux/`                   | Arch 官方 Tier 1 / 重点同步源，`core.db` 实测 200。                                     |
| **`ustc` / `tsinghua` / `aliyun` / `tencent` / `volcengine`** | **Alpine**     | `https://mirrors.[...].com/alpine/`                         | 容器基础镜像核心生态，`APKINDEX` 实测拉取迅速。                                         |
| **`golang-official`**                                         | **Go**         | `https://proxy.golang.org`                                  | 全球基准源，Google 官方，带 `CORS: *`。                                                 |
| **`maven-central-official`**                                  | **Maven**      | `https://repo1.maven.org/maven2/`                           | 全球基准源，Sonatype 官方。                                                             |
| **`crates-official`**                                         | **Cargo**      | `sparse+https://index.crates.io/`                           | 全球基准源，Rust 基金会官方，带 `CORS: *`。                                             |

---

### 3.2 第二梯队：需补验证 / 条件可用 (Conditionally Viable)

> **判定依据**：站点确实维护了该仓库，但存在局限（如下载回源海外、仅作 302 跳转、风控拦截或缺乏完备文档）。

| 站点 ID                    | 生态                   | 现状与局限说明                                                                                                                                        | 建议处理方式                                                              |
| :------------------------- | :--------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **`tsinghua`**             | **Cargo**              | 其 `crates.io-index` 在 `tunasync.json` 中同步正常，但 `config.json` 中的 `dl` 直指 `https://static.crates.io/crates`，**不具备国内二进制加速能力**。 | 在 MirrorN 中可收录但需明确提示“仅索引加速，下载走官方源”，避免误导用户。 |
| **`sjtug`**                | **Maven**              | 文档列出 `maven-central`，但 Caddy 服务端实质为 302 临时重定向回官方 Central，不缓存本地包。                                                          | 需补测境内高频拉取是否会遭遇 upstream 速率限制；暂不作为首推。            |
| **`huaweicloud`**          | **PyPI**               | 华为云对境外探测 IP 频繁返回 429 Too Many Requests，风控规则严格。                                                                                    | 需从大陆三网节点进行长周期探针验证后再确定可用度。                        |
| **`nju`**                  | **Cargo**              | 南大 sparse 与 crate 下载均验证可用，但某些网络请求会遭遇主站 302 循环跳转。                                                                          | 建议补充针对不同客户端 UA 的兼容器测试。                                  |
| **`pku` / `zju` / `hust`** | **Debian/Ubuntu/Arch** | 发行版镜像非常完备，但**不提供** Go、Maven、Cargo 等开发语言类缓存代理。                                                                              | 可作为操作系统类生态补充，不参与语言包扩展。                              |

---

### 3.3 排除项与废弃站点 (Excluded / Deprecated)

| 排除目标                             | 排除原因与证据                                                                                                                                     |
| :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`mirrors.cernet.edu.cn` (CERNET)** | **镜像联盟调度入口，非独立存储**。实测访问 `debian/.../InRelease` 直接 302 重定向到 `mirrors.hit.edu.cn`（哈工大）。收录会导致测速与真实下载割裂。 |
| **`mirrorz.org` (MirrorZ)**          | **前端聚合导航站，不托管软件包**。部署于 GitHub Pages，无物理包存储与反代能力。                                                                    |
| **`mirrors.163.com/maven/` (网易)**  | **长期失修不可用**。请求连接持续超时（>10s），缺乏日常维护。                                                                                       |
| **`mirrors.cloud.tencent.com`**      | **别名域名**。与 `mirrors.tencent.com` 共享服务，去重后统一采用 `mirrors.tencent.com`。                                                            |
| **各大内网 / 需认证源**              | 各大企业内网 Nexus、私有制品库因需鉴权认证，违背公共镜像公开可读标准，一律不予录入。                                                               |

---

## 4. 调研覆盖边界与未覆盖说明

为了保持工程严谨性，本次调研明确说明边界：

1. **已覆盖范围**：
   - **地区**：中国大陆主流骨干节点（教育网顶尖高校、主流公有云商）、全球官方核心基准源节点（Google、Rust Foundation、Apache Maven、Kernel.org）。
   - **生态重点**：完整覆盖现有 5 个生态外，重点深入攻克了 **Go (GOPROXY)**、**Maven**、**Cargo (Rust sparse)**，并横向核对了 **Debian**、**Arch Linux**、**Alpine Linux**、**CRAN**、**Anaconda**。
2. **尚未覆盖的地区与节点类型**：
   - **欧洲、北美非官方社区镜像站**：未穷尽欧美地区长尾大学及地方 ISP 镜像站（如 XMission, Aarnet, Switch）。
   - **拉美、非洲、东南亚地区镜像站**：未纳入评估。
   - **部分地方高校镜像站**：如兰大 (LZU)、华科 (HUST)、吉大 (JLU) 等，因其网络多针对校内优化或缺乏专有语言包代理，未列入本次第一批扩展建议中。
3. **尚未覆盖的语言与软件生态**：
   - 本次重点集中在 Go、Maven、Cargo、Linux 发行版。暂未深入调研 **NuGet (.NET)**、**RubyGems (Ruby)**、**CocoaPods (iOS)**、**Hackage (Haskell)**、**CPAN (Perl)** 等长尾生态。

---

> **给 MirrorN 维护者的后续实施建议**：
>
> 1. 可优先将第一梯队中 `aliyun`、`tencent`、`huawei`、`goproxy-cn` 的 Go 代理，`aliyun`、`tencent`、`huawei` 的 Maven 仓库，以及 `ustc`、`sjtug`、`aliyun`、`rsproxy-cn` 的 Cargo 仓库录入 `data/ecosystems/go.json`、`maven.json`、`cargo.json`。
> 2. USTC 的 `https://mirrors.ustc.edu.cn/static/json/index.json` 与腾讯云的 `https://mirrors.tencent.com/source.js` 可作为 MirrorN 后端 `packages/shared/src/sync` 继 TUNA `tunasync.json` 之后支持的新上游状态同步格式！
