// Self-hosts runtime assets (same origin, no CDN): Pyodide, the Silero VAD model, and onnxruntime wasm.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
const copy = (from, to, files) => {
  mkdirSync(to, { recursive: true });
  for (const f of files) cpSync(`${from}/${f}`, `${to}/${f}`);
};
copy('node_modules/pyodide', 'public/pyodide', ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'pyodide.mjs', 'python_stdlib.zip', 'pyodide-lock.json']);
copy('node_modules/@ricky0123/vad-web/dist', 'public/vad', ['vad.worklet.bundle.min.js', 'silero_vad_v5.onnx', 'silero_vad_legacy.onnx']);
const ort = 'node_modules/onnxruntime-web/dist';
copy(ort, 'public/vad', readdirSync(ort).filter((f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)));
console.log('runtime assets copied');
