import { describe, expect, it } from 'vitest';

import { describeConfigDiff, diffConfigLines, summarizeConfigDiff } from './configDiff';

const before = [
  '# MirrorN 生成',
  'URIs: https://archive.ubuntu.com/ubuntu/',
  'Suites: noble noble-updates',
  '# 可以让安全更新也走镜像：https://archive.ubuntu.com/ubuntu/',
  'Types: deb',
  'URIs: https://security.ubuntu.com/ubuntu/',
].join('\n');

const after = before
  .replaceAll('https://archive.ubuntu.com/ubuntu/', 'https://mirrors.tuna.tsinghua.edu.cn/ubuntu/')
  .concat('\n');

describe('diffConfigLines', () => {
  it('内容相同时没有差异行', () => {
    expect(diffConfigLines(before, before)).toEqual([]);
  });

  it('只列出真正变化的行，并标出哪些是注释', () => {
    const lines = diffConfigLines(before, after);

    expect(lines).toEqual([
      {
        kind: 'removed',
        text: 'URIs: https://archive.ubuntu.com/ubuntu/',
        comment: false,
      },
      {
        kind: 'added',
        text: 'URIs: https://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
        comment: false,
      },
      {
        kind: 'removed',
        text: '# 可以让安全更新也走镜像：https://archive.ubuntu.com/ubuntu/',
        comment: true,
      },
      {
        kind: 'added',
        text: '# 可以让安全更新也走镜像：https://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
        comment: true,
      },
    ]);
  });

  it('末尾换行不算成一行', () => {
    expect(diffConfigLines('a\n', 'a\n\n')).toEqual([]);
  });
});

describe('summarizeConfigDiff', () => {
  it('把生效配置的变化与注释里的变化分开计数', () => {
    const summary = summarizeConfigDiff(before, after);

    expect(summary.total).toBe(6);
    expect(summary.effectiveChanged).toBe(1);
    expect(summary.commentChanged).toBe(1);
    // 6 行里有 2 行被替换（一行生效、一行注释），其余 4 行不动。
    expect(summary.kept).toBe(4);
    expect(summary.effectiveUnchanged).toBe(false);
  });

  it('变化全在注释里时 effectiveUnchanged 为真', () => {
    const summary = summarizeConfigDiff(
      '# 见 https://a.example/\nTypes: deb',
      '# 见 https://b.example/\nTypes: deb',
    );

    expect(summary.effectiveChanged).toBe(0);
    expect(summary.commentChanged).toBe(1);
    expect(summary.kept).toBe(1);
    expect(summary.effectiveUnchanged).toBe(true);
  });

  it('描述句按有没有注释变化分成两种说法', () => {
    const withComments = summarizeConfigDiff(before, after);
    expect(describeConfigDiff(withComments)).toBe(
      '共 6 行，1 行生效配置会改，另有 1 行注释里的示例地址跟着更新，其余 4 行不动。',
    );

    const withoutComments = summarizeConfigDiff(
      'URIs: https://a.example/',
      'URIs: https://b.example/',
    );
    expect(describeConfigDiff(withoutComments)).toBe('共 1 行，1 行生效配置会改。');

    const commentOnly = summarizeConfigDiff('# 见 https://a.example/', '# 见 https://b.example/');
    expect(describeConfigDiff(commentOnly)).toBe(
      '共 1 行，生效配置没有任何变化：改的只是注释里的示例地址。',
    );
  });
});
