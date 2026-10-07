import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';

type Node = DefaultTreeAdapterTypes.Node;
export type Element = DefaultTreeAdapterTypes.Element;
export interface OutputReference { readonly url: string; readonly anchors: boolean }

/** 正式 HTML 解析器处理实体、引号与嵌套；不是正则截取 href。 */
export function elements(node: Node): readonly Element[] {
  const self = 'tagName' in node ? [node] : [];
  const children = 'childNodes' in node ? node.childNodes.flatMap(elements) : [];
  const template = 'content' in node ? elements(node.content) : [];
  return [...self, ...children, ...template];
}
export function attribute(node: Element | undefined, name: string): string | undefined {
  return node?.attrs.find((attr) => attr.name === name)?.value;
}
export function text(node: Node): string {
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(text).join('') : '';
}

export function cssReferences(css: string): readonly OutputReference[] {
  let references: readonly OutputReference[] = [];
  const inspect = (value: string): void => {
    valueParser(value).walk((node) => {
      if (node.type === 'function' && node.value.toLowerCase() === 'url') {
        const url = node.nodes.filter((part) => part.type !== 'space' && part.type !== 'comment');
        if (url.length === 1 && url[0] && (url[0].type === 'word' || url[0].type === 'string')) {
          references = [...references, { url: url[0].value, anchors: false }];
        } else throw new Error('CSS URL 无法确定，请使用静态文件引用。');
        return false;
      }
      return undefined;
    });
  };
  const tree = postcss.parse(css);
  tree.walkDecls((declaration) => inspect(declaration.value));
  tree.walkAtRules('import', (rule) => {
    const value = valueParser(rule.params);
    const first = value.nodes.find((node) => node.type !== 'space' && node.type !== 'comment');
    if (first?.type === 'string') references = [...references, { url: first.value, anchors: false }];
    else inspect(rule.params);
  });
  return references;
}

export function htmlDocument(html: string) {
  const nodes = elements(parse(html, { scriptingEnabled: false }));
  const ids = nodes.flatMap((node) => {
    const id = attribute(node, 'id');
    return id ? [id] : [];
  });
  if (new Set(ids).size !== ids.length) throw new Error('HTML 存在重复 id');
  const references = nodes.flatMap((node): readonly OutputReference[] => {
    const attributes = ['href', 'src', 'poster', 'action'];
    const direct = attributes.flatMap((name) => {
      const url = attribute(node, name);
      return url ? [{ url, anchors: name === 'href' && (node.tagName === 'a' || node.tagName === 'use') }] : [];
    });
    // 当前渲染器只发 src；新响应式图片须先接入 srcset 解析，不能静默漏检。
    if (attribute(node, 'srcset')) throw new Error('srcset 尚未纳入产物检查，请先补齐解析契约');
    const style = attribute(node, 'style');
    return [...direct, ...(style ? cssReferences(`x{${style}}`) : []), ...(node.tagName === 'style' ? cssReferences(text(node)) : [])];
  });
  return { nodes, ids: new Set(ids), references };
}
