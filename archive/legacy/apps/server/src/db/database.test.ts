import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openInstallerDatabase, openReadDatabase } from './database.js';

it('首次启动自动创建缺失的数据库父目录，随后可只读打开', () => {
  const root = mkdtempSync(join(tmpdir(), 'mirrorn-first-start-'));
  const path = join(root, 'missing', '.data', 'mirrorn-installers.sqlite');
  try {
    const writer = openInstallerDatabase(path);
    try {
      expect(writer.prepare('SELECT COUNT(*) n FROM catalog_downloads').get()).toMatchObject({
        n: 0,
      });
    } finally {
      writer.close();
    }
    const reader = openReadDatabase(path);
    try {
      expect(reader.prepare('SELECT COUNT(*) n FROM catalog_downloads').get()).toMatchObject({
        n: 0,
      });
    } finally {
      reader.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
