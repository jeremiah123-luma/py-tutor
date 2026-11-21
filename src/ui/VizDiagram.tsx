// Frames and objects for one visualizer step, with arrows from each reference to the object it points to.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { VizFrame, VizObject, VizStep, VizValue } from '../types';

type Arrow = { d: string; key: string; active: boolean };

const isRef = (v: VizValue): v is ['ref', number] => v[0] === 'ref';

/** Lay objects out in rows, Python Tutor style: each object a frame points to starts a row; what it points to sits to its right. */
export function layoutRows(step: VizStep): number[][] {
  const heap = new Map(step.heap);
  const placed = new Set<number>();
  const rows: number[][] = [];
  const children = (o: VizObject | undefined): VizValue[] => {
    if (!o) return [];
    if ('items' in o) return o.items;
    if ('pairs' in o) return o.pairs.flat();
    if ('attrs' in o) return o.attrs.map((a) => a[1]);
    return [];
  };
  const visit = (id: number, row: number[]) => {
    if (placed.has(id) || !heap.has(id)) return;
    placed.add(id);
    row.push(id);
    for (const c of children(heap.get(id))) if (isRef(c)) visit(c[1], row);
  };
  for (const f of step.frames)
    for (const v of [...f.vars.map((x) => x[1]), ...(f.returnValue ? [f.returnValue] : [])])
      if (isRef(v) && !placed.has(v[1])) {
        const row: number[] = [];
        visit(v[1], row);
        rows.push(row);
      }
  for (const [id] of step.heap)
    if (!placed.has(id)) {
      const row: number[] = [];
      visit(id, row);
      rows.push(row);
    }
  return rows;
}

function Prim({ v }: { v: VizValue }) {
  const color = v[0] === 'str' ? 'text-[var(--syn-string)]' : v[0] === 'none' || v[0] === 'bool' ? 'text-[var(--syn-keyword)]' : 'text-[var(--syn-number)]';
  return <span className={`font-code break-all ${color}`}>{v[1]}</span>;
}

/** A value cell: inline for primitives, a dot (arrow start) for references. */
function Val({ v, src, objLabel }: { v: VizValue; src: string; objLabel: (id: number) => string }) {
  if (!isRef(v)) return <Prim v={v} />;
  return (
    <span className="inline-flex items-center" data-src={src} data-to={v[1]}>
      <span className="size-2.5 rounded-full bg-ink-2" aria-hidden="true" />
      <span className="sr-only">points to {objLabel(v[1])}</span>
    </span>
  );
}

function ObjBody({ id, o, objLabel }: { id: number; o: VizObject; objLabel: (id: number) => string }) {
  const cell = 'border border-line-strong bg-surface px-2 py-1';
  switch (o.kind) {
    case 'list':
    case 'tuple':
    case 'set':
      return o.items.length === 0 ? (
        <p className="px-1 text-sm text-ink-3">empty {o.label}</p>
      ) : (
        <div className={`flex flex-wrap ${o.kind === 'set' ? 'gap-1' : ''}`}>
          {o.items.map((v, i) => (
            <div key={i} className={`${cell} -ml-px min-w-9 first:ml-0 ${o.kind === 'tuple' ? 'bg-surface-2' : ''}`}>
              {o.kind !== 'set' && <p className="text-[0.6875rem] leading-none text-ink-3">{i}</p>}
              <div className="mt-0.5 text-[0.8125rem]">
                <Val v={v} src={`o${id}-${i}`} objLabel={objLabel} />
              </div>
            </div>
          ))}
          {o.more > 0 && <div className={`${cell} -ml-px text-sm text-ink-3`}>+{o.more} more</div>}
        </div>
      );
    case 'dict':
      return o.pairs.length === 0 ? (
        <p className="px-1 text-sm text-ink-3">empty dict</p>
      ) : (
        <table className="border-collapse text-[0.8125rem]">
          <tbody>
            {o.pairs.map(([k, v], i) => (
              <tr key={i}>
                <td className={`${cell} text-right`}><Val v={k} src={`o${id}-k${i}`} objLabel={objLabel} /></td>
                <td className={cell}><Val v={v} src={`o${id}-v${i}`} objLabel={objLabel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'instance':
    case 'class':
      return o.attrs.length === 0 ? (
        <p className="px-1 text-sm text-ink-3">no attributes yet</p>
      ) : (
        <table className="border-collapse text-[0.8125rem]">
          <tbody>
            {o.attrs.map(([k, v]) => (
              <tr key={k}>
                <td className={`${cell} text-right font-code text-ink-2`}>{k}</td>
                <td className={cell}><Val v={v} src={`o${id}-${k}`} objLabel={objLabel} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'function':
      return <p className="font-code text-[0.8125rem] text-[var(--syn-func)]">{o.name}</p>;
    case 'file':
      return (
        <p className="font-code text-[0.8125rem] text-ink">
          {`'${o.name}'`} <span className="text-ink-3">mode {`'${o.mode}'`} · {o.closed ? 'closed' : 'open'}</span>
        </p>
      );
    default:
      return <p className="font-code text-[0.8125rem] text-ink">{o.repr}</p>;
  }
}

function FrameCard({ f, active, changed, objLabel }: { f: VizFrame; active: boolean; changed: Set<string>; objLabel: (id: number) => string }) {
  return (
    <div
      className={`rounded-lg border p-2.5 transition-colors ${active ? 'border-accent/70 bg-accent/[0.06]' : 'border-line bg-surface/60 opacity-70'}`}
      aria-label={`${f.name}${active ? ', running now' : ''}`}
    >
      <p className={`mb-1.5 text-sm font-medium ${active ? 'text-ink' : 'text-ink-2'}`}>{f.name === 'Global frame' || f.name.startsWith('Defining class ') ? f.name : `${f.name}()`}</p>
      {f.vars.length === 0 && !f.returnValue ? (
        <p className="text-sm text-ink-3">No variables yet.</p>
      ) : (
        <table className="w-full text-[0.8125rem]">
          <tbody>
            {f.vars.map(([k, v]) => (
              <tr key={k} className={changed.has(`${f.id}:${k}`) ? 'animate-[var-flash_1200ms_var(--ease-out)]' : ''}>
                <td className="py-1 pr-2 text-right align-middle font-code text-ink-2">{k}</td>
                <td className="border-b border-l border-line py-1 pl-2 align-middle">
                  <Val v={v} src={`f${f.id}-${k}`} objLabel={objLabel} />
                </td>
              </tr>
            ))}
            {f.returnValue && (
              <tr className="animate-[var-flash_1200ms_var(--ease-out)]">
                <td className="py-1 pr-2 text-right align-middle text-ink-2">Return value</td>
                <td className="border-b border-l border-line py-1 pl-2 align-middle">
                  <Val v={f.returnValue} src={`f${f.id}-return`} objLabel={objLabel} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function VizDiagram({ step, prev }: { step: VizStep; prev?: VizStep }) {
  const box = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const heap = useMemo(() => new Map(step.heap), [step]);
  const rows = useMemo(() => layoutRows(step), [step]);
  const objLabel = (id: number) => heap.get(id)?.label ?? 'an object';
  const activeId = step.frames.at(-1)?.id;

  // What changed since the last step (flashes once).
  const changed = useMemo(() => {
    const s = new Set<string>();
    if (!prev) return s;
    const before = new Map(prev.frames.flatMap((f) => f.vars.map(([k, v]) => [`${f.id}:${k}`, JSON.stringify(v)] as const)));
    for (const f of step.frames) for (const [k, v] of f.vars) if (before.get(`${f.id}:${k}`) !== JSON.stringify(v)) s.add(`${f.id}:${k}`);
    return s;
  }, [step, prev]);
  const changedObjs = useMemo(() => {
    const s = new Set<number>();
    if (!prev) return s;
    const before = new Map(prev.heap.map(([id, o]) => [id, JSON.stringify(o)]));
    for (const [id, o] of step.heap) if (before.get(id) !== JSON.stringify(o)) s.add(id);
    return s;
  }, [step, prev]);

  // Draw arrows once the boxes are laid out (and again if anything resizes).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const r0 = el.getBoundingClientRect();
      const out: Arrow[] = [];
      el.querySelectorAll<HTMLElement>('[data-src]').forEach((s) => {
        const to = el.querySelector<HTMLElement>(`[data-obj="${s.dataset.to}"]`);
        if (!to) return;
        const a = s.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.left + a.width / 2 - r0.left + el.scrollLeft;
        const y1 = a.top + a.height / 2 - r0.top + el.scrollTop;
        let x2 = b.left - r0.left + el.scrollLeft;
        const y2 = b.top + 14 - r0.top + el.scrollTop;
        let d: string;
        if (x2 >= x1 + 12) {
          const dx = Math.max(30, (x2 - x1) / 2);
          d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2 - 2},${y2}`;
        } else {
          // target is left of (or under) the source: loop out to the right and come in from the top
          x2 = b.left + Math.min(24, b.width / 2) - r0.left + el.scrollLeft;
          const top = b.top - r0.top + el.scrollTop;
          d = `M${x1},${y1} C${x1 + 60},${y1} ${x2},${top - 50} ${x2},${top - 2}`;
        }
        out.push({ d, key: s.dataset.src!, active: s.dataset.src!.startsWith(`f${activeId}-`) });
      });
      setArrows(out);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    el.querySelectorAll('[data-obj], [data-frame]').forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [step, activeId]);

  return (
    <div ref={box} className="relative h-full overflow-auto p-4" aria-label="Frames and objects">
      <div className="flex min-w-max gap-10 md:gap-14">
        <section className="w-48 shrink-0 md:w-56">
          <p className="mb-2 text-xs font-medium tracking-wide text-ink-3 uppercase">Frames</p>
          <div className="space-y-3">
            {step.frames.map((f) => (
              <div key={f.id} data-frame={f.id}>
                <FrameCard f={f} active={f.id === activeId} changed={changed} objLabel={objLabel} />
              </div>
            ))}
          </div>
        </section>
        <section className="min-w-48">
          <p className="mb-2 text-xs font-medium tracking-wide text-ink-3 uppercase">Objects</p>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-3">No objects yet.</p>
          ) : (
            <div className="space-y-5">
              {rows.map((row) => (
                <div key={row.join('-')} className="flex items-start gap-12">
                  {row.map((id) => {
                    const o = heap.get(id)!;
                    return (
                      <div key={id} data-obj={id} className={`shrink-0 ${changedObjs.has(id) ? 'animate-[var-flash_1200ms_var(--ease-out)] rounded-md' : ''}`}>
                        <p className="mb-1 text-xs text-ink-3">{o.label}</p>
                        <ObjBody id={id} o={o} objLabel={objLabel} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <svg className="pointer-events-none absolute top-0 left-0" width={size.w} height={size.h} aria-hidden="true">
        <defs>
          {(['on', 'off'] as const).map((k) => (
            <marker key={k} id={`viz-head-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={k === 'on' ? 'var(--accent)' : 'var(--ink-3)'} />
            </marker>
          ))}
        </defs>
        {arrows.map((a) => (
          <path
            key={a.key}
            d={a.d}
            fill="none"
            stroke={a.active ? 'var(--accent)' : 'var(--ink-3)'}
            strokeWidth={1.5}
            markerEnd={`url(#viz-head-${a.active ? 'on' : 'off'})`}
          />
        ))}
      </svg>
    </div>
  );
}

export function describeStep(step: VizStep, i: number): ReactNode {
  const fname = step.frames.at(-1)?.name;
  if ((step as VizStep & { classBody?: boolean }).classBody && step.event === 'line') {
    return <>Defining class <code className="font-code">{fname?.replace(/^Defining class /, '')}</code>: line {step.line} sets up what every instance will share.</>;
  }
  switch (step.event) {
    case 'call':
      return <>Calling <code className="font-code">{fname}()</code>. Python makes a new frame for its variables.</>;
    case 'return':
      return <><code className="font-code">{fname}()</code> is about to return. Its return value is shown in its frame.</>;
    case 'exception':
      return (
        <>
          Line {step.line} raised <code className="font-code">{step.exception}</code>. Python looks for an <code className="font-code">except</code> that handles it; with none, the program stops.
        </>
      );
    case 'error':
      return <span className="text-err">The program stopped with an error: {step.exception}</span>;
    case 'done':
      return <>The program finished. This is how everything ended up.</>;
    default:
      if (i === 0 || step.prevLine == null) return <>Ready to run line {step.line}.</>;
      if (step.frames.length > 1 && fname && !fname.startsWith('Defining class ')) return <>Inside <code className="font-code">{fname}()</code>: running line {step.line}.</>;
      return <>Line {step.prevLine} just ran. Next up: line {step.line}.</>;
  }
}
