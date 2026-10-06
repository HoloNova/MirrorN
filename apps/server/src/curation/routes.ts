import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import {
  AdminLoginSchema,
  SaveCuratedSchema,
  PublicationSchema,
  type AdminSession,
} from '@mirrorn/shared';
import { AdminSessions, verifyCredential } from './auth.js';
import { CurationStore } from './store.js';
import { CurationError } from './publication.js';

const COOKIE = 'mirrorn_admin';
const COOKIE_PATH = '/api/admin';
async function jsonBody(context: Context): Promise<unknown> {
  if (!context.req.header('content-type')?.startsWith('application/json'))
    throw new CurationError('请使用 application/json 提交');
  try {
    return await context.req.json();
  } catch {
    throw new CurationError('请求不是有效 JSON');
  }
}
function sameOrigin(context: Context) {
  const origin = context.req.header('origin');
  if (!origin) return context.req.header('sec-fetch-site') !== 'cross-site';
  try {
    return new URL(origin).origin === new URL(context.req.url).origin;
  } catch {
    return false;
  }
}

export function registerCurationRoutes(app: Hono, store: CurationStore | undefined) {
  const publicApi = new Hono();
  let publicWindow = { at: 0, count: 0 };
  publicApi.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    if (!store) return context.json({ error: '人工内容库不可用' }, 503);
    const now = Date.now();
    publicWindow =
      now - publicWindow.at > 60000
        ? { at: now, count: 1 }
        : { ...publicWindow, count: publicWindow.count + 1 };
    if (publicWindow.count > 600) return context.json({ error: '请求过于频繁，请稍后重试' }, 429);
    return next();
  });
  publicApi.get('/ecosystems', (context) => {
    const query = context.req.query('q') ?? '';
    if (query.length > 200) return context.json({ error: '搜索内容过长' }, 400);
    return context.json({ data: store!.publicList(query) });
  });
  publicApi.get('/ecosystems/:id', (context) => {
    const doc = store!.publicGet(context.req.param('id'));
    return doc
      ? context.json({ data: doc })
      : context.json({ error: '这个生态尚未收录或已停用' }, 404);
  });
  app.route('/api/curated', publicApi);

  const sessions = new AdminSessions();
  const admin = new Hono<{ Variables: { session: AdminSession } }>();
  admin.use(
    '*',
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (context) => context.json({ error: '单次内容不能超过1MiB' }, 413),
    }),
  );
  admin.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    context.header('X-Content-Type-Options', 'nosniff');
    if (!store) return context.json({ error: '人工内容库不可用' }, 503);
    const unsafe = !['GET', 'HEAD'].includes(context.req.method);
    if (unsafe && !sameOrigin(context)) return context.json({ error: '拒绝跨站管理请求' }, 403);
    if (context.req.method === 'POST' && context.req.path === '/api/admin/session') {
      if (context.req.header('X-MirrorN-Admin') !== '1')
        return context.json({ error: '缺少管理请求标识' }, 403);
      return next();
    }
    const token = getCookie(context, COOKIE);
    const session = sessions.get(token, store.credential());
    if (!session)
      return context.json({ error: '请先登录管理后台', setupRequired: !store.credential() }, 401);
    if (unsafe && context.req.header('X-MirrorN-CSRF') !== session.csrf)
      return context.json({ error: '会话校验失败，请刷新后重试' }, 403);
    if (!sessions.allowRequest(token!))
      return context.json({ error: '操作过于频繁，请稍后重试' }, 429);
    context.set('session', session);
    return next();
  });
  admin.onError((error, context) => {
    if (error instanceof CurationError) return context.json({ error: error.message }, error.status);
    console.error('人工内容管理失败：', error);
    return context.json({ error: '保存服务异常，内容未提交，请稍后重试' }, 500);
  });
  admin.post('/session', async (context) => {
    if (!sessions.allowLogin()) return context.json({ error: '登录尝试过多，请一分钟后重试' }, 429);
    const input = AdminLoginSchema.safeParse(await jsonBody(context));
    if (!input.success) return context.json({ error: '请输入用户名和密码' }, 400);
    const credential = store!.credential();
    if (!credential)
      return context.json({ error: '尚未设置管理员，请在项目根目录执行 pnpm admin:setup' }, 503);
    if (!(await verifyCredential(credential, input.data.username, input.data.password)))
      return context.json({ error: '用户名或密码不正确' }, 401);
    sessions.revoke(getCookie(context, COOKIE));
    const { token, session, maxAge } = sessions.create(credential);
    setCookie(context, COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: COOKIE_PATH,
      secure: new URL(context.req.url).protocol === 'https:',
      maxAge,
    });
    return context.json({ data: session });
  });
  admin.get('/session', (context) => context.json({ data: context.get('session') }));
  admin.delete('/session', (context) => {
    sessions.revoke(getCookie(context, COOKIE));
    deleteCookie(context, COOKIE, { path: COOKIE_PATH });
    return context.body(null, 204);
  });
  admin.get('/export', (context) => {
    context.header('Content-Disposition', 'attachment; filename="mirrorn-content.json"');
    return context.json({ data: store!.export() });
  });
  admin.get('/ecosystems', (context) => context.json({ data: store!.list() }));
  admin.post('/ecosystems', async (context) =>
    context.json({ data: store!.create(await jsonBody(context)) }, 201),
  );
  admin.get('/ecosystems/:id', (context) =>
    context.json({ data: store!.get(context.req.param('id')) }),
  );
  admin.put('/ecosystems/:id', async (context) => {
    const input = SaveCuratedSchema.safeParse(await jsonBody(context));
    if (!input.success)
      throw new CurationError(
        input.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
      );
    return context.json({
      data: store!.save(context.req.param('id'), input.data.revision, input.data.document),
    });
  });
  admin.get('/ecosystems/:id/preview', (context) =>
    context.json({ data: store!.preview(context.req.param('id')) }),
  );
  admin.put('/ecosystems/:id/publication', async (context) => {
    const input = PublicationSchema.safeParse(await jsonBody(context));
    if (!input.success) throw new CurationError('请选择发布或停用，并提供当前修订号');
    return context.json({
      data: store!.publish(context.req.param('id'), input.data.revision, input.data.state),
    });
  });
  app.route('/api/admin', admin);
}
