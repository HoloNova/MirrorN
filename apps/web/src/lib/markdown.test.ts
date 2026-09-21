import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('把标题降一级：页面已经有 h1，文档标题从 h2 起', () => {
    expect(renderMarkdown('# 标题')).toBe('<h2>标题</h2>');
    expect(renderMarkdown('## 小节')).toBe('<h3>小节</h3>');
    expect(renderMarkdown('### 更小')).toBe('<h4>更小</h4>');
  });

  it('同一段里的多行合成一个段落，空行分段', () => {
    expect(renderMarkdown('第一行\n第二行\n\n另一段')).toBe('<p>第一行 第二行</p>\n<p>另一段</p>');
  });

  it('无序与有序列表各自成块', () => {
    expect(renderMarkdown('- 甲\n- 乙')).toBe('<ul><li>甲</li><li>乙</li></ul>');
    expect(renderMarkdown('1. 甲\n2. 乙')).toBe('<ol><li>甲</li><li>乙</li></ol>');
  });

  it('围栏代码块原样保留内容，不解析里面的标记', () => {
    expect(renderMarkdown('```\nnpm config set registry **x**\n```')).toBe(
      '<pre><code>npm config set registry **x**</code></pre>',
    );
  });

  it('引用与分隔线', () => {
    expect(renderMarkdown('> 一行说明')).toBe('<blockquote>一行说明</blockquote>');
    expect(renderMarkdown('---')).toBe('<hr />');
  });

  it('行内代码、加粗与站内链接', () => {
    expect(renderMarkdown('用 `pip` 安装')).toBe('<p>用 <code>pip</code> 安装</p>');
    expect(renderMarkdown('**重点**')).toBe('<p><strong>重点</strong></p>');
    expect(renderMarkdown('[生态](#/ecosystems/apt)')).toBe(
      '<p><a href="#/ecosystems/apt">生态</a></p>',
    );
  });

  it('外部链接新开标签，站内链接留在当前页', () => {
    expect(renderMarkdown('[帮助](https://help.mirrors.cernet.edu.cn/)')).toBe(
      '<p><a href="https://help.mirrors.cernet.edu.cn/" target="_blank" rel="noopener">帮助</a></p>',
    );
  });

  it('正文里的 HTML 一律转义，不会变成标签', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(renderMarkdown('```\n<img src=x onerror=alert(1)>\n```')).toBe(
      '<pre><code>&lt;img src=x onerror=alert(1)&gt;</code></pre>',
    );
  });

  it('空文档渲染成空串', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('\n\n')).toBe('');
  });
});
