import { describe, expect, it } from 'vitest';

import { MirrorSchema } from './schemas.js';

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
