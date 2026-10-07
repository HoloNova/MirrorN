import { useRouteLoaderData } from 'react-router';
import type { loader } from '../root';
import ResourceSearch from '../components/site/ResourceSearch';
export default function Home() {
  const data = useRouteLoaderData<typeof loader>('root');
  return <div className="home"><header className="home__intro"><div><h1>找到资源，读懂用法。</h1><p className="page-lede">人工整理资源与使用文档，讲清来源、安装和适用条件。<br />由贡献者通过 Git 共同维护。</p></div>
    <svg className="home__document" aria-hidden="true" focusable="false" viewBox="0 0 160 136" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M32 15h66l24 24v77H32zM98 15v24h24" /><path d="M20 31H12v97h98v-5M45 57h61M45 71h61M45 85h38M45 99h27" /><circle cx="111" cy="97" r="16" /><path d="m123 110 15 15" /></svg>
  </header>{data && <ResourceSearch {...data.search} />}</div>;
}
