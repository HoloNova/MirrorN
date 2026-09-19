# MirrorN 容器镜像：一个进程同时提供 API 与前端静态页面。
#
# 为什么单镜像：部署只需要一个端口、一个数据卷，回滚就是换镜像标签；
# 线上生产环境用的是 Caddy + 静态产物 + systemd 后端（见 docs/deployment.md），
# 容器化主要面向“一键在本机或服务器上跑起来”的场景。
#
# 构建：docker build -t mirrorn .
# 运行：docker compose up --build（推荐，见 docker-compose.yml）

# ---------- 构建阶段：装依赖、构建数据校验 + 前端 + 后端单文件 ----------
FROM node:22-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# corepack 自带在 node 镜像里，用它固定 pnpm 版本，避免依赖全局安装。
RUN corepack enable

WORKDIR /build

# 先只复制清单文件，让依赖层可以被缓存。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# 只安装这三个 workspace 需要的依赖；--frozen-lockfile 保证可复现。
RUN pnpm install --frozen-lockfile --filter @mirrorn/shared --filter @mirrorn/server --filter @mirrorn/web

# 再复制源码与数据（数据参与构建期的校验与打包）。
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY apps apps
COPY data data
COPY scripts scripts

# VITE_API_BASE=/ 表示前端与 API 同源：容器里由同一个进程提供 /api。
RUN VITE_API_BASE=/ pnpm build:web && pnpm --filter @mirrorn/server build:bundle

# ---------- 运行阶段：只带运行时需要的东西 ----------
FROM node:22-slim AS runtime

LABEL org.opencontainers.image.title="MirrorN" \
      org.opencontainers.image.description="镜像站导航与配置向导（API + 静态页面）" \
      org.opencontainers.image.source="https://mirror.campuslink.vip/"

ENV NODE_ENV=production
ENV MIRRORN_HOST=0.0.0.0
ENV MIRRORN_PORT=8787
ENV MIRRORN_DATA_DIR=/app/data
ENV MIRRORN_SNAPSHOT_DIR=/var/lib/mirrorn
ENV MIRRORN_STATIC_DIR=/app/static

WORKDIR /app

# 单文件后端、数据与静态产物；快照目录交给 volume（compose 里声明）。
COPY --from=builder /build/apps/server/dist/server.js /app/server.js
COPY --from=builder /build/data /app/data
COPY --from=builder /build/apps/web/dist /app/static

# 非 root 运行：容器里用 UID/GID 10001，快照目录由 compose 的卷挂载进来。
RUN mkdir -p /var/lib/mirrorn && chown -R 10001:10001 /var/lib/mirrorn
USER 10001:10001

EXPOSE 8787

# 健康检查直接用后端自带的接口；容器里没有 curl，用 node 自己发请求。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MIRRORN_PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/server.js"]
