import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const tools = Object.freeze({ router: 'node_modules/@react-router/dev/bin.cjs', tsc: 'node_modules/typescript/bin/tsc', eslint: 'node_modules/eslint/bin/eslint.js' });

/** 直接使用本机 Node，避免 Windows shell / pnpm shim 与 Unix 环境变量语法分叉。 */
export async function runNode(args: readonly string[], env: Readonly<NodeJS.ProcessEnv> = process.env): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...args], { cwd: projectRoot, stdio: 'inherit', env: { ...env } });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(' ')} 失败（exit=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`));
    });
  });
}

export function reportFailure(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
