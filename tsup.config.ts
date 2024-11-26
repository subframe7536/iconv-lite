import { defineConfig } from 'tsup';

export default defineConfig({
    clean: true,
    entry: ['./lib/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    treeshake: true,
});
