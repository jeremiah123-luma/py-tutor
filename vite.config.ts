import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * The lessons ship to the browser, but their answers must not: every Try it's reference solution and its list of
 * known wrong answers are only used by the Worker (grading context) and the tests. This blanks those two fields in
 * the built app, so they can't be read in the browser's developer tools. Build only: tests keep the real values.
 */
function stripAnswers(): Plugin {
  return {
    name: 'strip-answers',
    apply: 'build',
    enforce: 'post',
    transform(code, id) {
      if (!/\/src\/curriculum\/(?!quiz\/)[^/]+\.ts$/.test(id)) return null;
      const ast = this.parse(code) as unknown as { body: unknown };
      const cuts: [number, number, string][] = [];
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n.type === 'Property' && !n.computed && ['reference', 'wrong'].includes(n.key?.name ?? n.key?.value)) {
          cuts.push([n.value.start, n.value.end, (n.key.name ?? n.key.value) === 'wrong' ? '[]' : '""']);
          return;
        }
        for (const k in n) if (k !== 'type' && k !== 'start' && k !== 'end') walk(n[k]);
      };
      walk(ast);
      let out = code;
      for (const [a, b, v] of cuts.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + v + out.slice(b);
      return { code: out, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripAnswers()],
  // Pyodide and onnxruntime load their own wasm from /pyodide and /vad (self-hosted by scripts/copy-assets.mjs).
  optimizeDeps: { exclude: ['pyodide', '@ricky0123/vad-web', 'onnxruntime-web'] },
  worker: { format: 'es' },
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
