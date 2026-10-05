import { describe, it, expect } from 'vitest';
import { matchScore } from './discovery.js';

describe('名称搜索的语义边界', () => {
  it('准确名称优先于同义名，词语/前缀优先于单字符拼写容错', () => {
    expect(matchScore('Ubuntu', 'Ubuntu')).toBeLessThan(
      matchScore('ubuntu', 'Linux Ubuntu', ['ubuntu'])!,
    );
    expect(matchScore('Apache', 'Apache Maven')).toBeLessThan(matchScore('apche', 'Apache Maven')!);
    expect(matchScore('ubntu', 'Ubuntu')).toBeDefined();
    expect(matchScore('ubxxx', 'Ubuntu')).toBeUndefined();
  });
  it('短词不从无关名称中截取，不把标点、SQL通配符或数字当全文查询', () => {
    expect(matchScore('go', 'MongoDB')).toBeUndefined();
    expect(matchScore('r', 'Arch Linux')).toBeUndefined();
    expect(matchScore('npm', 'Node.js', ['node', 'nodejs'])).toBeUndefined();
    expect(matchScore('%', 'Node.js')).toBeUndefined();
    expect(matchScore('24.1', 'Node.js')).toBeUndefined();
    expect(matchScore('ｎｏｄｅｊｓ', 'Node.js', ['nodejs'])).toBeDefined();
  });
});
