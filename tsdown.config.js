import { defineConfig } from 'tsdown'

export default defineConfig({
    entry: ['./lib/index.js'],
    format: ['cjs', 'esm'],
    dts: {
        oxc: true
    }
})
