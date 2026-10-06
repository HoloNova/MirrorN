<script setup lang="ts">
import { CuratedLinkSchema, type CuratedLink } from '@mirrorn/shared';
import ContentForm from './ContentForm.vue';
import { type ContentField } from '../../lib/curationFields';
import { getCatalog } from '../../lib/ecosystems';
const props = defineProps<{ links: CuratedLink[] }>();
const emit = defineEmits<{ change: [links: CuratedLink[]] }>();
const mirrors = getCatalog().mirrors;
const fields: ContentField[] = [
  { key: 'label', label: '来源名称', placeholder: '官方 / 清华 / 北大' },
  {
    key: 'siteId',
    label: '已有站点（可选，用于复用测速）',
    kind: 'select',
    options: [
      { value: '', label: '自定义来源（无测速）' },
      ...mirrors.map((mirror) => ({ value: mirror.id, label: mirror.name })),
    ],
  },
  { key: 'url', label: '确切链接', placeholder: 'https://...', maxLength: 4096 },
  { key: 'checkedAt', label: '人工核查日期（可选）', kind: 'date' },
  { key: 'note', label: '备注', kind: 'textarea' },
  { key: 'enabled', label: '启用这个来源', kind: 'checkbox' },
];
function update(id: string, value: Record<string, unknown>) {
  emit(
    'change',
    props.links.map((link) => (link.id === id ? (value as CuratedLink) : link)),
  );
}
function add() {
  emit('change', [
    ...props.links,
    CuratedLinkSchema.parse({ id: `source-${crypto.randomUUID()}` }),
  ]);
}
</script>
<template>
  <section class="source-editor">
    <div class="content-section-heading">
      <h3>来源链接</h3>
      <button type="button" @click="add">添加来源</button>
    </div>
    <p class="hint">这里的每个链接必须提供同一个文件或入口，不把不同平台的包填成备用来源。</p>
    <div v-for="(link, index) in links" :key="link.id" class="content-entry">
      <div class="content-section-heading">
        <strong>来源 {{ index + 1 }}</strong
        ><button
          type="button"
          @click="
            emit(
              'change',
              links.filter((item) => item.id !== link.id),
            )
          "
        >
          移除来源
        </button>
      </div>
      <ContentForm
        :model="link"
        :fields="fields"
        :prefix="link.id"
        @change="update(link.id, $event)"
      />
    </div>
    <p v-if="!links.length" class="hint">
      尚未填写来源。文件、目录或仓库入口发布时至少需要一个启用链接。
    </p>
  </section>
</template>
