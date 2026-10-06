import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';
import { CurationStore } from './store.js';
import { makeCredential } from './auth.js';

const stores: CurationStore[] = [];
async function fixture() {
  const store = new CurationStore(':memory:');
  stores.push(store);
  store.setCredential(await makeCredential('editor', 'test-password-for-fixture'));
  const app = createApp({ curated: store });
  const json = { 'Content-Type': 'application/json', 'X-MirrorN-Admin': '1' };
  const login = await app.request('/api/admin/session', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ username: 'editor', password: 'test-password-for-fixture' }),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const { data } = await login.json();
  const headers = { ...json, Cookie: cookie, 'X-MirrorN-CSRF': data.csrf };
  return { store, app, headers, cookie };
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

it('管理员手工保存、预览、原子发布、编辑隔离、停用；旧资源不会混入', async () => {
  const { app, headers } = await fixture();
  const created = await app.request('/api/admin/ecosystems', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 'nodejs', name: 'Node.js' }),
  });
  expect(created.status).toBe(201);
  let record = (await created.json()).data;
  expect((await (await app.request('/api/curated/ecosystems')).json()).data).toEqual([]);
  const doc = {
    ...record.document,
    summary: '手动整理',
    aliases: ['node'],
    versions: [
      {
        id: 'v24',
        componentId: '',
        version: '24.1.0',
        branch: '24.x',
        channel: 'LTS',
        recommendation: 'default',
        reason: '本教程使用',
        order: 0,
        releasedAt: '',
        eolAt: '',
        status: 'published',
      },
    ],
    resources: [
      {
        id: 'win',
        componentId: '',
        versionId: 'v24',
        title: 'Windows 安装器',
        kind: 'file',
        platform: 'windows',
        arch: 'x64',
        format: 'msi',
        filename: 'node-v24.1.0-x64.msi',
        sizeBytes: null,
        sha256: '',
        order: 0,
        status: 'published',
        links: [
          {
            id: 'pku',
            label: '北大',
            siteId: 'pku',
            url: 'https://mirrors.pku.edu.cn/nodejs-release/v24.1.0/node-v24.1.0-x64.msi',
            enabled: true,
            checkedAt: '',
            note: '',
          },
        ],
      },
    ],
    tutorials: [
      {
        id: 'install',
        title: '安装 Node',
        summary: '',
        componentId: '',
        versionIds: ['v24'],
        platforms: ['windows'],
        resourceIds: ['win'],
        markdown: '# 安装\n按说明操作',
        order: 0,
        status: 'published',
      },
    ],
  };
  const save = await app.request('/api/admin/ecosystems/nodejs', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ revision: record.revision, document: doc }),
  });
  expect(save.status).toBe(200);
  record = (await save.json()).data;
  expect((await app.request('/api/curated/ecosystems/nodejs')).status).toBe(404);
  const preview = await app.request('/api/admin/ecosystems/nodejs/preview', { headers });
  expect(preview.status).toBe(200);
  const publish = await app.request('/api/admin/ecosystems/nodejs/publication', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ revision: record.revision, state: 'published' }),
  });
  expect(publish.status).toBe(200);
  record = (await publish.json()).data;
  const publicDoc = (await (await app.request('/api/curated/ecosystems/nodejs')).json()).data;
  expect(publicDoc.resources[0].links).toHaveLength(1);
  expect((await (await app.request('/api/curated/ecosystems?q=node')).json()).data).toHaveLength(1);
  const edited = await app.request('/api/admin/ecosystems/nodejs', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      revision: record.revision,
      document: { ...doc, name: '未发布的新名称' },
    }),
  });
  expect(edited.status).toBe(200);
  record = (await edited.json()).data;
  expect((await (await app.request('/api/curated/ecosystems/nodejs')).json()).data.name).toBe(
    'Node.js',
  );
  const stale = await app.request('/api/admin/ecosystems/nodejs', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ revision: 1, document: doc }),
  });
  expect(stale.status).toBe(409);
  const exported = await app.request('/api/admin/export', { headers });
  expect(exported.status).toBe(200);
  expect(JSON.stringify(await exported.json())).not.toContain('password');
  expect(
    (
      await app.request('/api/admin/ecosystems/nodejs/publication', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ revision: record.revision, state: 'disabled' }),
      })
    ).status,
  ).toBe(200);
  expect((await app.request('/api/curated/ecosystems/nodejs')).status).toBe(404);
});

it('写接口必须登录并通过CSRF，退出撤销会话，错误密码不能登录', async () => {
  const { app, headers, cookie } = await fixture();
  expect((await app.request('/api/admin/ecosystems')).status).toBe(401);
  expect(
    (
      await app.request('/api/admin/ecosystems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request('/api/admin/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MirrorN-Admin': '1',
          Origin: 'https://other.example',
        },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MirrorN-Admin': '1' },
        body: JSON.stringify({ username: 'editor', password: 'wrong-password' }),
      })
    ).status,
  ).toBe(401);
  expect((await app.request('/api/admin/session', { method: 'DELETE', headers })).status).toBe(204);
  expect((await app.request('/api/admin/ecosystems', { headers })).status).toBe(401);
});

it('发布校验引用、启用来源、推荐理由；校验失败不改变已发布快照', async () => {
  const { store } = await fixture();
  const draft = store.create({ id: 'tools', name: '工具' });
  expect(() => store.publish('tools', draft.revision, 'published')).toThrow('资源或教程');
  const saved = store.save('tools', draft.revision, {
    ...draft.document,
    tutorials: [{ id: 'read', title: '说明', markdown: '正文', status: 'published' }],
  });
  store.publish('tools', saved.revision, 'published');
  const current = store.get('tools');
  expect(() =>
    store.save('tools', current.revision, {
      ...current.document,
      tutorials: [{ ...current.document.tutorials[0], versionIds: ['missing'] }],
    }),
  ).toThrow('引用');
  expect(store.publicGet('tools')?.tutorials[0]?.markdown).toBe('正文');
});

it('人工内容持久化，SQLite一致性备份包含已提交的编辑稿与发布稿', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mirrorn-curated-'));
  const path = join(folder, 'content.sqlite');
  const backup = join(folder, 'backup.sqlite');
  const store = new CurationStore(path);
  try {
    const created = store.create({ id: 'nodejs', name: 'Node.js' });
    const saved = store.save('nodejs', created.revision, {
      ...created.document,
      tutorials: [{ id: 'intro', title: '介绍', markdown: '手动内容', status: 'published' }],
    });
    const published = store.publish('nodejs', saved.revision, 'published');
    store.save('nodejs', published.revision, { ...published.document, name: '下一次修改' });
    store.backup(backup);
    const restored = new CurationStore(backup);
    try {
      expect(restored.get('nodejs').document.name).toBe('下一次修改');
      expect(restored.publicGet('nodejs')?.name).toBe('Node.js');
    } finally {
      restored.close();
    }
  } finally {
    store.close();
  }
  const reopened = new CurationStore(path);
  try {
    expect(reopened.publicGet('nodejs')?.tutorials[0]?.markdown).toBe('手动内容');
  } finally {
    reopened.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
