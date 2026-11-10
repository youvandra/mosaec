/** @type {import('vitest/config').ViteUserConfig} */
export const vitestPreset = {
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    restoreMocks: true,
    unstubEnvs: true,
  },
};
