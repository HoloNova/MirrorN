import { createRouter, createWebHashHistory } from 'vue-router';

import ResourcePage from './pages/ResourcePage.vue';
import HelpPage from './pages/HelpPage.vue';
import CuratedEcosystemPage from './pages/CuratedEcosystemPage.vue';
import CuratedEcosystemsPage from './pages/CuratedEcosystemsPage.vue';
import HomePage from './pages/HomePage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';

/**
 * 使用 hash 模式：静态托管时不需要为每个路径配置回退规则，
 * 这也是阶段 6 计划交付的纯静态部署方式。原因记录在 docs/decisions.md。
 *
 * `meta.layout` 决定外壳形态（见 App.vue / styles/shell.css）：
 *   'app'  左侧导航：首页、生态、帮助、内容管理
 *   'doc'  顶栏：文档类页面（自带页内目录栏，不再叠一列全局导航）
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/sites', name: 'sites', redirect: { name: 'ecosystems' } },
    { path: '/sites/:id', name: 'site', redirect: { name: 'ecosystems' } },
    { path: '/ecosystems', name: 'ecosystems', component: CuratedEcosystemsPage },
    { path: '/admin', name: 'admin', component: () => import('./pages/AdminPage.vue') },
    {
      path: '/admin/ecosystems/:id',
      name: 'admin-editor',
      component: () => import('./pages/AdminEditorPage.vue'),
      props: true,
    },
    { path: '/software/:id', name: 'software', component: ResourcePage, props: true },
    {
      path: '/resources/:id',
      name: 'resource',
      component: ResourcePage,
      props: (route) => ({ id: String(route.params.id), legacy: true }),
    },
    { path: '/ecosystems/:id', name: 'ecosystem', component: CuratedEcosystemPage, props: true },
    { path: '/help/:id?', name: 'help', component: HelpPage },
    // 旧地址：资源页上线前的教程页与生态文档页，保留跳转不让外链失效。
    {
      path: '/tutorials/miniconda',
      redirect: { name: 'resource', params: { id: 'pku:anaconda' } },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
