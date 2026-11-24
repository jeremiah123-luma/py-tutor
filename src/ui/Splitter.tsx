// Draggable dividers for the lesson's panels (laptop and wider), like an editor's: drag to resize, double-click to
// put it back, arrow keys when focused. Sizes are kept on this device.
import { useCallback, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

export interface PanelLayout {
  /** width of the lesson column, px (unset = the default) */
  lw?: number;
  /** height of the lesson panel above the conversation, px */
  sh?: number;
  /** height of the output panel under the code, px */
  ch?: number;
  /** code on the left, lesson on the right */
  swap?: boolean;
}
const KEY = 'py-tutor.layout';

export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as PanelLayout;
      const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 40 && x < 5000 ? Math.round(x) : undefined);
      return { lw: n(v.lw), sh: n(v.sh), ch: n(v.ch), swap: v.swap === true };
    } catch {
      return {};
    }
  });
  const update = useCallback((patch: PanelLayout) => {
    setLayout((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: the layout just isn't kept */
      }
      return next;
    });
  }, []);
  return [layout, update] as const;
}

/**
 * One divider. `axis` x is a vertical bar dragged sideways; y is a horizontal bar dragged up and down.
 * `onDrag` gets the pointer position; `onNudge` gets a step in px from the arrow keys; `onReset` on double-click.
 */
export function Splitter({
  axis,
  label,
  className = '',
  style,
  onDrag,
  onNudge,
  onReset,
}: {
  axis: 'x' | 'y';
  label: string;
  className?: string;
  style?: CSSProperties;
  onDrag: (clientX: number, clientY: number) => void;
  onNudge: (px: number) => void;
  onReset: () => void;
}) {
  const [active, setActive] = useState(false);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    document.body.style.userSelect = 'none'; // no text gets selected while dragging
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (active) onDrag(e.clientX, e.clientY);
  };
  const up = () => {
    setActive(false);
    document.body.style.userSelect = '';
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === back) onNudge(-step);
    else if (e.key === fwd) onNudge(step);
    else if (e.key === 'Enter' || e.key === 'Home') onReset();
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title="Drag to resize. Double-click to reset."
      data-active={active || undefined}
      className={`splitter splitter-${axis} ${className}`}
      style={style}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={key}
    />
  );
}
