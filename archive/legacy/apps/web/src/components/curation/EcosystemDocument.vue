<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CuratedDocument } from '@mirrorn/shared';
import { platformOptions } from '../../lib/curationFields';
import SafeMarkdown from './SafeMarkdown.vue';
import { detectPlatform } from '../../lib/downloads';
import ResourceCard from './ResourceCard.vue';
const props = defineProps<{ document: CuratedDocument; fingerprint?: string; preview?: boolean }>();
const component = ref('');
const version = ref('');
const detected =
  typeof navigator === 'undefined' ? {} : detectPlatform(navigator.userAgent, navigator.platform);
const platform = ref(detected.os ?? '');
const versions = computed(() =>
  props.document.versions.filter((entry) => entry.componentId === component.value),
);
const applicable = (entry: { componentId: string; versionIds: string[]; platforms: string[] }) =>
  entry.componentId === component.value &&
  (!entry.versionIds.length || entry.versionIds.includes(version.value)) &&
  (!platform.value ||
    !entry.platforms.length ||
    entry.platforms.includes('any') ||
    entry.platforms.includes(platform.value));
const resources = computed(() =>
  props.document.resources.filter(
    (entry) =>
      entry.componentId === component.value &&
      (!entry.versionId || entry.versionId === version.value) &&
      (!platform.value ||
        !entry.platform ||
        entry.platform === 'any' ||
        entry.platform === platform.value),
  ),
);
const tutorials = computed(() => props.document.tutorials.filter(applicable));
const dependencies = computed(() => props.document.dependencies.filter(applicable));
const selectedVersion = computed(() => versions.value.find((entry) => entry.id === version.value));
const componentInfo = computed(() =>
  props.document.components.find((entry) => entry.id === component.value),
);
function scrollToResource(id: string) {
  window.document.getElementById(`resource-${id}`)?.scrollIntoView({ block: 'start' });
}
function chooseVersion() {
  version.value =
    versions.value.find((entry) => entry.recommendation === 'default')?.id ??
    versions.value[0]?.id ??
    '';
}
watch(component, chooseVersion);
watch(
  () => props.document,
  () => {
    component.value = '';
    chooseVersion();
  },
  { immediate: true },
);
</script>
<template>
  <div class="curated-document">
    <header>
      <h1>{{ document.name }}</h1>
      <p>{{ document.summary }}</p>
    </header>
    <div class="content-selectors">
      <label v-if="document.components.length"
        >组成项<select v-model="component">
          <option value="">{{ document.name }} 自身</option>
          <option v-for="entry in document.components" :key="entry.id" :value="entry.id">
            {{ entry.name }}
          </option>
        </select></label
      >
      <label v-if="versions.length"
        >版本<select v-model="version">
          <option v-for="entry in versions" :key="entry.id" :value="entry.id">
            {{ entry.version }}{{ entry.channel ? ` · ${entry.channel}` : ''
            }}{{
              entry.recommendation === 'default'
                ? ' · 推荐'
                : entry.recommendation === 'compatible'
                  ? ' · 兼容用途'
                  : ''
            }}
          </option>
        </select></label
      >
      <label
        >平台<select v-model="platform">
          <option value="">全部平台</option>
          <option v-for="option in platformOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select></label
      >
    </div>
    <p v-if="componentInfo?.description">{{ componentInfo.description }}</p>
    <section v-if="selectedVersion" class="content-version-note">
      <strong
        >{{ selectedVersion.version
        }}<template v-if="selectedVersion.branch"> · {{ selectedVersion.branch }}</template></strong
      >
      <p v-if="selectedVersion.reason">{{ selectedVersion.reason }}</p>
      <p v-if="selectedVersion.eolAt" class="hint">
        维护者记录的支持截止日期：{{ selectedVersion.eolAt }}
      </p>
    </section>
    <section v-if="dependencies.length" class="content-public-section">
      <h2>使用前需要</h2>
      <ul>
        <li v-for="dep in dependencies" :key="dep.id">
          <RouterLink
            v-if="dep.targetEcosystemId && !preview"
            :to="{ name: 'ecosystem', params: { id: dep.targetEcosystemId } }"
            >{{ dep.name }}</RouterLink
          ><strong v-else>{{ dep.name }}</strong> · {{ dep.optional ? '可选' : '必需'
          }}<template v-if="dep.requirement"> · {{ dep.requirement }}</template>
          <p v-if="dep.note">{{ dep.note }}</p>
        </li>
      </ul>
    </section>
    <section class="content-public-section">
      <h2>资源入口</h2>
      <ResourceCard
        v-for="entry in resources"
        :id="`resource-${entry.id}`"
        :key="entry.id"
        :resource="entry"
        :ecosystem-id="document.id"
        :fingerprint="fingerprint"
        :preview="preview"
      />
      <p v-if="!resources.length" class="hint">
        这个版本／平台还没有收录资源，可以查看教程或选择其他平台。
      </p>
    </section>
    <section v-if="tutorials.length" class="content-public-section">
      <h2>教程</h2>
      <details
        v-for="(entry, index) in tutorials"
        :key="entry.id"
        class="content-tutorial"
        :open="index === 0"
      >
        <summary>{{ entry.title }}</summary>
        <p v-if="entry.summary">{{ entry.summary }}</p>
        <SafeMarkdown :source="entry.markdown" />
        <ul v-if="resources.some((resource) => entry.resourceIds.includes(resource.id))">
          <li
            v-for="resource in resources.filter((resource) =>
              entry.resourceIds.includes(resource.id),
            )"
            :key="resource.id"
          >
            <button type="button" @click="scrollToResource(resource.id)">
              相关资源：{{ resource.title }}
            </button>
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>
