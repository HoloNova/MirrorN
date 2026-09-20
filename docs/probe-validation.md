# 探针核实记录

> 核对日期：2026-09-19。核实环境：本机（机房网络）、Node v24.21.0、Google Chrome 153.0.8010.47。
> 两条证据都需要：curl 只能证明服务端行为，浏览器证据才说明跨域请求在页面里能不能完成。

## 口径

- 探针只访问下表中**审核过的小资源**，cors 模式拿到响应头就取消正文，不下载大文件。
- 界面统一称“响应耗时（估算）”。`fetch` 的总耗时受 DNS、TLS、连接复用、缓存和浏览器调度影响，
  不等于精确 TCP RTT、TTFB，也不是下载速度。
- no-cors（opaque）结果只能说明“请求完成”，状态码和内容都读不到，界面标注“响应完成，内容未验证”。
- 下表的毫秒数只是“这台机器 + 这个浏览器”的单次样本，**不是**任何用户侧的速度排名。

## 已收录的探针

| 镜像          | 探针 ID            | 探针地址                                          | 大小  | 模式    | curl 结果                                          | 浏览器结果        |
| ------------- | ------------------ | ------------------------------------------------- | ----- | ------- | -------------------------------------------------- | ----------------- |
| pypi-official | `pypi-robots`      | <https://pypi.org/robots.txt>                     | 325 B | no-cors | 200，无 `Access-Control-Allow-Origin`              | opaque，28 ms     |
| npm-official  | `npmjs-ping`       | <https://registry.npmjs.org/-/ping>               | 2 B   | no-cors | 200，无 `Access-Control-Allow-Origin`              | opaque，203 ms    |
| tsinghua      | `tuna-robots`      | <https://mirrors.tuna.tsinghua.edu.cn/robots.txt> | 4 KB  | no-cors | 200，无 `Access-Control-Allow-Origin`              | opaque，659 ms    |
| aliyun        | `aliyun-robots`    | <https://mirrors.aliyun.com/robots.txt>           | 295 B | no-cors | 200，无 `Access-Control-Allow-Origin`              | opaque，319 ms    |
| npmmirror     | `npmmirror-ping`   | <https://registry.npmmirror.com/-/ping>           | 39 B  | cors    | 200，`Access-Control-Allow-Origin` 回显请求 Origin | 可读 200，494 ms  |
| tencent       | `tencent-npm-ping` | <https://mirrors.tencent.com/npm/-/ping>          | 3 B   | cors    | 200，`Access-Control-Allow-Origin: *`              | 可读 200，1036 ms |

浏览器证据的产生方式：用系统 Chrome 打开 `http://127.0.0.1:8123/` 上的本地页面，在页面里按上表的
url/mode 执行 `fetch(url, { mode, method: 'get', cache: 'no-store', redirect: 'follow' })`，
并用 1500 ms 的 `AbortController` 熔断。

## 三个改变原设想的实测结论

1. **npm registry 的 `robots.txt` 不是静态文件。** `https://registry.npmjs.org/robots.txt` 与
   `https://registry.npmmirror.com/robots.txt` 返回的是名为 `robots.txt` 的**包元数据**（7.4 KB / 7.7 KB JSON）。
   探针改用 npm 的 `/-/ping` 端点（`npm ping` 用的就是这个），三个 registry 分别返回 2 B / 39 B / 3 B。
2. **npm 官方 registry 的 `/-/ping` 没有 CORS 头。** 因此它只能走 no-cors；npmmirror 会回显 Origin、
   腾讯云返回 `*`，这两家可以走 cors 并读到真实状态码。所以跨域方式写进数据（`probe.mode`），
   不在运行时“先试 cors 失败再退回 no-cors”——那样会多发一次请求，第二次的耗时还带着已经建连的偏差。
3. **清华的 `robots.txt` 不接受查询参数。** 加上 `?v=1758260000` 后返回 **403**（15 KB 的拦截页），
   因此这条探针的 `cacheBust` 必须是 `false`。其余五家实测加参数仍为 200，可以启用。

## 失败分类（浏览器实测）

| 场景                                                            | 浏览器行为                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| 请求超过 1500 ms（`https://10.255.255.1/robots.txt`）           | `AbortController` 触发，`fetch` 在 1502 ms 抛 `TimeoutError` |
| 域名不存在（`https://no-such-host-mirrorn.invalid/robots.txt`） | 7 ms 抛 `TypeError: Failed to fetch`                         |

两者可区分，因此“超时”和“失败”在界面上是两种状态。`TypeError` 也可能是 CSP 或浏览器策略导致的，
界面文案不会宣称站点宕机。

## 参考：pip 仓库路径本身也支持 HEAD

`https://pypi.org/simple/`、`https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple/`、
`https://mirrors.aliyun.com/pypi/simple/` 的 `HEAD` 请求都返回 200。当前没有采用这类地址做探针，
因为 pip 的 simple 索引很大，而探针要访问的是“审核过的小资源”；如果以后要测仓库路径，
必须先确认 HEAD 行为和体积。

## 未验证项

- 中国大陆不同运营商（电信/联通/移动/教育网）下的实际耗时未测；上表不能替代真实用户样本。
- 代理、分流、校园网认证等场景未测；探针失败可能由这些原因造成。
- 除 Chrome 外的浏览器与旧版浏览器未测（`AbortController`、`no-cors` 均为长期可用特性，
  但 `cache: 'no-store'` 在部分浏览器对 no-cors 请求可能被忽略，此时靠 `cacheBust` 参数兜底，
  清华那条探针因此没有缓存投毒之外的兜底手段）。

## 如何重新核实

```bash
# 服务端行为：状态码、体积、CORS 头
curl -s -m 12 -o /dev/null -D - -H "Origin: https://mirrorn.example" \
  https://mirrors.aliyun.com/robots.txt

# 加参数是否仍可用（决定 cacheBust）
curl -s -m 12 -o /dev/null -w '%{http_code} %{size_download}B\n' \
  "https://mirrors.tuna.tsinghua.edu.cn/robots.txt?v=1758260000"

# 浏览器行为：在页面里按 probe.mode 执行 fetch，确认 opaque / 可读状态码与超时分类
```

## 实现后的真实站点复核（2026-09-19）

上面是逐条请求的核实。实现完成后再用**真实浏览器跑一遍页面本身**，确认数据里的 `mode` 与实际行为一致，
也确认界面文案没有夸大。方法：系统 Chrome 打开 `/#/ecosystems/pip`、`/#/ecosystems/npm`，
进入步骤 2 等所有候选测量结束（没有 mock，访问真实站点），读取每一行的徽标文案。

| 页面 | 来源                   | 界面文案                                              | 是否默认选中 |
| ---- | ---------------------- | ----------------------------------------------------- | ------------ |
| pip  | PyPI 官方源            | 响应耗时（估算） 205 ms · 推荐 · 响应完成，内容未验证 | 是           |
| pip  | 清华大学开源软件镜像站 | 响应耗时（估算） 698 ms · 响应完成，内容未验证        | 否           |
| pip  | 阿里云开发者镜像站     | 响应耗时（估算） 209 ms · 响应完成，内容未验证        | 否           |
| npm  | npm 官方 Registry      | 响应耗时（估算） 195 ms · 推荐 · 响应完成，内容未验证 | 是           |
| npm  | npmmirror              | 响应耗时（估算） 496 ms · 响应完成，HTTP 200          | 否           |
| npm  | 腾讯云软件源           | 响应耗时（估算） 652 ms · 响应完成，HTTP 200          | 否           |

结论：

- 声明为 `no-cors` 的四条探针在页面里都是 opaque（“内容未验证”），声明为 `cors` 的两条能读到 HTTP 200，
  与逐条核实的 CORS 头一致。
- 推荐标记落在实际最快的一条上（pip 是 PyPI 205 ms 对阿里云 209 ms），默认来源跟着推荐走，
  而不是固定在列表第一项。
- 两页各写入 3 条缓存记录（`mirrorn.probe-cache.v1`）。
- 用户手动选过来源后，后台刷新不再替换选择与命令；这条由人工验收覆盖（见 `docs/acceptance-checklist.md` 第 2 节）。
- 当前数据集里 6 个来源都声明了探针，所以“无法测量”这一分支在浏览器里没有现场证据，
  只有单元测试覆盖（`apps/web/src/lib/probeView.test.ts`、`apps/web/src/composables/useMirrorProbes.test.ts`）。
