/**
 * 极小的 Markdown 子集渲染器（无依赖）。
 *
 * 为什么自己写而不是引第三方：
 *   帮助内容是我们自己写的散文，只用到标题、段落、列表、行内代码、围栏代码与链接这几种写法。
 *   为一个子集引入 markdown 库 + 消毒库，会让浏览器包里多出两块我们无法逐行解释的代码；
 *   而这个渲染器的全部输出都由它自己拼出来（先转义、再插标签），没有可注入的路径。
 *
 * 与 `docs/decisions.md` 里"不为生态数据引入 Markdown 架构"的决定不冲突：那条针对的是
 * **数据契约**（命令、来源、排错条目必须留在 JSON 里被校验）；这里渲染的是帮助文档正文，
 * 它本来就没有机器可读的字段。
 *
 * 支持的写法（刻意保持最小）：
 *   `#`–`###` 标题、空行分隔的段落、`-` 无序列表、`1.` 有序列表、`> ` 引用、`---` 分隔线、
 *   ``` 围栏代码块，以及行内的 `代码`、**加粗**、[文字](链接)。
 *
 * 不支持的写法（需要时再单独加，并补测试）：表格、嵌套列表、图片、HTML 直插、任务列表。
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * 行内标记。顺序不可颠倒：**先整体转义**，再把自己认识的标记替换成标签。
 * 反过来的话，正文里写的 `<b>` 会被当成标签发出去。
 */
function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
      // 站内链接（以 # 开头）留在当前页打开；外部链接新开标签，避免用户丢失当前配置。
      const external = /^https?:\/\//.test(href);
      const attributes = external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${href}"${attributes}>${label}</a>`;
    });
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const FENCE = /^```/;
const RULE = /^---+$/;

/** 把 Markdown 子集渲染成 HTML 字符串。内容可信（仓库内自己写的帮助文档），但仍全部转义。 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1; // 跳过收尾的 ```
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length + 1; // 页面已有 h1，文档标题从 h2 起（#→h2、##→h3、###→h4）
      html.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      html.push('<hr />');
      index += 1;
      continue;
    }

    if (UNORDERED.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = ordered ? ORDERED.exec(current) : UNORDERED.exec(current);
        if (!match) {
          break;
        }
        items.push(`<li>${renderInline(match[1] ?? '')}</li>`);
        index += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    if (QUOTE.test(line)) {
      const quote: string[] = [];
      while (index < lines.length) {
        const match = QUOTE.exec(lines[index] ?? '');
        if (!match) {
          break;
        }
        quote.push(match[1] ?? '');
        index += 1;
      }
      html.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (
        current.trim() === '' ||
        HEADING.test(current) ||
        UNORDERED.test(current) ||
        ORDERED.test(current) ||
        QUOTE.test(current) ||
        FENCE.test(current) ||
        RULE.test(current)
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return html.join('\n');
}
