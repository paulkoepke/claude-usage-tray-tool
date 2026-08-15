import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentMatchGlobs: [['src/main/**/*.test.ts', 'node']],
    include: ['src/**/*.test.ts']
  }
})
