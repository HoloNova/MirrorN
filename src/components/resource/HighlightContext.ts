import { createContext } from 'react';
import type { HighlightedCode } from '../../content/schema/code-blocks.ts';
/** 嵌套的指令正文里也有代码块；用 context 把高亮结果带到任意深度，不必在每层递归里传参。 */
export const HighlightContext = createContext<Readonly<Record<string, HighlightedCode>>>({});
