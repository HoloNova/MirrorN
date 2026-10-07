import type { ReactNode } from 'react';
import { Links, Meta, Outlet, Scripts, useRouteLoaderData, useRouteError, isRouteErrorResponse, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { siteConfig } from '../config/site.ts';
import { loadSiteData } from './content/site.server.ts';
import SiteHeader from './components/site/SiteHeader';
import NotFound from './routes/not-found';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/prose.css';
import './styles/site.css';
import './styles/search.css';
import './styles/resource-components.css';

export async function loader({ request }: LoaderFunctionArgs) { return loadSiteData(request); }
export const meta: MetaFunction<typeof loader> = ({ loaderData: data }) => {
  const seo = data?.seo ?? { title: siteConfig.siteName, canonical: null, image: null, description: undefined, pageType: 'website' };
  return [
    { title: seo.title }, ...(!seo.canonical ? [{ name: 'robots', content: 'noindex' }] : [{ tagName: 'link' as const, rel: 'canonical', href: seo.canonical }]),
    ...(seo.description ? [{ name: 'description', content: seo.description }, { property: 'og:description', content: seo.description }] : []),
    { property: 'og:title', content: seo.title }, { property: 'og:site_name', content: siteConfig.siteName }, { property: 'og:type', content: seo.pageType },
    ...(seo.canonical ? [{ property: 'og:url', content: seo.canonical }] : []), ...(seo.image ? [{ property: 'og:image', content: seo.image }] : []),
    { name: 'twitter:card', content: seo.image ? 'summary_large_image' : 'summary' },
  ];
};
// 固定本站代码，仅在首绘前恢复配色；绝不从资源文档或查询生成脚本。
const themeBootstrap = `(function(){try{const t=localStorage.getItem('mirrorn-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch{}})();`;
export function Layout({ children }: { children: ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  return <html lang="zh-CN" suppressHydrationWarning><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><Meta /><Links /><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
    <body><a className="skip-link" href="#main-content">跳到正文</a><SiteHeader pathname={data?.pathname ?? '/'} /><main className="page-main" id="main-content" tabIndex={-1}><div className="page-container">{children}</div></main><Scripts /></body>
  </html>;
}
export default function Root() { return <Outlet />; }
export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <section className="reading-page error-page"><h1>页面暂时无法显示</h1><p>内容加载失败。请稍后重试，或返回首页浏览其他资源。</p><a className="page-action" href="/">返回首页</a></section>;
}
