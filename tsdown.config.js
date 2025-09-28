import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: ['./lib/index.ts', './lib/stream.ts'],
    format: ['cjs', 'esm'],
    exports: true,
    dts: {
        oxc: true
    }
})
