import { serve } from '@hono/node-server';

import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT 必须是 1 到 65535 之间的整数，当前值：${process.env.PORT ?? ''}`);
}

serve(
  {
    fetch: createApp().fetch,
    port,
  },
  (info) => {
    console.log(`MirrorN server listening on http://localhost:${info.port}`);
  },
);
