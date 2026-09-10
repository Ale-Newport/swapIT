import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Standard tool layout: a wide working column and a narrower options rail that
 * collapses under it on small windows.
 */
export function ToolShell({
  main,
  aside,
  footer,
  className,
}: {
  main: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('space-y-4', className)}>
      <div className={clsx('grid gap-4', aside ? 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px]' : 'grid-cols-1')}>
        <div className="min-w-0 space-y-4">{main}</div>
        {aside && <div className="min-w-0 space-y-4">{aside}</div>}
      </div>
      {footer}
    </div>
  );
}

/** Two-column grid for option fields. */
export function OptionsGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <div
      className={clsx(
        'grid gap-3',
        cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A row of preset buttons, used all over the image and video tools. */
export function PresetRow<T>({
  presets,
  onSelect,
  active,
  className,
}: {
  presets: Array<{ label: string; value: T; hint?: string }>;
  onSelect: (value: T) => void;
  active?: T;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap gap-1.5', className)}>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          title={p.hint}
          onClick={() => onSelect(p.value)}
          className={clsx(
            'rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
            active !== undefined && JSON.stringify(active) === JSON.stringify(p.value)
              ? 'border-ink bg-ink text-panel'
              : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
