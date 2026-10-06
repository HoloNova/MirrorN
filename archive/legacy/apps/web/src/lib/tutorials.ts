import minicondaBody from '../tutorials/miniconda.md?raw';
import nodejsBody from '../tutorials/nodejs.md?raw';

/**
 * 我们自己的教程正文。数据侧（`data/tutorials.json`）负责“哪些资源有教程、标题是什么”，
 * 正文则必须打进前端产物里：页面在公网是静态托管的，不能等接口。
 */
export interface TutorialBody {
  id: string;
  body: string;
}

const BODIES: Record<string, string> = {
  miniconda: minicondaBody,
  nodejs: nodejsBody,
};

export function tutorialBody(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return BODIES[id];
}
