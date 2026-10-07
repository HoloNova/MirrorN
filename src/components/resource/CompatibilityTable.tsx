import type { PublishedResource } from '../../content/registry/types.ts';
import { requireItem } from '../../content/resolve/sources.ts';
const supportLabels = { supported: '支持', unsupported: '不支持', unknown: '未知' };
export default function CompatibilityTable({ resource, table: id }: { resource: PublishedResource; table: string }) {
  const table = requireItem(resource.data.compatibility, id, '兼容表');
  return <div className="resource-table-scroll" tabIndex={0} role="region" aria-label="兼容性说明表"><table>
    <caption>维护者提供的兼容性说明，非本站实测结果</caption><thead><tr><th scope="col">平台</th><th scope="col">架构</th><th scope="col">支持情况</th><th scope="col">版本</th><th scope="col">说明</th></tr></thead>
    <tbody>{table.rows.map((row, index) => <tr key={index}><td>{row.platform}</td><td>{row.arch ?? '未注明'}</td><td><span className={`compatibility-${row.support}`}>{supportLabels[row.support]}</span></td><td>{row.version ?? '未注明'}</td><td className="source-entry__note">{row.note ?? '—'}</td></tr>)}</tbody>
  </table></div>;
}
