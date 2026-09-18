import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('health route', () => {
  it('returns a stable service health payload', async () => {
    const response = await createApp().request('http://localhost/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'mirrorn-server',
      dataSchemaVersion: 1,
    });
  });
});
