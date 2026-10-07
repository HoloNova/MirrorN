interface SelectorElements {
  readonly region: HTMLElement;
  readonly artifact: HTMLSelectElement;
  readonly source: HTMLSelectElement;
  readonly status: HTMLElement;
  readonly link: HTMLAnchorElement;
  readonly filters: readonly HTMLSelectElement[];
  readonly artifacts: readonly HTMLOptionElement[];
  readonly sources: readonly HTMLOptionElement[];
}

function replaceOptions(select: HTMLSelectElement, placeholder: string, options: readonly HTMLOptionElement[]): void {
  select.replaceChildren(new Option(placeholder, ''), ...options.map((option) => option.cloneNode(true)));
}

function updateLink(elements: SelectorElements): void {
  const option = elements.source.selectedOptions[0];
  const href = option && !option.disabled ? option.dataset.href : undefined;
  elements.link.hidden = !href;
  elements.link.removeAttribute('href');
  elements.link.removeAttribute('download');
  if (!href) {
    if (elements.artifact.value && !elements.source.disabled) elements.status.textContent = '请选择来源，再点击下载。';
    return;
  }
  elements.link.href = href;
  if (option?.dataset.downloadName) elements.link.download = option.dataset.downloadName;
  elements.status.textContent = '只下载当前所选文件；切换来源不会改变版本、平台或架构。';
}

function updateSources(elements: SelectorElements): void {
  const candidates = elements.sources.filter((option) => option.dataset.artifact === elements.artifact.value);
  replaceOptions(elements.source, elements.artifact.value ? '请选择来源' : '先选择文件', candidates);
  const available = candidates.filter((option) => !option.disabled);
  elements.source.disabled = !elements.artifact.value || !available.length;
  const preferred = available.find((option) => option.value === elements.region.dataset.defaultSource);
  elements.source.value = preferred?.value ?? (available.length === 1 ? available[0]?.value ?? '' : '');
  if (elements.artifact.value && !available.length) elements.status.textContent = '该文件没有可用来源；不会自动换成其他文件。';
  updateLink(elements);
}

function updateArtifacts(elements: SelectorElements): void {
  const candidates = elements.artifacts.filter((option) => elements.filters.every((filter) =>
    filter.value === 'all' || option.dataset[filter.dataset.dimension ?? ''] === filter.value));
  replaceOptions(elements.artifact, candidates.length ? '请选择文件' : '无匹配文件', candidates);
  elements.artifact.value = candidates.length === 1 ? candidates[0]?.value ?? '' : '';
  elements.artifact.disabled = !candidates.length;
  const hasAvailable = candidates.some((artifact) => elements.sources.some((source) => !source.disabled && source.dataset.artifact === artifact.value));
  elements.status.textContent = !candidates.length ? '没有匹配文件，请调整筛选。'
    : !hasAvailable ? '匹配文件的所有来源均失效，请查看来源说明；不会换用其他文件。'
    : candidates.length > 1 ? '有多个匹配文件，请明确选择，不自动下载第一项。' : '已匹配一个文件。';
  updateSources(elements);
}

function initializeSelector(region: HTMLElement): void {
  if (region.dataset.initialized) return;
  const artifact = region.querySelector<HTMLSelectElement>('[data-artifact-select]');
  const source = region.querySelector<HTMLSelectElement>('[data-source-select]');
  const status = region.querySelector<HTMLElement>('[data-selection-status]');
  const link = region.querySelector<HTMLAnchorElement>('[data-selected-download]');
  const controls = region.querySelector<HTMLFieldSetElement>('[data-selector-controls]');
  if (!artifact || !source || !status || !link || !controls) return;
  const elements: SelectorElements = {
    region, artifact, source, status, link,
    filters: [...region.querySelectorAll<HTMLSelectElement>('[data-dimension]')],
    artifacts: [...artifact.options].filter((option) => option.value),
    sources: [...source.options].filter((option) => option.value),
  };
  for (const filter of elements.filters) filter.addEventListener('change', () => updateArtifacts(elements));
  artifact.addEventListener('change', () => updateSources(elements));
  source.addEventListener('change', () => updateLink(elements));
  updateArtifacts(elements);
  controls.hidden = false;
  const fallback = region.querySelector<HTMLDetailsElement>('[data-selector-fallback]');
  if (fallback) fallback.open = false;
  region.dataset.initialized = 'true';
}

function initializeSelectors(): void {
  for (const region of document.querySelectorAll<HTMLElement>('[data-download-selector]')) initializeSelector(region);
}
initializeSelectors();
document.addEventListener('astro:page-load', initializeSelectors);
