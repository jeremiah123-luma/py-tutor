import type { ButtonHTMLAttributes, ReactNode } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Keyboard, Mic } from 'lucide-react';
import type { Mode } from '../types';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-45',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink-3 disabled:text-ink-3',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2 disabled:text-ink-3',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-[0.9375rem] gap-2 rounded-lg',
  lg: 'min-h-14 px-6 py-3 text-md gap-2.5 rounded-xl whitespace-normal text-left',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Icon after the label (use for forward actions). */
  iconEnd?: ReactNode;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconEnd, loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`press inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconEnd}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 animate-spin ${className}`} aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ModeToggle({ mode, onChange, size = 'sm' }: { mode: Mode; onChange: (m: Mode) => void; size?: 'sm' | 'lg' }) {
  const item =
    size === 'lg'
      ? 'h-12 px-4 gap-2 text-[0.9375rem]'
      : 'h-9 px-3 gap-1.5 text-sm';
  return (
    <ToggleGroup.Root
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as Mode)}
      aria-label="How you want to learn"
      className="inline-flex rounded-lg bg-surface-2 p-1"
    >
      {(
        [
          ['type', 'Type', <Keyboard key="k" className="size-4" strokeWidth={1.75} />],
          ['talk', 'Talk', <Mic key="m" className="size-4" strokeWidth={1.75} />],
        ] as const
      ).map(([value, label, icon]) => (
        <ToggleGroup.Item
          key={value}
          value={value}
          aria-label={label}
          className={`press inline-flex items-center rounded-md font-medium text-ink-2 hover:text-ink data-[state=on]:bg-seg-on data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.08)] ${item}`}
        >
          {icon}
          <span className={size === 'sm' ? 'max-sm:sr-only' : ''}>{label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
