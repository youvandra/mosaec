import { cpSync } from 'node:fs';

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so they are bundled rather than imported at runtime.
  noExternal: [/^@mosaec\//],
  // Migrations ship with the bundle so the service can apply them at start.
  onSuccess: () => {
    cpSync('../../packages/db/migrations', 'dist/migrations', { recursive: true });
    return Promise.resolve();
  },
});
