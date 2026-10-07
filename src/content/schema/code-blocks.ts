/**
 * 围栏代码块契约：允许的语言名与可选标题。
 *
 * 为什么白名单：高亮按语法文件工作，写错语言名（如 `pyhton`）若静默退成无高亮，
 * 作者只会在发布后才发现；与其它格式错误一样，在内容校验阶段就报错。
 * 这里只放纯数据，Parser、校验和浏览器组件共用，不依赖 shiki。
 */
export interface CodeLanguage {
  /** 工具栏显示名。 */
  readonly label: string;
  /** shiki 语法 ID；null 表示纯文本，不高亮。 */
  readonly grammar: string | null;
}

export const codeLanguages = {
  text: { label: '纯文本', grammar: null },
  bash: { label: 'Bash', grammar: 'shellscript' },
  powershell: { label: 'PowerShell', grammar: 'powershell' },
  cmd: { label: 'CMD', grammar: 'bat' },
  json: { label: 'JSON', grammar: 'json' },
  jsonc: { label: 'JSONC', grammar: 'jsonc' },
  yaml: { label: 'YAML', grammar: 'yaml' },
  toml: { label: 'TOML', grammar: 'toml' },
  ini: { label: 'INI', grammar: 'ini' },
  python: { label: 'Python', grammar: 'python' },
  javascript: { label: 'JavaScript', grammar: 'javascript' },
  typescript: { label: 'TypeScript', grammar: 'typescript' },
  tsx: { label: 'TSX', grammar: 'tsx' },
  jsx: { label: 'JSX', grammar: 'jsx' },
  java: { label: 'Java', grammar: 'java' },
  go: { label: 'Go', grammar: 'go' },
  rust: { label: 'Rust', grammar: 'rust' },
  c: { label: 'C', grammar: 'c' },
  cpp: { label: 'C++', grammar: 'cpp' },
  csharp: { label: 'C#', grammar: 'csharp' },
  sql: { label: 'SQL', grammar: 'sql' },
  html: { label: 'HTML', grammar: 'html' },
  xml: { label: 'XML', grammar: 'xml' },
  css: { label: 'CSS', grammar: 'css' },
  dockerfile: { label: 'Dockerfile', grammar: 'dockerfile' },
  nginx: { label: 'Nginx', grammar: 'nginx' },
  diff: { label: 'Diff', grammar: 'diff' },
  markdown: { label: 'Markdown', grammar: 'markdown' },
} as const satisfies Record<string, CodeLanguage>;

export type CodeLanguageId = keyof typeof codeLanguages;

/** 常见别名只归并到上表的一个 ID，文档里写哪个都行，页面显示一致。 */
const aliases: Readonly<Record<string, CodeLanguageId>> = {
  txt: 'text', plain: 'text', sh: 'bash', shell: 'bash', zsh: 'bash', ps1: 'powershell', bat: 'cmd',
  yml: 'yaml', py: 'python', js: 'javascript', ts: 'typescript', cs: 'csharp', 'c++': 'cpp',
  docker: 'dockerfile', md: 'markdown',
};

export interface CodeFence {
  readonly language: CodeLanguageId;
  readonly title: string | null;
}

const titlePattern = /^title="([^"\r\n]{1,80})"$/u;

/** 未写语言按纯文本；meta 只接受 `title="文件名"`，其它内容一律报错而不是悄悄忽略。 */
export function parseCodeFence(lang: string | null, meta: string | null): CodeFence | { readonly error: string } {
  const key = (lang ?? 'text').toLowerCase();
  const language = Object.hasOwn(codeLanguages, key) ? key as CodeLanguageId : aliases[key];
  if (!language) return { error: `未登记的代码语言“${lang}”；可用：${Object.keys(codeLanguages).join('、')}（不需要高亮时写 text 或省略）` };
  const rest = meta?.trim() ?? '';
  if (!rest) return { language, title: null };
  const match = titlePattern.exec(rest);
  if (!match) return { error: '代码块信息只支持 title="文件名"，例如 ```bash title="install.sh"' };
  return { language, title: match[1]!.trim() || null };
}

/** 高亮结果的紧凑形态：每个片段的文字与亮／暗两种颜色，行与行之间由换行连接。 */
export interface HighlightToken { readonly c: string; readonly l: string; readonly d: string }
export type HighlightedCode = readonly (readonly HighlightToken[])[];
/** 代码节点在文档中的稳定键，与解析出的源码位置一致。 */
export function codeKey(position: { readonly line: number; readonly column: number }): string {
  return `${position.line}:${position.column}`;
}
