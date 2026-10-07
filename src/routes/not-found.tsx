export default function NotFound() {
  return <section className="reading-page error-page" aria-labelledby="error-title"><p className="error-page__code">404</p><h1 id="error-title">页面不存在</h1><p className="page-lede">这个地址没有对应页面，也可能内容已经被移除。可以从首页搜索，或按分类查找资源。</p><div className="page-actions"><a className="page-action" href="/">返回首页</a><a className="page-action" href="/resources/">查看已收录</a></div></section>;
}
