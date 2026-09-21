<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { getCatalog } from '../lib/ecosystems';
import { listSiteRows, matchesSiteQuery } from '../lib/sites';

/**
 * 站点：数据里收录的镜像站目录，一行一个站点。
 *
 * 这一页是**静态目录**：站点名、性质、官方地址（只显示域名）、覆盖的生态数（由数据算出来）。
 * 不放同步状态、不放延迟读数——同步状态属于具体生态（同一站点在不同生态上的作业是分开的），
 * 在生态文档里看才准确；延迟要在真正要换源时按需测量。
 *
 * 整行可点：点进去是静态详情页（有哪些仓库、数据从哪核对）。
 */
const catalog = getCatalog();
const rows = listSiteRows(catalog);

const query = ref('');
const visibleRows = computed(() => rows.filter((row) => matchesSiteQuery(row, query.value)));

/** 地址只显示域名：整条 URL 又长又重复，详情页里有完整地址。 */
function domainOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

const statusSourceCount = catalog.mirrors.filter((mirror) => mirror.statusSource).length;
const probeCount = catalog.mirrors.filter((mirror) => mirror.probe).length;
</script>

<template>
  <div class="shell-inner">
    <div class="page">
      <div class="page-main">
        <div class="search">
          <div class="search-field">
            <input
              v-model="query"
              type="search"
              placeholder="筛选站点、别名或系统"
              aria-label="筛选站点"
            />
          </div>
        </div>

        <div class="page-head">
          <h1>收录的镜像站</h1>
          <span class="stamp num">{{ visibleRows.length }} / {{ rows.length }} 个</span>
        </div>

        <p v-if="visibleRows.length === 0" class="hint">没有匹配的站点。</p>

        <div v-else class="rows dir">
          <div class="row head">
            <span>站点</span>
            <span>性质</span>
            <span>官方地址</span>
            <span class="row-count">生态</span>
          </div>

          <RouterLink
            v-for="row in visibleRows"
            :key="row.id"
            class="row body"
            :to="{ name: 'site', params: { id: row.id } }"
          >
            <span class="row-name">
              <span class="text">{{ row.name }}</span>
            </span>
            <span class="kind">{{ row.kindLabel }}</span>
            <span class="row-url">{{ domainOf(row.homepageUrl) }}</span>
            <span class="row-count">{{ row.ecosystems.length }}</span>
          </RouterLink>
        </div>

        <p class="rows-note">
          <span>只收录能生成换源命令的镜像站；没有公开仓库地址的站点不收录。</span>
          <span>站点名可直接点进详情</span>
        </p>
      </div>

      <div class="page-meta">
        <div class="meta-block">
          <h2>收录情况</h2>
          <dl class="kv">
            <div>
              <dt>镜像站</dt>
              <dd class="num">{{ rows.length }}</dd>
            </div>
            <div>
              <dt>覆盖生态</dt>
              <dd class="num">{{ catalog.ecosystems.length }}</dd>
            </div>
            <div>
              <dt>公开状态文件</dt>
              <dd class="num">{{ statusSourceCount }} 站</dd>
            </div>
            <div>
              <dt>探针地址</dt>
              <dd class="num">{{ probeCount }} 站</dd>
            </div>
          </dl>
        </div>

        <div class="meta-block">
          <h2>下一步</h2>
          <div class="eco-chips">
            <RouterLink
              v-for="ecosystem in catalog.ecosystems"
              :key="ecosystem.id"
              :to="{ name: 'ecosystem', params: { id: ecosystem.id } }"
            >
              {{ ecosystem.packageManager }}
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
