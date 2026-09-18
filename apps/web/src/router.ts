import { createRouter, createWebHashHistory } from 'vue-router';

import EcosystemPage from './pages/EcosystemPage.vue';
import HomePage from './pages/HomePage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';

/**
 * 使用 hash 模式：静态托管时不需要为每个路径配置回退规则，
 * 这也是阶段 6 计划交付的纯静态部署方式。原因记录在 docs/decisions.md。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/ecosystems/:id', name: 'ecosystem', component: EcosystemPage, props: true },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
