import { serve } from '@hono/node-server';

import { createApp } from './app';
import { loadApiEnv } from './env';

const env = loadApiEnv(process.env);

serve({ fetch: createApp().fetch, port: env.API_PORT });
