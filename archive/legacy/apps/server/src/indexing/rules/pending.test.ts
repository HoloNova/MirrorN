import { describe, it, expect } from 'vitest';
import { indexFixture } from '../../db/indexFixture.js';
import { recordPending, prunePending } from './pending.js';

describe('待核对样本有界积累', () => {
  it('数字形状聚合但不产生规则，最多三个样本；计数是观察次数', () => {
    const db = indexFixture();
    try {
      for (let i = 0; i < 20; i++)
        recordPending(
          db,
          'pku-test',
          'unknown',
          'https://mirrors.pku.edu.cn/apache/',
          `tool-${i}.zip`,
          'revision',
          1000 + i,
        );
      const rows = db.prepare('SELECT samples,observations FROM catalog_pending').all() as {
        samples: string;
        observations: number;
      }[];
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.samples)).toHaveLength(3);
      expect(rows[0]!.observations).toBe(20);
    } finally {
      db.close();
    }
  });
  it('每入口100组/全局2000组，超额不扩表，30天过期清理', () => {
    const db = indexFixture();
    try {
      for (let source = 0; source < 21; source++)
        for (let i = 0; i < 101; i++) {
          // 用非数字的字母组合制造不同结构，不混淆观察次数和候选数。
          const name = `candidate-${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}.zip`;
          const accepted = recordPending(
            db,
            `entry-${source}`,
            'unknown',
            'https://mirrors.pku.edu.cn/apache/',
            name,
            'revision',
            1,
          );
          expect(accepted).toBe(source < 20 && i < 100);
        }
      expect((db.prepare('SELECT COUNT(*) n FROM catalog_pending').get() as { n: number }).n).toBe(
        2000,
      );
      prunePending(db, 31 * 86400000);
      expect((db.prepare('SELECT COUNT(*) n FROM catalog_pending').get() as { n: number }).n).toBe(
        0,
      );
    } finally {
      db.close();
    }
  });
});
