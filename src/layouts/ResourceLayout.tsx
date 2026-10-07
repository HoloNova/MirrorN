import type { ReactNode } from 'react';
import type { DocumentHeading } from '../content/parse/document-types.ts';
import PageToc from '../components/site/PageToc';
interface Props { title: string; summary?: string; headings?: readonly DocumentHeading[]; metadata?: ReactNode; footer?: ReactNode; children: ReactNode }
export default function ResourceLayout({ title, summary, headings = [], metadata, footer, children }: Props) {
  const hasToc = headings.length >= 2;
  return <div className={`resource-frame${hasToc ? ' resource-frame--with-toc' : ''}`}>{hasToc && <PageToc headings={headings} />}<article className="resource" data-resource-article><header className="resource__header"><h1>{title}</h1>{summary && <p className="resource__summary">{summary}</p>}{metadata}</header><div className="prose">{children}</div>{footer}</article></div>;
}
