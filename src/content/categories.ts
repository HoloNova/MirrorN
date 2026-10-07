/**
 * MAIN.md 第 4 节定义的八个单选主分类。
 *
 * 为什么在这里：分类是内容契约的一部分，顺序和名称必须全站一致（目录页、资源页、
 * 搜索索引都引用同一份数据）。P2 的资源 Schema 会引用这里的 id 校验 Front Matter，
 * 因此先落地这一份最小清单，而不是在每个页面各写一遍分类名。
 */
export const contentCategoryIds = [
  'software',
  'runtime',
  'package',
  'dataset',
  'model',
  'system',
  'container',
  'document',
] as const;

export type ContentCategoryId = (typeof contentCategoryIds)[number];

export interface ContentCategory {
  readonly id: ContentCategoryId;
  readonly name: string;
}

/** 数组顺序即站点展示顺序，不按数量或名称重排。 */
export const contentCategories: readonly ContentCategory[] = [
  { id: 'software', name: '软件／安装包' },
  { id: 'runtime', name: '运行时／SDK／工具链' },
  { id: 'package', name: '依赖／软件包' },
  { id: 'dataset', name: '数据集' },
  { id: 'model', name: '模型／权重' },
  { id: 'system', name: '系统／ISO／VM 镜像' },
  { id: 'container', name: '容器／开发环境' },
  { id: 'document', name: '文档／学习资源' },
];
