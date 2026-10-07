/** 公开许可入口与原始文件映射；不接收用户传入的磁盘路径。 */
export const licenseFiles = Object.freeze([
  { name: 'mit', path: 'LICENSE', label: 'MirrorN 代码 · MIT' },
  { name: 'cc-by-4.0', path: 'LICENSE-DOCS', label: 'MirrorN 原创文档 · CC BY 4.0' },
  { name: 'fuse', path: 'node_modules/fuse.js/LICENSE', label: 'Fuse.js · Apache-2.0' },
  { name: 'zod', path: 'node_modules/zod/LICENSE', label: 'Zod · MIT' },
  { name: 'react', path: 'node_modules/react/LICENSE', label: 'React · MIT' },
  { name: 'react-dom', path: 'node_modules/react-dom/LICENSE', label: 'React DOM · MIT' },
  { name: 'react-router', path: 'node_modules/react-router/LICENSE.md', label: 'React Router · MIT' },
] as const);

export const fontLicenseFiles = Object.freeze([
  { path: 'public/font-licenses/inter.txt', url: '/font-licenses/inter.txt' },
  { path: 'public/font-licenses/jetbrains-mono.txt', url: '/font-licenses/jetbrains-mono.txt' },
] as const);
