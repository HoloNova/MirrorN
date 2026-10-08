import { useRouteLoaderData } from 'react-router';
import type { loader } from '../root';
import ResourceSearch from '../components/site/ResourceSearch';
/** 搜索是首页主体；整理说明独立于检索状态，不影响加载、失败或结果反馈。 */
export default function Home() {
  const data = useRouteLoaderData<typeof loader>('root');
  return <div className="home">
    <h1 className="visually-hidden">搜索资源</h1>
    {data && <ResourceSearch {...data.search} />}
    <p className="home__note">正在整理开发工具下载与入门文档。</p>
  </div>;
}
