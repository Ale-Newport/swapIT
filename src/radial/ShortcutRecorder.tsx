import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { acceleratorParts, captureAccelerator } from './accelerator';
import { radialSuspendShortcuts } from './native';

/**
 * Click, then press the combination you want. Escape backs out; the shortcut is
 * only changed once a complete, valid combination has been pressed.
 *
 * While it listens, the app's own global shortcuts are released — otherwise pressing the
 * current combination would open the ring instead of being recorded.
 */
export function ShortcutRecorder({
  value,
  onChange,
  error,
  registered,
  defaultValue,
  validate,
}: {
  value: string;
  onChange: (accelerator: string) => void;
  error?: string | null;
  registered?: boolean;
  /** The factory shortcut: when it differs from `value`, a reset button appears. */
  defaultValue?: string;
  /** A reason this combination cannot be used (already taken…), or null. */
  validate?: (accelerator: string) => string | null;
}) {
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef({ onChange, validate });
  useEffect(() => {
    latest.current = { onChange, validate };
  });

  useEffect(() => {
    if (!recording) return;
    void radialSuspendShortcuts(true).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRecording(false);
        setProblem(null);
        return;
      }
      const captured = captureAccelerator(e);
      if (captured.kind === 'incomplete') return;
      if (captured.kind === 'invalid') {
        setProblem(captured.reason);
        return;
      }
      const taken = latest.current.validate?.(captured.accelerator) ?? null;
      if (taken) {
        setProblem(taken);
        return;
      }
      setProblem(null);
      setRecording(false);
      latest.current.onChange(captured.accelerator);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      void radialSuspendShortcuts(false).catch(() => undefined);
    };
  }, [recording]);

  const parts = acceleratorParts(value);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setProblem(null);
            setRecording((r) => !r);
          }}
          onBlur={() => setRecording(false)}
          className={clsx(
            'flex h-8 min-w-[132px] items-center justify-center gap-1 rounded-lg border px-2.5 text-[12.5px] transition-colors',
            recording
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-line bg-panel text-ink hover:border-line-strong',
          )}
        >
          {recording ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Press a shortcut…
            </span>
          ) : parts.length > 0 ? (
            <span className="flex items-center gap-1">
              {parts.map((part, i) => (
                <kbd
                  key={i}
                  className="min-w-[20px] rounded-[5px] border border-line bg-canvas px-1.5 py-px text-center font-sans text-[12px] font-medium text-ink"
                >
                  {part}
                </kbd>
              ))}
            </span>
          ) : (
            <span className="text-ink-faint">Off</span>
          )}
        </button>
        {!recording && defaultValue !== undefined && value !== defaultValue && (
          <button
            type="button"
            aria-label="Back to the original shortcut"
            title="Back to the original"
            onClick={() => onChange(defaultValue)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <Icon name="RotateCcw" size={14} />
          </button>
        )}
        {!recording && value && (
          <button
            type="button"
            aria-label="Turn this shortcut off"
            title="Turn off"
            onClick={() => onChange('')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <Icon name="X" size={14} />
          </button>
        )}
      </div>
      {(problem || error) && (
        <p className="max-w-[260px] text-right text-[11px] text-danger">{problem ?? error}</p>
      )}
      {!problem && !error && value && registered === true && !recording && (
        <p className="flex items-center gap-1 text-[11px] text-success">
          <Icon name="Check" size={11} /> Active everywhere
        </p>
      )}
    </div>
  );
}
