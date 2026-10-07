import type { PublishedResource } from '../../content/registry/types.ts';
import { requireItem } from '../../content/resolve/sources.ts';
import CopyBlock from './CopyBlock';
export default function Checksum({ resource, artifact: id }: { resource: PublishedResource; artifact: string }) {
  const artifact = requireItem(resource.data.artifacts, id, '产物');
  if (!artifact.checksum) throw new Error(`Checksum 的 ${id} 缺少校验值`);
  const verified = resource.data.sources.some((source) => source.type === 'local' && source.artifactId === id);
  return <section className="resource-component" aria-label={`${artifact.label} 校验值`}><p className="resource-component__title">{artifact.label}</p><CopyBlock value={artifact.checksum.value} label={artifact.checksum.algorithm.toUpperCase()} wrap /><p className="resource-muted">{verified ? '已与本站附件的实际字节核对。' : '由维护者提供；本站未下载核验远程文件。'}</p></section>;
}
