import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchEngine } from '../content/search/engine.ts';
import { loadSearchEngine } from '../scripts/search/load.ts';

/** 索引加载独立于查询状态；卸载和地址变化会取消旧请求。 */
export function useSearchLoader(indexUrl: string) {
  const [engine, setEngine] = useState<SearchEngine | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const engineRef = useRef<SearchEngine | null>(null);
  const failed = useRef(false);
  const pending = useRef<{ controller: AbortController } | null>(null);
  const mounted = useRef(false);
  const load = useCallback((revalidate = false) => {
    if (engineRef.current || pending.current || (failed.current && !revalidate)) return;
    failed.current = false;
    const job = { controller: new AbortController() };
    pending.current = job;
    setPhase('loading');
    void loadSearchEngine(indexUrl, revalidate, job.controller.signal).then((value) => {
      if (!mounted.current || pending.current !== job) return;
      engineRef.current = value;
      setEngine(value);
      setPhase('ready');
    }).catch((error: unknown) => {
      if (!mounted.current || pending.current !== job) return;
      failed.current = true;
      setPhase('failed');
      console.error('[MirrorN search] 无法加载公开索引或检索模块', error);
    }).finally(() => { if (pending.current === job) pending.current = null; });
  }, [indexUrl]);
  useEffect(() => {
    mounted.current = true;
    engineRef.current = null;
    failed.current = false;
    setEngine(null);
    setPhase('idle');
    return () => {
      mounted.current = false;
      pending.current?.controller.abort();
      pending.current = null;
    };
  }, [indexUrl]);
  return { engine, phase, engineRef, load };
}
