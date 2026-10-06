import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { makeCredential } from './auth.js';
import { CurationStore } from './store.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const path = resolve(
  root,
  process.env.MIRRORN_SNAPSHOT_DIR?.trim() || 'apps/server/.data',
  'mirrorn-curated.sqlite',
);
const store = new CurationStore(path);
async function setup() {
  if (store.credential() && !process.argv.includes('--reset'))
    throw new Error('管理员已存在；如需重置，请执行 pnpm admin:setup --reset');
  if (!process.stdin.isTTY) throw new Error('请在交互终端中运行，以隐藏密码输入');
  let hidden = false;
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!hidden) process.stdout.write(chunk);
      done();
    },
  });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const username = (await prompt.question('管理员用户名：')).trim();
    process.stdout.write('密码（至少12个字符，输入不回显）：');
    hidden = true;
    const password = await prompt.question('');
    process.stdout.write('\n再次输入密码：');
    const confirmation = await prompt.question('');
    hidden = false;
    process.stdout.write('\n');
    if (password !== confirmation) throw new Error('两次密码不一致，未保存');
    store.setCredential(await makeCredential(username, password));
    process.stdout.write('管理员已保存。启动项目后访问 /#/admin；密码仅以 scrypt 摘要保存。\n');
  } finally {
    prompt.close();
  }
}
try {
  if (process.argv[2] === 'backup') {
    const destination = process.argv[3];
    if (!destination) throw new Error('用法：pnpm content:backup <新的备份文件路径>');
    const target = resolve(root, destination);
    if (existsSync(target)) throw new Error('备份文件已存在，请换一个文件名（不会覆盖）');
    store.backup(target);
    process.stdout.write(`一致性备份已保存：${target}\n`);
  } else await setup();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  store.close();
}
