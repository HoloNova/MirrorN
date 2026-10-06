export interface FieldOption {
  value: string;
  label: string;
}
export interface ContentField {
  key: string;
  label: string;
  kind?: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi' | 'checkbox';
  options?: FieldOption[];
  hint?: string;
  placeholder?: string;
  maxLength?: number;
}
const options = (pairs: string[][]): FieldOption[] =>
  pairs.map(([value, label]) => ({ value: value!, label: label! }));
export const stateOptions = options([
  ['draft', '草稿（不公开）'],
  ['published', '发布时收录'],
  ['disabled', '停用（不公开）'],
]);
export const platformOptions = options([
  ['any', '通用'],
  ['windows', 'Windows'],
  ['macos', 'macOS'],
  ['linux', 'Linux'],
  ['android', 'Android'],
  ['freebsd', 'FreeBSD'],
]);
const status: ContentField = {
  key: 'status',
  label: '条目状态',
  kind: 'select',
  options: stateOptions,
  hint: '更改后先保存，再发布生态才会对外生效。',
};
const position: ContentField = {
  key: 'order',
  label: '展示顺序',
  kind: 'number',
  hint: '数字小的排在前面。',
};
export const basicFields: ContentField[] = [
  { key: 'name', label: '生态名称' },
  { key: 'summary', label: '简介', kind: 'textarea' },
  { key: 'aliases', label: '搜索别名', maxLength: 4000, hint: '用英文逗号分隔，如 node, node.js' },
  {
    key: 'category',
    label: '分类',
    kind: 'select',
    options: options([
      ['language', '语言与运行环境'],
      ['distro', '操作系统'],
      ['package-index', '包仓库'],
      ['toolchain', '工具链'],
      ['dataset', '数据资源'],
      ['other', '其他'],
    ]),
  },
];
export type Section = 'components' | 'versions' | 'resources' | 'dependencies' | 'tutorials';
export const sections: { key: 'basic' | Section; label: string }[] = [
  { key: 'basic', label: '基本信息' },
  { key: 'components', label: '组成项' },
  { key: 'versions', label: '版本与推荐' },
  { key: 'resources', label: '资源与来源' },
  { key: 'dependencies', label: '依赖关系' },
  { key: 'tutorials', label: '教程' },
];
export const sectionFields: Record<Section, ContentField[]> = {
  components: [
    { key: 'name', label: '组成项名称' },
    { key: 'description', label: '说明', kind: 'textarea' },
    {
      key: 'kind',
      label: '类型',
      kind: 'select',
      options: options([
        ['software', '软件'],
        ['tool', '工具'],
        ['module', '模块'],
      ]),
    },
    status,
  ],
  versions: [
    { key: 'componentId', label: '所属组成项', kind: 'select' },
    { key: 'version', label: '具体版本号', placeholder: '24.1.0' },
    { key: 'branch', label: '支线', placeholder: '24.x' },
    { key: 'channel', label: '发行类型', placeholder: 'LTS / 稳定版 / 预览版' },
    {
      key: 'recommendation',
      label: '推荐用途',
      kind: 'select',
      options: options([
        ['none', '普通版本'],
        ['default', '默认推荐'],
        ['compatible', '课程或旧项目兼容'],
      ]),
    },
    {
      key: 'reason',
      label: '推荐理由／适用场景',
      kind: 'textarea',
      hint: '推荐版本必须说明理由；课程兼容请写清课程或项目。',
    },
    { key: 'releasedAt', label: '发布日期（可选）', kind: 'date' },
    { key: 'eolAt', label: '支持截止日期（可选）', kind: 'date' },
    position,
    status,
  ],
  resources: [
    { key: 'title', label: '资源名称' },
    { key: 'componentId', label: '所属组成项', kind: 'select' },
    { key: 'versionId', label: '对应版本', kind: 'select', hint: '没有独立版本的资源可不关联。' },
    {
      key: 'kind',
      label: '入口类型',
      kind: 'select',
      options: options([
        ['file', '下载文件'],
        ['directory', '浏览目录'],
        ['repository', '仓库／配置入口'],
      ]),
    },
    {
      key: 'platform',
      label: '平台',
      kind: 'select',
      options: [{ value: '', label: '未指定' }, ...platformOptions],
    },
    { key: 'arch', label: '架构', placeholder: 'x64 / arm64 / any' },
    { key: 'format', label: '文件格式', placeholder: 'msi / exe / tar.gz / iso' },
    { key: 'filename', label: '文件名（可选）' },
    { key: 'sizeBytes', label: '大小（字节，可选）', kind: 'number' },
    { key: 'sha256', label: 'SHA256（可选）' },
    position,
    status,
  ],
  dependencies: [
    { key: 'name', label: '依赖名称' },
    { key: 'targetEcosystemId', label: '关联已整理生态（可选）', kind: 'select' },
    { key: 'componentId', label: '谁需要这个依赖', kind: 'select' },
    { key: 'requirement', label: '版本要求／安装条件', placeholder: '例如 >= 18，或由安装器自带' },
    { key: 'versionIds', label: '适用版本（不选代表全部）', kind: 'multi' },
    {
      key: 'platforms',
      label: '适用平台（不选代表全部）',
      kind: 'multi',
      options: platformOptions,
    },
    { key: 'optional', label: '可选依赖', kind: 'checkbox' },
    { key: 'note', label: '使用说明', kind: 'textarea' },
    status,
  ],
  tutorials: [
    { key: 'title', label: '教程标题' },
    { key: 'summary', label: '简介', kind: 'textarea' },
    { key: 'componentId', label: '所属组成项', kind: 'select' },
    { key: 'versionIds', label: '适用版本（不选代表全部）', kind: 'multi' },
    {
      key: 'platforms',
      label: '适用平台（不选代表全部）',
      kind: 'multi',
      options: platformOptions,
    },
    { key: 'resourceIds', label: '关联资源', kind: 'multi' },
    position,
    status,
  ],
};
