import {
  CuratedDocumentSchema,
  type AdminSession,
  type CuratedDocument,
  type CuratedRecord,
  type CuratedSummary,
} from '@mirrorn/shared';
import { resolveApiBase } from '../composables/useMirrorStatus';

export class CurationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
let csrf = '';
export async function curationRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const base = resolveApiBase();
  if (!base) throw new Error('请连接本地后端后使用内容管理');
  const response = await fetch(`${base.replace(/\/+$/, '')}/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-MirrorN-Admin': '1',
      ...(csrf ? { 'X-MirrorN-CSRF': csrf } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response
    .json()
    .catch(() => ({ error: `内容接口返回 ${response.status}，请确认后端已经启动` }))) as {
    data?: T;
    error?: string;
  };
  if (!response.ok) {
    if (response.status === 401) csrf = '';
    throw new CurationApiError(payload.error || `接口返回 ${response.status}`, response.status);
  }
  if (payload.data === undefined) throw new Error('内容接口响应不完整');
  return payload.data;
}
export async function adminSession(): Promise<AdminSession> {
  const session = await curationRequest<AdminSession>('/admin/session');
  csrf = session.csrf;
  return session;
}
export async function adminLogin(username: string, password: string): Promise<AdminSession> {
  const session = await curationRequest<AdminSession>('/admin/session', {
    method: 'POST',
    body: { username, password },
  });
  csrf = session.csrf;
  return session;
}
export async function adminLogout() {
  await curationRequest('/admin/session', { method: 'DELETE' });
  csrf = '';
}
export const curatedList = (query = '', signal?: AbortSignal) =>
  curationRequest<CuratedSummary[]>(`/curated/ecosystems?q=${encodeURIComponent(query)}`, {
    signal,
  });
export async function curatedDetail(id: string, signal?: AbortSignal): Promise<CuratedDocument> {
  return CuratedDocumentSchema.parse(
    await curationRequest(`/curated/ecosystems/${encodeURIComponent(id)}`, { signal }),
  );
}
export type AdminSummary = Pick<
  CuratedRecord,
  'revision' | 'publishedRevision' | 'updatedAt' | 'state'
> & { id: string; name: string; summary: string };
export const adminList = () => curationRequest<AdminSummary[]>('/admin/ecosystems');
export async function exportContent() {
  const content = await curationRequest('/admin/export');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `mirrorn-content-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
