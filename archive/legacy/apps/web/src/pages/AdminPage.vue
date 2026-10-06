<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { AdminSession } from '@mirrorn/shared';
import {
  adminSession,
  adminLogin,
  adminLogout,
  adminList,
  curationRequest,
  exportContent,
  CurationApiError,
  type AdminSummary,
} from '../lib/curationApi';
const router = useRouter();
const session = ref<AdminSession>();
const items = ref<AdminSummary[]>([]);
const username = ref('');
const password = ref('');
const name = ref('');
const id = ref('');
const busy = ref(false);
const loading = ref(true);
const error = ref('');
const states = { draft: '草稿', published: '已发布', disabled: '已停用' };
async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    session.value = await adminSession();
    items.value = await adminList();
  } catch (cause) {
    if (!(cause instanceof CurationApiError && cause.status === 401))
      error.value = cause instanceof Error ? cause.message : '读取失败';
  } finally {
    loading.value = false;
  }
}
async function action(task: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  try {
    await task();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败';
    if (cause instanceof CurationApiError && cause.status === 401) session.value = undefined;
  } finally {
    busy.value = false;
  }
}
function login() {
  void action(async () => {
    session.value = await adminLogin(username.value, password.value);
    password.value = '';
    items.value = await adminList();
  });
}
function logout() {
  void action(async () => {
    await adminLogout();
    session.value = undefined;
    items.value = [];
  });
}
function create() {
  void action(async () => {
    await curationRequest('/admin/ecosystems', {
      method: 'POST',
      body: { id: id.value, name: name.value },
    });
    await router.push({ name: 'admin-editor', params: { id: id.value } });
  });
}
onMounted(() => void refresh());
</script>
<template>
  <div class="shell-inner content-page">
    <div class="content-section-heading">
      <div>
        <h1>内容管理</h1>
        <p class="hint">手动整理生态，审核后发布。不导入镜像站库存。</p>
      </div>
      <button v-if="session" :disabled="busy" @click="logout">退出 {{ session.username }}</button>
    </div>
    <p v-if="error" class="content-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="hint">检查管理会话…</p>
    <form v-else-if="!session" class="content-login" @submit.prevent="login">
      <h2>维护者登录</h2>
      <p class="hint">
        首次使用，在项目根目录执行 <code>pnpm admin:setup</code> 设置账号。没有默认密码。
      </p>
      <fieldset :disabled="busy" class="content-fields">
        <label
          >用户名<input v-model="username" autocomplete="username" required maxlength="80"
        /></label>
        <label
          >密码<input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="256"
        /></label>
        <button type="submit">{{ busy ? '登录中…' : '登录' }}</button>
      </fieldset>
    </form>
    <template v-else>
      <form class="content-create" @submit.prevent="create">
        <h2>新建生态</h2>
        <fieldset :disabled="busy" class="content-fields">
          <label
            >名称<input v-model="name" required maxlength="200" placeholder="例如 Node.js"
          /></label>
          <label
            >唯一标识<input
              v-model="id"
              required
              maxlength="80"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="例如 nodejs"
            /><small class="hint">小写英文、数字和短横线，创建后不修改。</small></label
          >
          <button type="submit">创建编辑稿</button>
        </fieldset>
      </form>
      <div class="content-section-heading">
        <h2>
          已整理生态 <small>{{ items.length }}</small>
        </h2>
        <button
          :disabled="busy"
          @click="
            action(async () => {
              await exportContent();
            })
          "
        >
          导出全部内容
        </button>
      </div>
      <p v-if="!items.length" class="hint">
        还没有生态。从上面的表单创建第一个，草稿不会出现在公开搜索中。
      </p>
      <div class="content-list">
        <RouterLink
          v-for="item in items"
          :key="item.id"
          :to="{ name: 'admin-editor', params: { id: item.id } }"
          class="content-list-row"
        >
          <span
            ><strong>{{ item.name }}</strong
            ><small>{{ item.id }}</small></span
          >
          <span
            >{{ states[item.state]
            }}<small v-if="item.state === 'published' && item.revision !== item.publishedRevision"
              >有未发布修改</small
            ></span
          >
          <span>编辑</span>
        </RouterLink>
      </div>
      <p class="hint">
        JSON导出包含编辑稿和发布稿，不含登录凭据。完整数据库备份：<code
          >pnpm content:backup backups/content.sqlite</code
        >
      </p>
    </template>
  </div>
</template>
