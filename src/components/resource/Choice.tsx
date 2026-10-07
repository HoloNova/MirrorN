import { useEffect, useId, useState, type ReactNode } from 'react';
export interface ChoiceOption { readonly label: string; readonly content: ReactNode }
/**
 * 作者手写的选项切换。没有 JS（或脚本就绪前）所有选项按顺序全部展开并带小标题，
 * 内容不会因为脚本失败而不可见；就绪后只显示所选项，选择状态不写入地址或存储。
 */
export default function Choice({ label, options }: { label: string; options: readonly ChoiceOption[] }) {
  const id = useId();
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(0);
  useEffect(() => { setReady(true); }, []);
  return <section className="resource-component choice" aria-label={label}>
    <label className="choice__label" htmlFor={`${id}-select`} hidden={!ready}>{label}
      <select id={`${id}-select`} value={selected} onChange={(event) => setSelected(Number(event.target.value))}>{options.map((option, index) => <option key={option.label} value={index}>{option.label}</option>)}</select>
    </label>
    <p className="choice__label" hidden={ready}>{label}</p>
    {options.map((option, index) => <div key={option.label} className="choice__panel" role="group" aria-label={option.label} hidden={ready && index !== selected}>
      <p className="choice__panel-title" hidden={ready}>{option.label}</p>{option.content}
    </div>)}
  </section>;
}
