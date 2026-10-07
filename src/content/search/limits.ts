/** 首页检索预算；浏览器与构建共用，不在 UI 中另写一套数字。 */
export const searchLimits = Object.freeze({
  queryLength: 240,
  resultCount: 20,
  indexBytes: 2 * 1024 * 1024,
  loadTimeoutMs: 10_000,
  inputDelayMs: 150,
});
