import type { ContentIssue, ContentLocation } from '../diagnostics.ts';
import { documentNodes, type ResourceDirective } from '../parse/document-types.ts';
import type { ResourceInput } from '../registry/input.ts';
import { isFileSource } from '../schema/sources.ts';
import { issueAt, sourceIndex } from './source-data.ts';

function attributeLocation(node: ResourceDirective, field: string): ContentLocation {
  return node.attributePositions[field] ?? { ...node.position, field: `directive.${node.name}.${field}` };
}

interface DirectiveContext {
  readonly input: ResourceInput;
  readonly resources: ReadonlyMap<string, ResourceInput>;
  readonly index: ReturnType<typeof sourceIndex>;
}

function validateOne(node: ResourceDirective, context: DirectiveContext): readonly ContentIssue[] {
  const { input, resources, index } = context;
  const problem = (field: string, message: string) => [issueAt(attributeLocation(node, field), 'E_REFERENCE', message)];
  switch (node.name) {
    case 'download': {
      if (node.props.source === undefined) return [];
      const source = index.sources.get(node.props.source);
      if (!source) return problem('source', `来源不存在：${node.props.source}`);
      return isFileSource(source) ? [] : problem('source', 'Download 只接受文件入口，网页和命令使用其他指令');
    }
    case 'download-select': case 'source-list': {
      const group = index.groups.get(node.props.group);
      if (!group) return problem('group', `分组不存在：${node.props.group}`);
      if (node.name === 'download-select') {
        const nonFile = group.sourceIds.find((id) => {
          const source = index.sources.get(id);
          return source && !isFileSource(source);
        });
        if (nonFile) return problem('group', `DownloadSelect 分组只能包含文件入口，${nonFile} 不是文件入口`);
      }
      return [];
    }
    case 'install-command': {
      const source = index.sources.get(node.props.source);
      if (!source) return problem('source', `来源不存在：${node.props.source}`);
      return source.type === 'package-manager' ? [] : problem('source', 'InstallCommand 只接受 package-manager 来源');
    }
    case 'checksum': {
      const artifact = index.artifacts.get(node.props.artifact);
      if (!artifact) return problem('artifact', `产物不存在：${node.props.artifact}`);
      return !input.metadata.draft && !artifact.checksum ? problem('artifact', '公开 Checksum 必须引用已提供 checksum 的产物') : [];
    }
    case 'compatibility-table': return index.compatibility.has(node.props.table) ? [] : problem('table', `兼容表不存在：${node.props.table}`);
    case 'resource-card': {
      const target = resources.get(node.props.resource);
      if (!target) return problem('resource', `资源不存在：${node.props.resource}`);
      if (target.metadata.id === input.metadata.id) return problem('resource', 'ResourceCard 引用另一个资源，不引用自己');
      return !input.metadata.draft && target.metadata.draft ? problem('resource', '公开资源不能引用草稿资源') : [];
    }
    case 'choice': case 'steps': return [];
    case 'option': return !input.metadata.draft && !node.children.length ? problem('label', '公开 option 必须包含内容') : [];
    case 'details': return !input.metadata.draft && !node.children.length ? problem('title', '公开折叠块必须包含内容') : [];
    case 'notice': return !input.metadata.draft && !node.children.length ? problem('type', '公开 Notice 必须包含 Markdown 正文') : [];
  }
}

export function validateDirectives(input: ResourceInput, resources: ReadonlyMap<string, ResourceInput>): readonly ContentIssue[] {
  const context: DirectiveContext = { input, resources, index: sourceIndex(input.data) };
  return documentNodes(input.document.children).flatMap((node) => node.type === 'resourceDirective' ? validateOne(node, context) : []);
}
