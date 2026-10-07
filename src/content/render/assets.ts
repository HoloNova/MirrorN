import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fail } from '../diagnostics.ts';
import { contentLimits } from '../limits.ts';
import { fileLocation, readSafeFile } from '../parse/files.ts';
import type { ValidatedAssetFile } from '../validate/file-types.ts';

/** 页面引用摘要后文件若被改动，阻止生成错配字节；不把新文件冒充旧摘要。 */
export async function readPublishedAsset(projectRoot: string, resourceId: string, file: ValidatedAssetFile): Promise<Uint8Array<ArrayBuffer>> {
  const location = fileLocation(resourceId, file.path);
  const bytes = await readSafeFile(join(projectRoot, 'content/resources', resourceId), file.path, contentLimits.assetBytes, location);
  if (bytes.length !== file.byteLength || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    fail(location, 'E_ASSET', '附件在校验后发生变化，请重新构建；不能将新字节放到旧摘要地址');
  }
  return new Uint8Array(bytes);
}
