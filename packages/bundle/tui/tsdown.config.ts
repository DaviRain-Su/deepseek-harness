import { defineConfig } from 'tsdown'

/** Keep the OMP engine out of the host bundle: it loads `bun:ffi` at import. */
export default defineConfig({
  entry: ['lib/types/{index,invariant,startup}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: [/^@oh-my-pi\//],
})
