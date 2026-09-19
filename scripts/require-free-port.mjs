#!/usr/bin/env node
/**
 * 启动前的端口预检：端口被占用就立刻退出，绝不向下执行。
 *
 * 为什么必须有这个检查：Vite 的依赖预打包发生在**绑定端口之前**。也就是说，
 * 在同一个仓库里再启动一个 vite 实例时，即使它随后因为端口占用而失败退出，
 * 它也已经把 `apps/web/node_modules/.vite/deps/` 重建过一遍 —— 正在使用旧缓存的那个
 * 页面随即加载失败：浏览器拿到 504（Outdated Optimize Dep）后不断重载，
 * 表现是白屏或一直 pending，而终端里没有任何报错。这个坑在一天里踩了三次，
 * 所以把"端口检查"提到最前面，让第二次启动在碰任何缓存之前就失败。
 *
 * 用法：node scripts/require-free-port.mjs web server
 *   `web`    前端端口，可用 MIRRORN_WEB_PORT 覆盖（默认 5173，与 vite.config.ts 一致）
 *   `server` 后端端口，可用 MIRRORN_PORT 覆盖（默认 8787，与 apps/server 的 dev 脚本一致）
 *   也接受直接写端口号，例如 `node scripts/require-free-port.mjs 5199`
 *
 * 注意 `server` 刻意不读通用的 `PORT`：dev 工作流把后端固定在 8787（`--port 8787`），
 * 而 `PORT` 经常被同机其他工具占用，读它反而会去检查一个与 dev 无关的端口。
 * 如果显式用 `--port 9000` 启动，请把 9000 作为参数传给这个脚本。
 */
import { createServer } from 'node:net';

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_SERVER_PORT = 8787;

function numericPort(raw, fallback) {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : fallback;
}

const WEB_PORT = numericPort(process.env.MIRRORN_WEB_PORT, DEFAULT_WEB_PORT);
const SERVER_PORT = numericPort(process.env.MIRRORN_PORT, DEFAULT_SERVER_PORT);

const requested = process.argv.slice(2);

if (requested.length === 0) {
  console.error('用法：node scripts/require-free-port.mjs [web] [server] [端口...]');
  process.exit(2);
}

const ports = [];
for (const item of requested) {
  if (item === 'web') {
    ports.push(WEB_PORT);
  } else if (item === 'server') {
    ports.push(SERVER_PORT);
  } else {
    const value = Number(item);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      console.error(`无法识别的端口参数：${item}`);
      process.exit(2);
    }
    ports.push(value);
  }
}

/** 尝试在指定端口上监听：能监听说明空闲，EADDRINUSE 说明已被占用。 */
function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', (error) => {
      resolve({ port, free: false, code: error.code ?? 'UNKNOWN' });
    });
    server.once('listening', () => {
      server.close(() => resolve({ port, free: true }));
    });

    // 不指定 host：任何接口上被占用都算占用，宁可多报也不要漏报。
    server.listen({ port, exclusive: true });
  });
}

const results = await Promise.all(ports.map((port) => checkPort(port)));
const busy = results.filter((result) => !result.free);

if (busy.length === 0) {
  process.exit(0);
}

for (const { port, code } of busy) {
  console.error(
    [
      `端口 ${port} 已被占用（${code}），已停止启动，未触碰任何缓存。`,
      `查看占用者：Linux 用 ss -ltnp | grep ${port}，macOS 用 lsof -i :${port}。`,
      `通常是上一次的 dev 进程还在运行：先结束它，或换端口启动（前端：MIRRORN_WEB_PORT=5174 pnpm dev:web）。`,
    ].join('\n'),
  );
}

console.error(
  '\n为什么直接退出：Vite 的依赖预打包发生在绑定端口之前，第二个实例会在启动失败前重建共享缓存，' +
    '把正在浏览的页面打断（表现为白屏或一直 pending）。',
);

process.exit(1);
