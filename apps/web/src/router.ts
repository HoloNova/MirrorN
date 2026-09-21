import { createRouter, createWebHashHistory } from 'vue-router';

import EcosystemPage from './pages/EcosystemPage.vue';
import HelpPage from './pages/HelpPage.vue';
import HomePage from './pages/HomePage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import SitesDetailPage from './pages/SitesDetailPage.vue';
import SitesPage from './pages/SitesPage.vue';

/**
 * 使用 hash 模式：静态托管时不需要为每个路径配置回退规则，
 * 这也是阶段 6 计划交付的纯静态部署方式。原因记录在 docs/decisions.md。
 *
 * `meta.layout` 决定外壳形态（见 App.vue / styles/shell.css）：
 *   'app'  左侧导航：首页、站点、帮助
 *   'doc'  顶栏：生态文档（文档自己有页内目录栏，不再叠一列全局导航）
 */ export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/sites', name: 'sites', component: SitesPage },
    { path: '/sites/:id', name: 'site', component: SitesDetailPage, props: true },
    { path: '/help/:id?', name: 'help', component: HelpPage },
    {
      path: '/ecosystems/:id',
      name: 'ecosystem',
      component: EcosystemPage,
      props: true,
      meta: { layout: 'doc' },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
