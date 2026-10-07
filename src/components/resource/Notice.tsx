import type { ReactNode } from 'react';
/** 每种提示有自己的形状，不只靠颜色区分（DESIGN 第 2 节）。note 是中性灰的补充说明。 */
const kinds = {
  info: { label: '提示', path: 'M12 11v5m0-8.5h.01' },
  warning: { label: '注意', path: 'M12 9v4.5m0 3h.01' },
  danger: { label: '重要提醒', path: 'm9 9 6 6m0-6-6 6' },
  success: { label: '说明', path: 'm8 12.5 3 3 5-6' },
  note: { label: '备注', path: 'M8 9h8M8 12.5h8M8 16h5' },
} as const;
export default function Notice({ type, title, children }: { type: keyof typeof kinds; title?: string; children?: ReactNode }) {
  const kind = kinds[type];
  return <aside className={`resource-notice resource-notice--${type}`} aria-label={title ?? kind.label}>
    <p className="resource-notice__title"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{type === 'warning' ? <path d="M12 3.5 21.5 20h-19L12 3.5Z" /> : type === 'note' ? <rect x="4" y="4" width="16" height="16" rx="3" /> : <circle cx="12" cy="12" r="9.5" />}<path d={kind.path} /></svg><span>{title ?? kind.label}</span></p>
    {children}
  </aside>;
}
