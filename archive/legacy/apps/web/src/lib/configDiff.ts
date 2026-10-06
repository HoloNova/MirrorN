/**
 * 配置文件差异对照。
 *
 * 解决的具体问题：文档里的第 02 节给出一份"改完之后"的完整配置，用户看不到"哪几行会被改"。
 * 而新手最担心的正是这几件事——我自己加的行会不会被覆盖？安全更新那几行动没动？
 * 这条命令是新建文件还是改我原来的文件？把同一份配置在"官方默认源"和"所选镜像"下各渲染一次，
 * 逐行比对，就能把答案变成看得见的对照（`-` 官方默认的行、`+` 换成镜像的行、没列出的行不变）。
 *
 * 边界：对照的"改动前"是**官方默认配置**，不是用户机器上现在的文件——浏览器读不到本机文件。
 * 因此界面必须写明这一点，不能暗示我们看过他的系统。
 */

export interface DiffLine {
  kind: 'removed' | 'added';
  text: string;
  /**
   * 行首是注释（`#` 或 `;`）。注释里也常出现示例地址，它们会跟着镜像一起变，
   * 但生效配置并没有变化——界面需要把这两种"变化"区分开。
   */
  comment: boolean;
}

export interface ConfigDiffSummary {
  lines: DiffLine[];
  /** 官方默认配置的总行数：用来算“其余 N 行保持不变”。 */
  total: number;
  /** 会改变的**生效配置**行数（不算注释行）。 */
  effectiveChanged: number;
  /** 只有注释里变化的行数：示例地址跟着镜像一起更新，生效配置本身没变。 */
  commentChanged: number;
  /** 完全不动的行数。 */
  kept: number;
  /** 生效配置没有任何改变（变化全在注释里）。 */
  effectiveUnchanged: boolean;
}

const COMMENT_PATTERN = /^\s*[#;]/;

function splitLines(text: string): string[] {
  // 末尾的换行不算一行，否则每一份文件都会凭空多出一行"变化"。
  return text.replace(/\n+$/, '').split('\n');
}

/**
 * 逐行差异（最长公共子序列）。配置样本只有十几行，`O(n·m)` 完全够用，
 * 也就不必为了省这点开销引入 diff 依赖。
 */
export function diffConfigLines(before: string, after: string): DiffLine[] {
  const left = splitLines(before);
  const right = splitLines(after);
  const table: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  const push = (kind: DiffLine['kind'], text: string): void => {
    lines.push({ kind, text, comment: COMMENT_PATTERN.test(text) });
  };

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    // 优先输出删除行：先看到"原来是什么"，再看"变成什么"更符合阅读顺序。
    if (table[i + 1][j] >= table[i][j + 1]) {
      push('removed', left[i]);
      i += 1;
    } else {
      push('added', right[j]);
      j += 1;
    }
  }

  while (i < left.length) {
    push('removed', left[i]);
    i += 1;
  }
  while (j < right.length) {
    push('added', right[j]);
    j += 1;
  }

  return lines;
}

/**
 * 对照卡的一句总结。刻意把"生效配置"与"注释里的示例地址"分开计数：apt 的样本里后者
 * 占了一半，不分开说会让人以为改了很多行。
 */
export function describeConfigDiff(summary: ConfigDiffSummary): string {
  if (summary.effectiveUnchanged) {
    return `共 ${summary.total} 行，生效配置没有任何变化：改的只是注释里的示例地址。`;
  }

  const parts = [`共 ${summary.total} 行`, `${summary.effectiveChanged} 行生效配置会改`];
  if (summary.commentChanged > 0) {
    parts.push(`另有 ${summary.commentChanged} 行注释里的示例地址跟着更新`);
  }
  if (summary.kept > 0) {
    parts.push(`其余 ${summary.kept} 行不动`);
  }
  return `${parts.join('，')}。`;
}

export function summarizeConfigDiff(before: string, after: string): ConfigDiffSummary {
  const lines = diffConfigLines(before, after);
  const removed = lines.filter((line) => line.kind === 'removed');
  const added = lines.filter((line) => line.kind === 'added');
  const removedEffective = removed.filter((line) => !line.comment).length;
  const addedEffective = added.filter((line) => !line.comment).length;
  const removedComment = removed.length - removedEffective;
  const addedComment = added.length - addedEffective;
  const effectiveChanged = Math.max(removedEffective, addedEffective);
  const commentChanged = Math.max(removedComment, addedComment);

  return {
    lines,
    total: splitLines(before).length,
    effectiveChanged,
    commentChanged,
    // “不动”的行数只在两侧一致时成立；真出现不对称时宁可不写这个数字。
    kept: Math.max(0, splitLines(before).length - removed.length),
    effectiveUnchanged: effectiveChanged === 0,
  };
}
