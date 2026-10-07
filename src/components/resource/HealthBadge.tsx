/**
 * 来源可用性徽章。状态由维护者在 sources.json（或行内 status）里手写，本站不探测，
 * 所以徽章总是带核查日期，避免被读成“实时状态”。形状 + 文字 + 颜色三者并用。
 */
const states = {
  available: { text: '正常', path: 'm5 12.5 4.5 4.5L19 7.5' },
  broken: { text: '失败', path: 'm6 6 12 12M18 6 6 18' },
  unknown: { text: '未验证', path: 'M8 12h8' },
} as const;
export type Health = keyof typeof states;
export default function HealthBadge({ health, checkedAt }: { health: Health; checkedAt?: string }) {
  const state = states[health];
  return <span className="health">
    <span className={`health-badge health-badge--${health}`} title={checkedAt ? `维护者于 ${checkedAt} 核查；当前状态仍以来源站点为准` : '维护者尚未核查此来源'}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" strokeWidth="1.6" /><path d={state.path} /></svg>
      <span className="visually-hidden">来源状态：</span>{state.text}
    </span>
    {checkedAt && <span className="health__date">核查于 <time dateTime={checkedAt}>{checkedAt}</time></span>}
  </span>;
}
