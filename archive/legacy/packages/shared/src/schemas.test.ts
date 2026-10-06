import { describe, expect, it } from 'vitest';

import { ProbeConfigSchema, MirrorSchema } from './schemas.js';

describe('MirrorSchema', () => {
  it('rejects a non-HTTPS homepage', () => {
    const result = MirrorSchema.safeParse({
      id: 'insecure-mirror',
      name: 'Insecure Mirror',
      kind: 'community',
      homepageUrl: 'http://example.com/',
      sources: [
        {
          url: 'https://example.com/source',
          checkedAt: '2026-09-18',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe('ProbeConfigSchema', () => {
  it('requires an explicit probe id and cross-origin mode', () => {
    const withoutId = ProbeConfigSchema.safeParse({ url: 'https://example.com/robots.txt' });
    const withoutMode = ProbeConfigSchema.safeParse({
      id: 'example-robots',
      url: 'https://example.com/robots.txt',
    });

    expect(withoutId.success).toBe(false);
    expect(withoutMode.success).toBe(false);
  });

  it('defaults to no-cors without cache busting', () => {
    const result = ProbeConfigSchema.safeParse({
      id: 'example-robots',
      url: 'https://example.com/robots.txt',
      mode: 'no-cors',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.cacheBust).toBe(false);
    expect(result.success && result.data.method).toBe('head');
  });

  it('rejects an http probe target', () => {
    const result = ProbeConfigSchema.safeParse({
      id: 'example-robots',
      url: 'http://example.com/robots.txt',
      mode: 'no-cors',
    });

    expect(result.success).toBe(false);
  });
});
