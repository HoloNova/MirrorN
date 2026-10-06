/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 后端 API 基地址。不配置时的行为：
   *   - 开发模式：按 `/` 同源处理（vite dev server 把 /api 代理到本地后端）；
   *   - 生产构建：undefined，即纯静态模式，完全不请求后端（见 useMirrorStatus）。
   *
   * 公开部署（同域反代 /api）用 `VITE_API_BASE=/` 构建；把 API 放在别的域名时写完整地址。
   */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
