<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import {
  CuratedDocumentSchema,
  CuratedComponentSchema,
  CuratedVersionSchema,
  CuratedResourceSchema,
  CuratedDependencySchema,
  CuratedTutorialSchema,
  type CuratedDocument,
  type CuratedRecord,
  type CuratedResource,
  type CuratedTutorial,
} from '@mirrorn/shared';
import { adminSession, adminList, curationRequest, type AdminSummary } from '../lib/curationApi';
import { basicFields, sectionFields, sections, type Section } from '../lib/curationFields';
import ContentForm from '../components/curation/ContentForm.vue';
import SourceLinks from '../components/curation/SourceLinks.vue';
import EcosystemDocument from '../components/curation/EcosystemDocument.vue';
import SafeMarkdown from '../components/curation/SafeMarkdown.vue';

const props = defineProps<{ id: string }>();
const record = ref<CuratedRecord>();
const document = ref<CuratedDocument>();
const baseline = ref('');
const others = ref<AdminSummary[]>([]);
const section = ref<'basic' | Section>('basic');
const selected = ref('');
const preview = ref<CuratedDocument>();
const showPreview = ref(false);
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const message = ref('');
const dirty = computed(() => !!document.value && JSON.stringify(document.value) !== baseline.value);
const rows = computed(() =>
  section.value === 'basic' ? [] : (document.value?.[section.value] ?? []),
);
const entry = computed(() => rows.value.find((row) => row.id === selected.value));
const resource = computed(() =>
  section.value === 'resources' ? (entry.value as CuratedResource | undefined) : undefined,
);
const tutorial = computed(() =>
  section.value === 'tutorials' ? (entry.value as CuratedTutorial | undefined) : undefined,
);
const basePath = computed(() => `/admin/ecosystems/${encodeURIComponent(props.id)}`);
const fields = computed(() => {
  if (!document.value || section.value === 'basic' || !entry.value) return [];
  const componentId = 'componentId' in entry.value ? entry.value.componentId : '';
  const dynamic = {
    componentId: [
      { value: '', label: '生态自身' },
      ...document.value.components.map((part) => ({ value: part.id, label: part.name || part.id })),
    ],
    versionId: [
      { value: '', label: '无独立版本' },
      ...document.value.versions
        .filter((v) => v.componentId === componentId)
        .map((v) => ({ value: v.id, label: v.version || v.id })),
    ],
    versionIds: document.value.versions
      .filter((v) => v.componentId === componentId)
      .map((v) => ({ value: v.id, label: v.version || v.id })),
    resourceIds: document.value.resources.map((r) => ({ value: r.id, label: r.title || r.id })),
    targetEcosystemId: [
      { value: '', label: '只填写说明，不关联生态' },
      ...others.value
        .filter((e) => e.id !== props.id)
        .map((e) => ({
          value: e.id,
          label: `${e.name}${e.state === 'published' ? '' : '（未发布）'}`,
        })),
    ],
  };
  return sectionFields[section.value].map((field) => ({
    ...field,
    options: dynamic[field.key as keyof typeof dynamic] ?? field.options,
  }));
});
function accept(value: CuratedRecord) {
  record.value = value;
  document.value = value.document;
  baseline.value = JSON.stringify(value.document);
}
function updateBasic(value: Record<string, unknown>) {
  document.value = value as CuratedDocument;
  showPreview.value = false;
}
function updateEntry(value: Record<string, unknown>) {
  if (!document.value || section.value === 'basic') return;
  const previous = entry.value;
  const componentChanged =
    previous && 'componentId' in previous && previous.componentId !== value.componentId;
  const next = componentChanged
    ? {
        ...value,
        ...('versionId' in value ? { versionId: '' } : {}),
        ...('versionIds' in value ? { versionIds: [] } : {}),
      }
    : value;
  document.value = {
    ...document.value,
    [section.value]: document.value[section.value].map((row) => (row.id === value.id ? next : row)),
  };
  showPreview.value = false;
}
function addEntry() {
  if (!document.value || section.value === 'basic') return;
  const schemas = {
    components: CuratedComponentSchema,
    versions: CuratedVersionSchema,
    resources: CuratedResourceSchema,
    dependencies: CuratedDependencySchema,
    tutorials: CuratedTutorialSchema,
  };
  const id = `entry-${crypto.randomUUID()}`;
  const next = schemas[section.value].parse({ id });
  document.value = { ...document.value, [section.value]: [...document.value[section.value], next] };
  selected.value = id;
  showPreview.value = false;
}
function removeDraft() {
  if (!document.value || section.value === 'basic' || entry.value?.status !== 'draft') return;
  if (!window.confirm('移除此草稿条目？如已有引用，需要先解除引用。')) return;
  document.value = {
    ...document.value,
    [section.value]: document.value[section.value].filter((row) => row.id !== selected.value),
  };
  selected.value = rows.value[0]?.id ?? '';
  showPreview.value = false;
}
function caption(row: typeof entry.value) {
  if (!row) return '';
  if ('title' in row) return row.title || '未命名';
  if ('version' in row) return row.version || '未填写版本';
  return row.name || '未命名';
}
async function load() {
  loading.value = true;
  error.value = '';
  record.value = undefined;
  document.value = undefined;
  showPreview.value = false;
  selected.value = '';
  section.value = 'basic';
  try {
    const id = props.id;
    const path = basePath.value;
    await adminSession();
    const [value, list] = await Promise.all([curationRequest<CuratedRecord>(path), adminList()]);
    if (props.id === id) {
      accept(value);
      others.value = list;
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取失败';
  } finally {
    loading.value = false;
  }
}
async function run(task: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  message.value = '';
  try {
    await adminSession();
    await task();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!document.value || !record.value) throw new Error('编辑稿尚未加载');
  if (!dirty.value) return;
  const parsed = CuratedDocumentSchema.safeParse(document.value);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
    );
  accept(
    await curationRequest<CuratedRecord>(basePath.value, {
      method: 'PUT',
      body: { revision: record.value.revision, document: parsed.data },
    }),
  );
}
function saveDraft() {
  void run(async () => {
    await save();
    message.value = '编辑稿已保存，公开页面未改变。';
  });
}
function previewDraft() {
  void run(async () => {
    await save();
    preview.value = await curationRequest<CuratedDocument>(`${basePath.value}/preview`);
    showPreview.value = true;
  });
}
function publish() {
  void run(async () => {
    await save();
    accept(
      await curationRequest<CuratedRecord>(`${basePath.value}/publication`, {
        method: 'PUT',
        body: { revision: record.value!.revision, state: 'published' },
      }),
    );
    message.value = '已发布，搜索和生态页面已更新。';
  });
}
function disable() {
  if (!record.value || !window.confirm('停用整个生态？它将从公开搜索和列表隐藏，编辑稿仍保留。'))
    return;
  void run(async () => {
    await save();
    accept(
      await curationRequest<CuratedRecord>(`${basePath.value}/publication`, {
        method: 'PUT',
        body: { revision: record.value!.revision, state: 'disabled' },
      }),
    );
    message.value = '生态已停用，内容仍保留。';
  });
}
watch(section, () => {
  selected.value = rows.value[0]?.id ?? '';
});
watch(
  () => props.id,
  () => void load(),
);
function canLeave() {
  return !busy.value && (!dirty.value || window.confirm('还有未保存的编辑，确定离开？'));
}
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  void load();
});
onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload));
</script>
<template>
  <div class="shell-inner content-page">
    <RouterLink class="crumbs" :to="{ name: 'admin' }">返回内容管理</RouterLink>
    <div class="content-section-heading">
      <div>
        <h1>{{ document?.name || '编辑生态' }}</h1>
        <p class="hint">
          {{ id }} · {{ dirty ? '有未保存修改' : '编辑稿已保存'
          }}<template v-if="record">
            · 修订 {{ record.revision }} ·
            {{
              record.state === 'published'
                ? '对外已发布'
                : record.state === 'disabled'
                  ? '对外已停用'
                  : '尚未发布'
            }}</template
          >
        </p>
      </div>
      <RouterLink
        v-if="record?.state === 'published'"
        :to="{ name: 'ecosystem', params: { id } }"
        target="_blank"
        >查看公开页面</RouterLink
      >
    </div>
    <p v-if="loading" class="hint">加载编辑稿…</p>
    <p v-if="error" class="content-error" role="alert">{{ error }}</p>
    <p v-if="message" class="content-success" role="status">{{ message }}</p>
    <template v-if="document && record">
      <div class="content-actions">
        <button :disabled="busy" @click="saveDraft">{{ busy ? '处理中…' : '保存编辑稿' }}</button>
        <button :disabled="busy" @click="previewDraft">保存并预览</button>
        <button class="primary" :disabled="busy" @click="publish">保存并发布</button>
        <button v-if="record.state === 'published'" :disabled="busy" @click="disable">
          停用生态
        </button>
      </div>
      <p class="hint">
        条目标记“发布时收录”后，点击“保存并发布”才公开。未完成的条目保持草稿；停用不会删除记录。
      </p>
      <template v-if="showPreview && preview">
        <div class="content-section-heading">
          <h2>发布预览（尚未公开）</h2>
          <button @click="showPreview = false">返回编辑</button>
        </div>
        <EcosystemDocument :document="preview" :preview="true" />
      </template>
      <fieldset v-else :disabled="busy" class="content-editor">
        <nav class="content-tabs" aria-label="编辑分区">
          <button
            v-for="tab in sections"
            :key="tab.key"
            type="button"
            :aria-current="section === tab.key ? 'page' : undefined"
            @click="section = tab.key"
          >
            {{ tab.label }} <small v-if="tab.key !== 'basic'">{{ document[tab.key].length }}</small>
          </button>
        </nav>
        <ContentForm
          v-if="section === 'basic'"
          :model="document"
          :fields="basicFields"
          prefix="ecosystem"
          @change="updateBasic"
        />
        <template v-else>
          <div class="content-section-heading">
            <h2>{{ sections.find((tab) => tab.key === section)?.label }}</h2>
            <button type="button" @click="addEntry">添加条目</button>
          </div>
          <p v-if="!rows.length" class="hint">
            尚未整理此部分。生态自身不需要重复新建组成项；没有独立版本的入口也不必填写版本。
          </p>
          <div v-else class="content-workspace">
            <nav class="content-entry-list" aria-label="条目">
              <button
                v-for="row in rows"
                :key="row.id"
                type="button"
                :aria-current="selected === row.id ? 'page' : undefined"
                @click="selected = row.id"
              >
                <strong>{{ caption(row) }}</strong
                ><small>{{
                  row.status === 'published'
                    ? '发布时收录'
                    : row.status === 'disabled'
                      ? '停用'
                      : '草稿'
                }}</small>
              </button>
            </nav>
            <div v-if="entry" class="content-entry-body">
              <ContentForm
                :model="entry"
                :fields="fields"
                :prefix="entry.id"
                @change="updateEntry"
              />
              <SourceLinks
                v-if="resource"
                :links="resource.links"
                @change="updateEntry({ ...resource, links: $event })"
              />
              <section v-if="tutorial" class="content-markdown-editor">
                <label :for="`${tutorial.id}-markdown`">Markdown 正文</label>
                <textarea
                  :id="`${tutorial.id}-markdown`"
                  :value="tutorial.markdown"
                  rows="18"
                  maxlength="100000"
                  spellcheck="false"
                  @input="
                    updateEntry({
                      ...tutorial,
                      markdown: ($event.target as HTMLTextAreaElement).value,
                    })
                  "
                />
                <details>
                  <summary>正文预览</summary>
                  <SafeMarkdown :source="tutorial.markdown" />
                </details>
              </section>
              <button
                v-if="entry.status === 'draft'"
                type="button"
                class="content-remove"
                @click="removeDraft"
              >
                移除草稿条目
              </button>
            </div>
          </div>
        </template>
      </fieldset>
    </template>
    <RouterLink v-else-if="!loading" :to="{ name: 'admin' }">返回登录或重新加载</RouterLink>
  </div>
</template>
