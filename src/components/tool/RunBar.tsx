import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { basename } from '@/core/format';
import type { ToolRun } from '@/core/useToolRun';
import { Button, Progress } from '@/components/ui';

/**
 * Only the most recently mounted action row answers ⌘⇧C, so a tool that renders
 * more than one does not fire them all at once.
 */
const actionStack: Array<() => void> = [];

/**
 * The action row a tool renders below its options: one primary button that turns
 * into a cancel button while a job is running, plus live progress.
 *
 * Also binds ⌘⇧C (the app-wide "run this tool" shortcut).
 */
export function ToolActions({
  run,
  onRun,
  label = 'Run',
  icon = 'Play',
  disabled,
  disabledReason,
  children,
  className,
}: {
  run: ToolRun;
  onRun: () => void;
  label?: string;
  icon?: string;
  disabled?: boolean;
  disabledReason?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const handler = useRef<() => void>(() => undefined);
  handler.current = () => {
    if (run.running || disabled) return;
    onRun();
  };

  useEffect(() => {
    const fire = () => handler.current();
    actionStack.push(fire);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        // Let the browser's own copy shortcut win inside a text field.
        const target = e.target as HTMLElement | null;
        if (target?.closest('input, textarea, [contenteditable]')) return;
        if (actionStack[actionStack.length - 1] !== fire) return;
        e.preventDefault();
        fire();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const index = actionStack.indexOf(fire);
      if (index >= 0) actionStack.splice(index, 1);
    };
  }, []);

  return (
    <div className={clsx('space-y-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {run.running ? (
          <Button variant="secondary" size="lg" icon="Square" onClick={run.cancel}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon={icon}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            onClick={onRun}
          >
            {label}
          </Button>
        )}
        {children}
      </div>
      {run.running && (
        <div className="space-y-1">
          <Progress value={run.progress} />
          <p className="truncate text-[11.5px] text-ink-faint">
            {run.total > 1 ? `${run.done} of ${run.total} · ` : ''}
            {run.currentFile ? basename(run.currentFile) : 'Working…'}
          </p>
        </div>
      )}
      {disabled && disabledReason && !run.running && (
        <p className="text-[11.5px] text-ink-faint">{disabledReason}</p>
      )}
    </div>
  );
}
