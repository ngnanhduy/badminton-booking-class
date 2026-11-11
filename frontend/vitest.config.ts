import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      setupFiles: ['./src/test-setup.ts'],
      // Node 25+ ships its own (file-backed) `localStorage` global, which is undefined
      // unless --localstorage-file is set and shadows jsdom's implementation.
      execArgv: ['--no-experimental-webstorage'],
    },
  }),
)
