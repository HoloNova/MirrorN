import { parseSchema, type LocatedData } from '../diagnostics.ts';
import type { ResourceDocument } from '../parse/document-types.ts';
import { fileLocation, readResourceText, type ResourceDirectory } from '../parse/files.ts';
import { parseJson } from '../parse/json.ts';
import { parseMarkdown } from '../parse/markdown.ts';
import { frontMatterSchema, type FrontMatter } from '../schema/front-matter.ts';
import { draftSourcesSchema, sourcesSchema, type DraftSourcesData } from '../schema/sources.ts';

/** 原始位置与磁盘根只留在校验上下文，不暴露给公开 Registry。 */
export interface ResourceInput {
  readonly directory: ResourceDirectory;
  readonly metadata: FrontMatter;
  readonly metadataData: LocatedData;
  readonly data: DraftSourcesData;
  readonly sourceData: LocatedData;
  readonly document: ResourceDocument;
}

export async function readResource(directory: ResourceDirectory): Promise<ResourceInput> {
  const markdown = await readResourceText(directory, 'index.md');
  if (!markdown) throw new Error('必需的 index.md 读取结果缺失');
  const parsed = parseMarkdown(markdown);
  const metadata = parseSchema(frontMatterSchema, parsed.frontMatter);
  const json = await readResourceText(directory, 'sources.json', true);
  const sourceData: LocatedData = json ? parseJson(json) : {
    value: { schemaVersion: 1 },
    locate: (path) => ({ ...fileLocation(directory.id, 'sources.json'), field: path.join('.') || '$' }),
  };
  const data = metadata.draft ? parseSchema(draftSourcesSchema, sourceData) : parseSchema(sourcesSchema, sourceData);
  return { directory, metadata, metadataData: parsed.frontMatter, data, sourceData, document: parsed.document };
}
