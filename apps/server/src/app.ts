import { Hono } from 'hono';

import { DATA_SCHEMA_VERSION } from '@mirrorn/shared';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (context) =>
    context.json({
      status: 'ok',
      service: 'mirrorn-server',
      dataSchemaVersion: DATA_SCHEMA_VERSION,
    }),
  );

  return app;
}
