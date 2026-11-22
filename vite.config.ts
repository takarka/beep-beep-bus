import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  resolve: {
    // The pre-built minified Phaser without the Matter physics engine (we only use the renderer, tweens, input and particles).
    alias: { phaser: 'phaser/dist/phaser-arcade-physics.min.js' },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  server: { host: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
