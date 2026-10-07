import { useRouteLoaderData } from 'react-router';
import type { loader } from '../root';
import ResourceSearch from '../components/site/ResourceSearch';
/** 首页只有搜索：标题仅供辅助技术定位页面，视觉上不重复“搜索”二字。 */
export default function Home() {
  const data = useRouteLoaderData<typeof loader>('root');
  return <div className="home"><h1 className="visually-hidden">搜索资源</h1>{data && <ResourceSearch {...data.search} />}</div>;
}
