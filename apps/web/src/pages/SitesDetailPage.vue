<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { getCatalog } from '../lib/ecosystems';
import { findSiteRow, listSiteRows } from '../lib/sites';

/**
 * 站点详情：**静态信息**，不测速、不显示同步状态。
 *
 * 为什么这样切：一个镜像站的同步状态是按生态（上游作业）分开的，放在站点页只能挑一条显示，
 * 反而误导；延迟要在真正决定换源时测，站点页没有这个决策场景。
 * 详情页回答的是另外三个问题：这是谁、它提供哪些仓库、数据是从哪核对的。
 *
 * 仓库地址直接取自 `data/ecosystems/*.json` 的 supports[].repositoryUrl，不是手写的第二份，
 * 因此和生成命令用的是同一份事实。
 */
const route = useRoute();
const catalog = getCatalog();
const rows = listSiteRows(catalog);

const site = computed(() => findSiteRow(rows, String(route.params.id ?? '')));
const checkedAt = computed(() => {
  const dates = (site.value?.sources ?? [])
    .map((source) => source.checkedAt)
    .filter((value): value is string => value !== undefined);
  return dates.length === 0 ? undefined : [...dates].sort().at(-1);
});

/** 展示用域名：完整 URL 在下方表格里逐条给出。 */
function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

const ecosystemName = (id: string): string =>
  catalog.ecosystems.find((ecosystem) => ecosystem.id === id)?.name ?? id;
</script>

<template>
  <div class="shell-inner">
    <div v-if="site" class="page">
      <div class="page-main">
        <RouterLink class="crumbs" :to="{ name: 'sites' }">← 收录的镜像站</RouterLink>

        <div class="page-head site-head">
          <h1>
            {{ site.name }}
            <span class="kind">{{ site.kindLabel }}</span>
          </h1>
          <span v-if="checkedAt" class="stamp num">数据核对于 {{ checkedAt }}</span>
        </div>

        <dl class="kv wide">
          <div>
            <dt>官方地址</dt>
            <dd>
              <a :href="site.homepageUrl" target="_blank" rel="noopener">
                {{ domainOf(site.homepageUrl) }}
              </a>
            </dd>
          </div>
          <div>
            <dt>覆盖生态</dt>
            <dd>
              {{ site.ecosystems.length }} 个<span v-if="site.ecosystems.length > 0"
                >（{{ site.ecosystems.map((link) => ecosystemName(link.id)).join('、') }}）</span
              >
            </dd>
          </div>
          <div v-if="site.probeUrl">
            <dt>探针地址</dt>
            <dd class="num">{{ site.probeUrl }}</dd>
          </div>
          <div v-if="site.statusUrl">
            <dt>状态文件</dt>
            <dd class="num">{{ site.statusUrl }}</dd>
          </div>
        </dl>

        <section v-if="site.ecosystems.length > 0" class="site-section">
          <h2>能生成命令的仓库地址</h2>
          <div class="rows dir site-repos">
            <div class="row head">
              <span>生态</span>
              <span>仓库地址</span>
            </div>
            <RouterLink
              v-for="link in site.ecosystems"
              :key="link.id"
              class="row body"
              :to="{ name: 'ecosystem', params: { id: link.id } }"
            >
              <span class="row-name">
                <span class="text">{{ ecosystemName(link.id) }}</span>
              </span>
              <span class="row-url">{{ pathOf(link.repositoryUrl) }}</span>
            </RouterLink>
          </div>
          <p class="rows-note">
            <span>点生态名进入对应文档，那里有具体命令。</span>
            <span>本页不测速</span>
          </p>
        </section>
      </div>

      <div class="page-meta">
        <div v-if="site.sources.length > 0" class="meta-block">
          <h2>核对来源</h2>
          <ul class="src-list">
            <li v-for="source in site.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noopener">{{ pathOf(source.url) }}</a>
              <span v-if="source.note" class="hint">{{ source.note }}</span>
            </li>
          </ul>
        </div>

        <div class="meta-block">
          <h2>下一步</h2>
          <div class="eco-chips">
            <RouterLink
              v-for="link in site.ecosystems"
              :key="link.id"
              :to="{ name: 'ecosystem', params: { id: link.id } }"
            >
              {{ link.id }}
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="page">
      <div class="page-main">
        <div class="page-head">
          <h1>没有找到这个站点</h1>
          <span class="stamp">404</span>
        </div>
        <p class="hint">链接可能已经失效，或者该站点还没有加入数据目录。</p>
        <p class="rows-note">
          <span></span>
          <RouterLink class="btn" :to="{ name: 'sites' }">返回镜像站列表</RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
