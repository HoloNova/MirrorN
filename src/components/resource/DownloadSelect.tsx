import { useEffect, useState } from 'react';
import type { PublishedResource } from '../../content/registry/types.ts';
import { artifactDescription, dimensionKey, downloadChoices } from '../../content/resolve/selection.ts';
import SourceEntry from './SourceEntry';

export default function DownloadSelect({ resource, group }: { resource: PublishedResource; group: string }) {
  const choices = downloadChoices(resource, group);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filters, setFilters] = useState({ version: choices.defaultVersion, platform: 'all', arch: 'all' });
  const [selection, setSelection] = useState<{ artifact: string | null; source: string | null }>({ artifact: null, source: null });
  useEffect(() => { setReady(true); }, []);
  const candidates = choices.artifacts.filter((artifact) => (Object.keys(filters) as (keyof typeof filters)[]).every((key) => filters[key] === 'all' || dimensionKey(artifact[key]) === filters[key]));
  const artifactId = selection.artifact === null ? candidates.length === 1 ? candidates[0]!.id : '' : candidates.some((entry) => entry.id === selection.artifact) ? selection.artifact : '';
  const sources = choices.entries.filter((entry) => entry.artifact.id === artifactId);
  const available = sources.filter((entry) => entry.health !== 'broken');
  const preferred = available.find((entry) => entry.id === choices.group.defaultSourceId);
  const source = selection.source === null ? preferred ?? (available.length === 1 ? available[0] : undefined) : available.find((entry) => entry.id === selection.source);
  const hasAvailable = candidates.some((artifact) => choices.entries.some((entry) => entry.artifact.id === artifact.id && entry.health !== 'broken'));
  const status = !candidates.length ? '没有匹配文件，请调整筛选。' : !hasAvailable ? '匹配文件的所有来源均失效，请查看来源说明；不会换用其他文件。' : !artifactId ? '有多个匹配文件，请明确选择，不自动下载第一项。' : !available.length ? '该文件没有可用来源；不会自动换成其他文件。' : !source ? '请选择来源，再点击下载。' : '只下载当前所选文件；切换来源不会改变版本、平台或架构。';
  const dimensions = [
    { key: 'version' as const, label: '版本', values: choices.versions },
    { key: 'platform' as const, label: '平台', values: choices.platforms },
    { key: 'arch' as const, label: '架构', values: choices.architectures },
  ];
  return <section className="resource-component download-selector" aria-label={choices.group.label}>
    <p className="resource-component__title">{choices.group.label}</p>
    {choices.entries.every((entry) => entry.health === 'broken') && <p className="resource-state resource-state--danger">本组当前没有可用入口，保留文件和来源说明。</p>}
    <fieldset className="download-selector__controls" hidden={!ready}>
      <legend className="resource-muted">选择文件后，再选择同一产物的来源</legend>
      <div className="download-selector__grid">
        {dimensions.map((dimension) => <label key={dimension.key}>{dimension.label}<select value={filters[dimension.key]} onChange={(event) => { setFilters({ ...filters, [dimension.key]: event.target.value }); setSelection({ artifact: null, source: null }); }}>
          <option value="all">全部</option>{dimension.values.map((value) => <option key={dimensionKey(value)} value={dimensionKey(value)}>{value ?? '未注明'}</option>)}
        </select></label>)}
        <label>文件<select value={artifactId} disabled={!candidates.length} onChange={(event) => setSelection({ artifact: event.target.value, source: null })}>
          <option value="">{candidates.length ? '请选择文件' : '无匹配文件'}</option>{candidates.map((artifact) => <option key={artifact.id} value={artifact.id}>{[artifact.label, artifact.version ?? '版本未注明', artifact.platform ?? '平台未注明', artifact.arch ?? '架构未注明'].join(' / ')}</option>)}
        </select></label>
        <label>来源<select value={source?.id ?? ''} disabled={!artifactId || !available.length} onChange={(event) => setSelection({ artifact: artifactId, source: event.target.value })}>
          <option value="">{artifactId ? '请选择来源' : '先选择文件'}</option>{sources.map((entry) => <option key={entry.id} value={entry.id} disabled={entry.health === 'broken'}>{entry.label}{entry.health === 'broken' ? '（失效）' : ''}</option>)}
        </select></label>
      </div>
      <p className="resource-state" aria-live="polite">{status}</p>
      {source && <a className="resource-action" href={source.href} download={source.downloadName}>下载所选文件</a>}
    </fieldset>
    <details open={!ready || expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>所有文件与来源</summary>
      <ul className="source-list">{choices.entries.map((entry) => <li key={entry.id} aria-label={artifactDescription(entry)}><SourceEntry entry={entry} /></li>)}</ul>
    </details>
  </section>;
}
