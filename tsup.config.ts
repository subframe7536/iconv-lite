import { defineConfig } from 'tsup';

export default defineConfig({
    clean: true,
    entry: ['./lib/index.js'],
    format: ['cjs', 'esm'],
    dts: true,
    external: ['./encodings'],
    treeshake: true,
});
