// The talk orb: a frosted-glass sphere with a glowing ribbon of py-tutor's colours folding inside it.
//
// Drawn live in WebGL. For each pixel of the sphere a ray goes in through the front and out through the back,
// collecting light from a soft, wavy sheet that slowly turns inside; the glass is milky (grey centre, white rim,
// a halo outside), so the ribbon reads as if seen through frosted glass. It answers to the conversation:
//   idle       slow and calm
//   listening  the ribbon swells with his voice
//   thinking   it turns faster and tighter
//   speaking   it pulses with the tutor's voice
// Only the canvas changes (no React re-renders); it stops drawing when hidden or off screen. Reduced motion: it
// holds still. No WebGL: a still gradient sphere.
import { useEffect, useRef } from 'react';
import type { TalkState } from '../screens/TalkScreen';
import { micLevel, speechLevel } from '../voice/levels';

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uT;      // animation time (already sped up or slowed down by state)
uniform float uAmp;    // 0..1 loudness, smoothed
uniform float uTight;  // 0..1 how tight and busy the folds are (thinking)

// py-tutor's colours: violet, pink, sky blue, and a deeper violet for depth
const vec3 VIOLET = vec3(0.580, 0.420, 0.980);
const vec3 PINK   = vec3(0.960, 0.400, 0.700);
const vec3 SKY    = vec3(0.420, 0.650, 1.000);
const vec3 DEEP   = vec3(0.330, 0.200, 0.780);

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

// the ribbon: a strip (finite width across z) of a slowly folding surface. Returns its density at q, and how
// close q is to the strip's two long edges (they glow brighter, like the reference's folded edge).
vec2 ribbon(vec3 q, float t) {
  // twist the strip along its length, so it folds over itself in S-curves
  float tw = q.x * (1.4 + uTight) + t * 0.6;
  float c = cos(tw), sn = sin(tw);
  vec2 yz = vec2(c * q.y - sn * q.z, sn * q.y + c * q.z);
  float f = 2.0 + uTight * 1.3;
  float y = (0.32 + uAmp * 0.18) * sin(q.x * f + t * 1.1) + 0.12 * sin(q.x * 3.6 - t * 1.5);
  float zc = 0.12 * sin(q.x * 2.4 + t * 0.9);                    // the strip wanders sideways as it goes
  float halfW = 0.40 + 0.08 * sin(t * 0.6 + q.x * 1.7);         // half its width
  float d = yz.x - y;
  float th = 0.115 + uAmp * 0.06;                               // its thickness (soft: it's seen through frost)
  float across = abs(yz.y - zc) / halfW;                        // 0 middle .. 1 edge
  float inside = 1.0 - smoothstep(0.8, 1.1, across);
  float sheetD = exp(-(d * d) / (th * th));
  float edge = exp(-pow((across - 0.9) / 0.16, 2.0)) * exp(-(d * d) / (th * th * 0.7));
  return vec2(sheetD * inside, edge);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  float R = 0.80 * (1.0 + uAmp * 0.035);
  vec2 s = p / R;
  float r = length(s);

  // a faint halo outside the glass
  if (r > 1.0) {
    float halo = exp(-(r - 1.0) * 9.0) * 0.16 + exp(-(r - 1.0) * 3.0) * 0.05 * (0.5 + uAmp);
    gl_FragColor = vec4(vec3(0.95, 0.93, 1.0) * halo, halo);
    return;
  }

  float z = sqrt(1.0 - r * r);
  float t = uT;
  mat3 M = rotY(t * 0.31) * rotX(sin(t * 0.21) * 0.9 + 0.35);

  // march front to back, starting at a per-pixel random offset so the slices never show as stripes
  const int STEPS = 34;
  float jitter = hash(gl_FragCoord.xy + fract(t) * 17.0);
  vec3 acc = vec3(0.0);
  float a = 0.0;
  for (int i = 0; i < STEPS; i++) {
    float u = (float(i) + jitter) / float(STEPS);
    vec3 q = M * vec3(s, mix(z, -z, u));
    vec2 rb = ribbon(q, t);
    vec3 col = mix(mix(VIOLET, PINK, smoothstep(-0.8, 0.8, q.x)), SKY, smoothstep(-0.2, 1.0, q.z + 0.3 * q.y));
    col = mix(DEEP, col, 0.5 + 0.5 * smoothstep(-0.9, 0.5, q.y));
    float k = (rb.x * 1.3 + rb.y * 0.7) * (2.0 * z / float(STEPS)) * 2.6;
    vec3 c = col * (0.9 + rb.y * 0.8) + vec3(rb.y * 0.12);
    acc += (1.0 - a) * c * k;
    a += (1.0 - a) * k;
  }
  vec3 inner = acc / max(a, 1e-3);

  // frosted glass: grey in the middle, white at the rim, a little lighter toward the top
  vec3 glass = mix(vec3(0.55, 0.55, 0.60), vec3(0.95, 0.95, 0.98), smoothstep(0.35, 1.0, r));
  glass += 0.05 * (s.y * 0.5 + 0.5);
  float show = clamp(a * 1.5, 0.0, 0.95) * (1.0 - smoothstep(0.62, 1.0, r) * 0.85);  // the frost hides it toward the rim
  vec3 col = mix(glass, inner, show);
  col += 0.12 * pow(1.0 - z, 4.0);                                                   // rim light

  float edge = 1.0 - smoothstep(0.988, 1.0, r);
  float halo = 0.16 * (1.0 - edge);
  gl_FragColor = vec4(col * edge + vec3(halo), edge + halo);
}`;

/** How each state moves: speed of the turning, how busy the folds are, and how much sound shows. */
const MOVE: Record<TalkState, { speed: number; tight: number; gain: number }> = {
  idle: { speed: 0.35, tight: 0, gain: 0 },
  listening: { speed: 0.55, tight: 0.1, gain: 1 },
  thinking: { speed: 1.5, tight: 1, gain: 0 },
  speaking: { speed: 0.8, tight: 0.25, gain: 1 },
};

export function Orb({ state, className = '' }: { state: TalkState; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) {
      cv.dataset.fallback = '';
      return;
    }
    const sh = (type: number, src: string) => {
      const x = gl.createShader(type)!;
      gl.shaderSource(x, src);
      gl.compileShader(x);
      return x;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      cv.dataset.fallback = '';
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uT = gl.getUniformLocation(prog, 'uT');
    const uAmp = gl.getUniformLocation(prog, 'uAmp');
    const uTight = gl.getUniformLocation(prog, 'uTight');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // a phone draws at 2x at most: the shader runs per pixel, and the glass is soft anyway
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cv.clientWidth * dpr));
      const h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();

    let raf = 0;
    let last = performance.now();
    let t = 7.3; // start mid-fold, not from a flat sheet
    let amp = 0, tight = 0, speed = MOVE.idle.speed;
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(cv);

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = MOVE[stateRef.current];
      const level = stateRef.current === 'listening' ? micLevel() : stateRef.current === 'speaking' ? speechLevel() : 0;
      // ease toward the state's look, quickly toward a louder sound, slowly back down
      speed += (m.speed - speed) * Math.min(1, dt * 2.5);
      tight += (m.tight - tight) * Math.min(1, dt * 2);
      const target = level * m.gain;
      amp += (target - amp) * Math.min(1, dt * (target > amp ? 14 : 4));
      if (!reduce) t += dt * (speed + amp * 0.9);
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.uniform1f(uT, t);
      gl!.uniform1f(uAmp, amp);
      gl!.uniform1f(uTight, tight);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      if (onScreen && document.visibilityState === 'visible' && !reduce) raf = requestAnimationFrame(frame);
      else if (reduce) raf = 0;
    }
    const wake = () => {
      if (document.visibilityState === 'visible' && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', wake);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', wake);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className={`block size-full [&[data-fallback]]:rounded-full [&[data-fallback]]:bg-[radial-gradient(circle_at_50%_45%,#C4B5FD_0%,#F9A8D4_35%,#E5E7EB_70%,#F8FAFC_100%)] ${className}`}
    />
  );
}
