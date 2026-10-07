import type { ContentLocation } from '../diagnostics.ts';

export interface AssetRequest {
  readonly path: string;
  readonly kind: 'image' | 'download';
  readonly location: ContentLocation;
  readonly referenced: boolean;
}

/** 只有相对路径和实际摘要，不存磁盘绝对路径、文件内容或可执行处理器。 */
export interface ValidatedAssetFile {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly sha512: string;
  readonly mediaType: string;
  readonly kind: 'image' | 'download';
  readonly referenced: boolean;
}
