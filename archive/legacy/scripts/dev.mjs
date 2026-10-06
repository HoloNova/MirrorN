import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import concurrently from 'concurrently';

// 每次启动独立设置代码页，不要求用户给每个新终端手动执行chcp。
if (process.platform === 'win32') {
  const encoding = spawnSync('cmd.exe', ['/d', '/c', 'chcp 65001'], { stdio: 'ignore' });
  if (encoding.error || encoding.status !== 0)
    throw encoding.error ?? new Error('无法设置Windows终端UTF-8代码页');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(root, 'apps/web');
const serverDir = resolve(root, 'apps/server');
const webRequire = createRequire(resolve(webDir, 'package.json'));
const serverRequire = createRequire(resolve(serverDir, 'package.json'));
const vite = resolve(dirname(webRequire.resolve('vite/package.json')), 'bin/vite.js');
const tsx = serverRequire.resolve('tsx/cli');
const quote = (value) =>
  process.platform === 'win32' ? `"${value}"` : `'${value.replaceAll("'", "'\\''")}'`;

// concurrently会剥掉整条命令的一层引号；显式补外层，保护Program Files等路径。
const nodeCommand = (entry, args = '') =>
  `"${quote(process.execPath)} ${quote(entry)}${args ? ` ${args}` : ''}"`;

// 直接调用Node入口，避免每个长驻子进程再嵌套pnpm.cmd批处理。
const { result } = concurrently(
  [
    { name: 'web', cwd: webDir, command: nodeCommand(vite) },
    {
      name: 'server',
      cwd: serverDir,
      command: nodeCommand(tsx, 'watch src/index.ts --port 8787'),
    },
  ],
  { prefixColors: ['cyan', 'magenta'] },
);
try {
  await result;
} catch {
  // 子进程的具体错误已由concurrently输出；正常Ctrl+C由其信号处理归为成功退出。
  process.exitCode = 1;
}
