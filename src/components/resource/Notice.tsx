import type { ReactNode } from 'react';
const labels = { info: '提示', warning: '注意', danger: '重要提醒', success: '说明' };
export default function Notice({ type, title, children }: { type: keyof typeof labels; title?: string; children?: ReactNode }) {
  return <aside className={`resource-notice resource-notice--${type}`} aria-label={title ?? labels[type]}><p className="resource-notice__title">{title ?? labels[type]}</p>{children}</aside>;
}
