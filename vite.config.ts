import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pyodide and onnxruntime load their own wasm from /pyodide and /vad (self-hosted by scripts/copy-assets.mjs).
  optimizeDeps: { exclude: ['pyodide', '@ricky0123/vad-web', 'onnxruntime-web'] },
  worker: { format: 'es' },
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
