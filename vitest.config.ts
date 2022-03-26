import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    {
      name: 'mock-fs-routes',
      resolveId(id) {
        if (id === '~fs-routes')
          return id
        return null
      },
      load(id) {
        if (id === '~fs-routes')
          return 'export default []'
        return null
      },
    },
  ],
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
