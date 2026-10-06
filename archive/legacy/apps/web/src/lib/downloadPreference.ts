import { ref } from 'vue';
import type { DownloadCandidate } from './resourceApi';
import { createProbeCache, selectCachedResults } from './probeCache';
const KEY = 'mirrorn.download-preferences.v1';
interface Preference {
  saveTraffic: boolean;
  sites: Record<string, string>;
}
function read(): Preference {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preference>;
    return {
      saveTraffic: value.saveTraffic === true,
      sites:
        value.sites && typeof value.sites === 'object'
          ? Object.fromEntries(
              Object.entries(value.sites).filter(([, site]) => typeof site === 'string'),
            )
          : {},
    };
  } catch {
    return { saveTraffic: false, sites: {} };
  }
}
const preference = read();
export const saveTraffic = ref(preference.saveTraffic);
function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ saveTraffic: saveTraffic.value, sites: preference.sites }),
    );
  } catch {
    /* 禁止存储时保留本次会话的选择。 */
  }
}
export function setSaveTraffic(value: boolean) {
  saveTraffic.value = value;
  persist();
}
export function syncDownloadPreference() {
  const next = read();
  preference.sites = next.sites;
  saveTraffic.value = next.saveTraffic;
}
export function rememberSite(software: string, site: string) {
  preference.sites[software] = site;
  persist();
}
export function selectDownloadCandidate(
  candidates: DownloadCandidate[],
  software: string,
  explicitSite?: string,
  fingerprint?: string,
) {
  const eligible = candidates.filter(
    (candidate) => !saveTraffic.value || candidate.region === 'CN',
  );
  const preferred =
    eligible.find((candidate) => candidate.siteId === explicitSite) ??
    eligible.find((candidate) => candidate.siteId === preference.sites[software]);
  if (preferred) return preferred.id;
  // 不为打开页面发起新测速；只使用与当前出口一致且仍有效的本机测量。
  if (fingerprint) {
    const targets = eligible.flatMap((candidate) =>
      candidate.probe ? [{ mirrorId: candidate.siteId, probe: candidate.probe }] : [],
    );
    const cache = createProbeCache()
      .read()
      .filter((entry) => entry.ok?.fingerprint === fingerprint);
    const { results } = selectCachedResults(cache, targets, Date.now(), fingerprint);
    const measured = eligible
      .filter((candidate) => results.get(candidate.siteId)?.status === 'ok')
      .sort((a, b) => results.get(a.siteId)!.durationMs! - results.get(b.siteId)!.durationMs!);
    if (measured[0]) return measured[0].id;
  }
  return eligible[0]?.id ?? '';
}
