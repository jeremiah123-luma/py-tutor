// Distortion wave: the "it worked" moment. A ring of light leaves the point you tapped, splits into colour at its
// edges (chromatic fringe), sparkles as it passes, and lights the panel's edges when it reaches them. The panel
// leans toward the tap and blurs for a beat as the ring goes through, then settles.
//
// The ring is a WebGL fragment shader on a canvas laid over the element (mix-blend-mode: screen), so it costs
// nothing when idle and the DOM underneath stays live. No WebGL: the panel still leans, and its edges glow in CSS.
// Reduced motion: no wave at all; the UI already says what happened in words.

export type WaveTone = 'success' | 'iridescent';

export interface WaveOptions {
  /** Viewport point the wave starts from (usually the pointer). Defaults to the element's centre. */
  origin?: { x: number; y: number } | null;
  tone?: WaveTone;
  /** Total length in ms. */
  duration?: number;
  /** Lean the element toward the origin (off for full-screen layers). */
  tilt?: boolean;
  /** 'screen' (default) glows over dark surfaces; 'normal' keeps the ring visible over light colour. */
  blend?: 'screen' | 'normal';
}

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
precision highp float;
uniform vec2 uRes;   // canvas size, device px
uniform vec2 uO;     // origin, device px, y down
uniform float uT;    // progress 0..1
uniform float uMax;  // farthest corner, css px
uniform float uDpr;
uniform float uTone; // 0 success, 1 iridescent
uniform float uSeed;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
// iridescence in the brand's own colours: violet, pink, lilac, sky
vec3 irid(float h){
  h=fract(h)*4.;
  vec3 c0=vec3(.655,.545,.980),c1=vec3(.976,.659,.831),c2=vec3(.769,.710,.992),c3=vec3(.576,.773,.992);
  float f=smoothstep(0.,1.,fract(h));
  if(h<1.)return mix(c0,c1,f);
  if(h<2.)return mix(c1,c2,f);
  if(h<3.)return mix(c2,c3,f);
  return mix(c3,c0,f);
}

void main(){
  vec2 frag=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 dv=(frag-uO)/uDpr;
  float d=length(dv);
  float a=atan(dv.y,dv.x);
  float t=uT;
  float e=1.-pow(1.-t,3.);

  // the ring: radius grows with an ease-out, its edge wobbles with angular noise
  float wob=(noise(vec2(a*2.2+uSeed,t*2.5))-.5)*44.*(.35+e);
  float r=uMax*1.12*e+wob;
  float w=mix(10.,64.,e);
  float off=mix(3.,18.,e);
  float bR=exp(-pow((d-(r+off))/w,2.));
  float bG=exp(-pow((d-r)/w,2.));
  float bB=exp(-pow((d-(r-off))/w,2.));

  vec3 tint=uTone<.5
    ? mix(vec3(.20,.92,.45),vec3(.55,1.,.30),noise(vec2(a*3.,t*4.)))
    : irid(a/6.2831+t*.7+d*.0018);

  vec3 col=tint*bG*1.05;
  // chromatic fringe: red leads the ring, blue trails it
  col+=max(vec3(bR,0.,bB)-vec3(bG),0.)*vec3(1.1,.55,1.3);
  // faint wash inside the ring, gone by the time it lands
  col+=tint*smoothstep(r,r-260.,d)*.08*(1.-e);
  // sparkles riding the ring
  vec2 q=frag/uDpr/4.;vec2 cell=floor(q);
  float s=step(.975,hash(cell+floor(t*24.)+uSeed))*smoothstep(.5,.15,length(fract(q)-.5));
  col+=vec3(s*bG);
  // the edges light up once the ring reaches them, then fade
  vec2 pc=frag/uDpr;vec2 sz=uRes/uDpr;
  float edge=min(min(pc.x,pc.y),min(sz.x-pc.x,sz.y-pc.y));
  float lit=smoothstep(.25,.6,t)*(1.-smoothstep(.62,1.,t));
  col+=tint*exp(-edge/12.)*lit*.85;

  col*=1.-smoothstep(.82,1.,t);
  float al=clamp(max(col.r,max(col.g,col.b)),0.,1.);
  gl_FragColor=vec4(col,al);
}`;

const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

function compile(gl: WebGLRenderingContext): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = sh(gl.VERTEX_SHADER, VERT);
  const f = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const active = new WeakMap<Element, () => void>();

/**
 * Send a wave through `el`. Resolves when the ring has crossed most of the element (a good moment to change
 * what's on screen), so callers can `await` it before navigating. Never throws.
 */
export function distortionWave(el: HTMLElement | null | undefined, opts: WaveOptions = {}): Promise<void> {
  if (!el || typeof window === 'undefined' || reduceMotion()) return Promise.resolve();
  active.get(el)?.();

  const duration = opts.duration ?? 1150;
  const tone = opts.tone ?? 'success';
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return Promise.resolve();
  const ox = (opts.origin?.x ?? rect.left + rect.width / 2) - rect.left;
  const oy = (opts.origin?.y ?? rect.top + rect.height / 2) - rect.top;
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(rect.width - ox, oy), Math.hypot(ox, rect.height - oy), Math.hypot(rect.width - ox, rect.height - oy));

  // The lean: the side nearest the tap presses in.
  const anims: Animation[] = [];
  if (opts.tilt !== false) {
    const nx = Math.max(-1, Math.min(1, (ox - rect.width / 2) / (rect.width / 2)));
    const ny = Math.max(-1, Math.min(1, (oy - rect.height / 2) / (rect.height / 2)));
    const deg = rect.width > 900 ? 1.6 : 3.2;
    const lean = `perspective(1000px) rotateY(${(nx * deg).toFixed(2)}deg) rotateX(${(-ny * deg).toFixed(2)}deg)`;
    try {
      anims.push(
        el.animate(
          [
            { transform: 'none', filter: 'none' },
            { transform: `${lean} scale(0.988)`, filter: 'none', offset: 0.16 },
            { transform: `perspective(1000px) rotateY(${(nx * deg * 0.3).toFixed(2)}deg) rotateX(${(-ny * deg * 0.3).toFixed(2)}deg) scale(1.006)`, filter: 'blur(1.2px) saturate(1.35)', offset: 0.42 },
            { transform: 'none', filter: 'none' },
          ],
          { duration: duration * 0.9, easing: EASE },
        ),
      );
    } catch {
      /* WAAPI missing: the ring alone still plays */
    }
  }

  // The ring.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.wave = tone;
  const radius = getComputedStyle(el).borderRadius;
  Object.assign(canvas.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: 'none',
    zIndex: '120',
    mixBlendMode: opts.blend ?? 'screen',
    borderRadius: radius,
  } satisfies Partial<CSSStyleDeclaration>);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  } catch {
    gl = null;
  }
  const prog = gl ? compile(gl) : null;

  return new Promise<void>((resolve) => {
    let raf = 0;
    let resolved = false;
    const settle = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      canvas.remove();
      for (const a of anims) {
        try {
          a.cancel();
        } catch {
          /* gone */
        }
      }
      try {
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* ignore */
      }
      active.delete(el);
      settle();
    };
    active.set(el, cleanup);

    if (!gl || !prog) {
      // CSS fallback: a glow on the edges in the tone colour.
      const c = tone === 'success' ? '74 222 128' : '196 181 253';
      try {
        anims.push(
          el.animate(
            [
              { boxShadow: `inset 0 0 0 0 rgb(${c} / 0)` },
              { boxShadow: `inset 0 0 28px 2px rgb(${c} / 0.55)`, offset: 0.4 },
              { boxShadow: `inset 0 0 0 0 rgb(${c} / 0)` },
            ],
            { duration, easing: EASE },
          ),
        );
      } catch {
        /* ignore */
      }
      setTimeout(settle, duration * 0.55);
      setTimeout(cleanup, duration);
      return;
    }

    document.body.appendChild(canvas);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl!.getUniformLocation(prog, n);
    gl.uniform2f(u('uRes'), canvas.width, canvas.height);
    gl.uniform2f(u('uO'), ox * dpr, oy * dpr);
    gl.uniform1f(u('uMax'), far);
    gl.uniform1f(u('uDpr'), dpr);
    gl.uniform1f(u('uTone'), tone === 'success' ? 0 : 1);
    gl.uniform1f(u('uSeed'), Math.random() * 100);
    const uT = u('uT');
    gl.viewport(0, 0, canvas.width, canvas.height);

    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // follow the element if the page scrolls mid-wave
      const r = el.getBoundingClientRect();
      canvas.style.left = `${r.left}px`;
      canvas.style.top = `${r.top}px`;
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.uniform1f(uT, t);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      if (t > 0.55) settle();
      if (t < 1) raf = requestAnimationFrame(frame);
      else cleanup();
    };
    raf = requestAnimationFrame(frame);
  });
}

/** Last pointer-down position, so a wave can start where the person actually tapped. */
let lastPointer: { x: number; y: number; at: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY, at: performance.now() }), { capture: true, passive: true });
}
/** The last tap, if it was recent enough to still be "the" tap (default 10 s). */
export function recentTap(maxAgeMs = 10_000): { x: number; y: number } | null {
  return lastPointer && performance.now() - lastPointer.at < maxAgeMs ? { x: lastPointer.x, y: lastPointer.y } : null;
}
