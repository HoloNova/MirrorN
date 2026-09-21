<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { HELP_DOCUMENTS } from '../help/documents';
import { renderMarkdown } from '../lib/markdown';

/**
 * 帮助：站内说明，正文是 Markdown（渲染器与安全边界见 `lib/markdown.ts`）。
 *
 * 版面：左侧文档目录（与生态文档同一套 `.docs` 栅格），右侧正文。
 * 行宽上限是相对量（--measure-prose），容器本身跟随视口。
 *
 * `v-html` 在这里是安全的：渲染器先整体转义、再插入它自己拼出的标签，正文里写不出可执行内容。
 */
const route = useRoute();

const documents = HELP_DOCUMENTS;
const currentIndex = computed(() => {
  const id = String(route.params.id ?? '');
  const found = documents.findIndex((document) => document.id === id);
  return found === -1 ? 0 : found;
});
const current = computed(() => documents[currentIndex.value]);
const html = computed(() => (current.value ? renderMarkdown(current.value.body) : ''));
</script>

<template>
  <div class="shell-inner">
    <div class="page is-single">
      <div class="page-main">
        <div class="page-head">
          <h1>帮助</h1>
          <span class="stamp num">{{ documents.length }} 篇</span>
        </div>

        <div class="docs">
          <nav class="toc" aria-label="帮助文档">
            <RouterLink
              v-for="(document, index) in documents"
              :key="document.id"
              :to="{ name: 'help', params: { id: document.id } }"
              :aria-current="index === currentIndex ? 'true' : undefined"
            >
              <span class="toc-no num">{{ String(index + 1).padStart(2, '0') }}</span>
              <span>{{ document.title }}</span>
            </RouterLink>
          </nav>

          <article v-if="current" class="doc-body markdown">
            <!-- eslint-disable-next-line vue/no-v-html -- 内容来自仓库内的帮助文档，渲染器已整体转义 -->
            <div v-html="html"></div>

            <p class="footline">
              <span>需要更广的系统与软件源说明时，可以看外部帮助。</span>
              <a href="https://help.mirrors.cernet.edu.cn/" target="_blank" rel="noopener">
                MirrorZ 帮助文档 ↗
              </a>
            </p>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>
