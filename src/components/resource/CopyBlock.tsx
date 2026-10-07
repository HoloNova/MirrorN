import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HighlightedCode } from '../../content/schema/code-blocks.ts';
interface Props { value: string; label: string; title?: string; mac?: boolean; tokens?: HighlightedCode; wrap?: boolean; disabled?: boolean }

export default function CopyBlock({ value, label, title, mac = false, tokens, wrap = false, disabled = false }: Props) {
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState('');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setReady(Boolean(navigator.clipboard?.writeText));
    return () => { mounted.current = false; };
  }, []);
  const copy = async () => {
    try {
      // 直接复制 props 中的原始字符串，不读取已被 HTML 规范化换行的 DOM。
      await navigator.clipboard.writeText(value);
      if (mounted.current) setFeedback('已复制。');
    } catch (error) {
      console.error('[MirrorN copy] 复制失败', error);
      if (mounted.current) setFeedback('复制失败，请选中文本手动复制。');
    }
  };
  return <div className={`copy-block${wrap ? ' copy-block--wrap' : ''}`}>
    <div className="copy-block__toolbar">{mac && <span className="copy-block__dots" aria-hidden="true"><i /><i /><i /></span>}<span className="copy-block__title">{title ?? label}</span>{title && <span className="copy-block__lang">{label}</span>}<button type="button" hidden={!ready} disabled={disabled} aria-label={`复制${label}`} onClick={() => { void copy(); }}>复制</button></div>
    <pre tabIndex={0} aria-label={`${title ?? label}内容`}><code>{tokens ? tokens.map((line, row) => <span key={row}>{row > 0 && '\n'}{line.map((token, index) => <span key={index} className="hl" style={{ '--l': token.l, '--d': token.d } as CSSProperties}>{token.c}</span>)}</span>) : value}</code></pre>
    <span className="copy-block__feedback" aria-live="polite">{feedback}</span>
  </div>;
}
