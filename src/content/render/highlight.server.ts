import { codeToTokens } from 'shiki';
import { documentNodes } from '../parse/document-types.ts';
import type { PublishedResource } from '../registry/types.ts';
import { codeKey, codeLanguages, type HighlightedCode } from '../schema/code-blocks.ts';

const themes = { light: 'github-light', dark: 'github-dark' } as const;

/**
 * 构建期高亮：只在预渲染／开发的 loader 里运行，浏览器拿到的是现成的“文字＋颜色”，
 * 不加载语法文件或高亮引擎。亮暗两套颜色都输出，切换主题只靠 CSS。
 */
export async function highlightResource(resource: PublishedResource): Promise<Readonly<Record<string, HighlightedCode>>> {
  const blocks = documentNodes(resource.document.children).filter((node) => node.type === 'code');
  const entries = await Promise.all(blocks.map(async (node): Promise<[string, HighlightedCode][]> => {
    const grammar = codeLanguages[node.language].grammar;
    if (!grammar) return [];
    const { tokens } = await codeToTokens(node.value, { lang: grammar, themes, defaultColor: false });
    const lines = tokens.map((line) => line.map((token) => ({
      c: token.content, l: token.htmlStyle?.['--shiki-light'] ?? '', d: token.htmlStyle?.['--shiki-dark'] ?? '',
    })));
    // 展示文字必须与复制内容逐字一致；不一致说明分词丢了字符，退回无高亮而不是展示错误代码。
    const rebuilt = lines.map((line) => line.map((token) => token.c).join('')).join('\n');
    return rebuilt === node.value ? [[codeKey(node.position), lines]] : [];
  }));
  return Object.fromEntries(entries.flat());
}
