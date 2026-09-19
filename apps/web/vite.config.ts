import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  /**
   * 依赖预打包缓存目录按模式分开：e2e 用 `--mode e2e` 时写到 `.vite-e2e`。
   *
   * 两者共用一个目录很危险：Vite 的重建会先清掉旧缓存，而重建发生在绑定端口之前，
   * 所以一个实例重建缓存时，另一个实例正在浏览的页面会立刻加载失败（504 Outdated Optimize Dep
   * → 不断重载 → 白屏或一直 pending）。分开目录之后，跑 e2e 不再影响 dev。
   */
  cacheDir: mode === 'e2e' ? 'node_modules/.vite-e2e' : 'node_modules/.vite',
  server: {
    host: '127.0.0.1',
    /**
     * 端口可用 `MIRRORN_WEB_PORT` 覆盖，默认 5173。保留这个开关是因为端口相关的问题
     * （VS Code 端口转发、浏览器按 origin 缓存的 Service Worker、本机已有进程占用）
     * 都在我们代码之外，而换一个端口是最快的验证手段：
     * `MIRRORN_WEB_PORT=5174 pnpm dev:web`。
     */
    port: Number(process.env.MIRRORN_WEB_PORT ?? 5173),
    // 端口被占用时直接失败。默认行为是静默改用 5174，会让“终端里显示的端口”
    // 和“你以为在看的页面”不一致，排查白屏时尤其误导。另见 scripts/require-free-port.mjs：
    // 预检在 vite 启动之前就把被占用的情况拦住，避免重建依赖缓存把正在浏览的页面打断。
    strictPort: true,
    fs: {
      allow: [fileURLToPath(new URL('../..', import.meta.url))],
    },
    /**
     * 开发时把 /api 代理到本地后端：前端因此可以始终使用同源地址（与公开部署一致），
     * 也不需要给后端加 CORS。
     *
     * e2e 模式不代理：e2e 必须能在没有后端的情况下跑完，而且代理失败会在日志里刷
     * ECONNREFUSED。测速与状态相关的网络交互在 e2e 里用 page.route 模拟。
     */
    proxy:
      mode === 'e2e'
        ? undefined
        : {
            '/api': {
              target: 'http://127.0.0.1:8787',
              changeOrigin: false,
            },
          },
  },
}));
