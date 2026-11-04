import { useTaskStore } from '@/core/tasks';
import { useRadial } from '../store';
import { Icon } from '@/components/ui';
import { cancelCurrent, clearHudTimer, closeRadial, scheduleClose } from '../runner';
import type { HudState } from '../store';
import { copyText } from '../system';
import { useState } from 'react';

function StatusIcon({ status }: { status: HudState['status'] }) {
  if (status === 'working') {
    return (
      <span className="rg-hud-icon" aria-hidden="true">
        <Icon name="Loader2" size={22} className="rg-spin" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="rg-hud-icon" data-tone="error" aria-hidden="true">
        <Icon name="TriangleAlert" size={22} />
      </span>
    );
  }
  return (
    <span className="rg-hud-icon rg-check" data-tone="ok" aria-hidden="true">
      <Icon name="Check" size={22} strokeWidth={2.6} />
    </span>
  );
}

/**
 * The progress pill: where a petal's work shows up after the ring collapses.
 * It floats under the menu bar, never takes focus, and waits while the pointer
 * is on it so a result can be read, copied or undone.
 */
export function Hud({ hud }: { hud: HudState }) {
  const task = useTaskStore((s) => (hud.taskId ? s.tasks.find((t) => t.id === hud.taskId) : undefined));
  const [copied, setCopied] = useState(false);
  const closing = useRadial((s) => s.closing);
  const progress = task?.progress ?? null;
  const detail =
    hud.status === 'working' && task?.currentFile
      ? `${task.done}/${task.total} · ${task.currentFile.split('/').pop()}`
      : hud.detail;
  const actions = hud.result?.actions ?? [];

  return (
    <div
      className="rg-panel rg-hud"
      data-status={hud.status}
      data-closing={closing}
      onPointerEnter={clearHudTimer}
      onPointerLeave={() => {
        if (hud.status !== 'working') scheduleClose(2600);
      }}
    >
      <div className="rg-hud-row">
        <StatusIcon status={hud.status} />
        <div className="rg-hud-text">
          <div className="rg-hud-title" title={hud.title}>
            {hud.title}
          </div>
          {detail && <div className="rg-hud-detail">{detail}</div>}
        </div>
        <div className="rg-hud-actions">
          {hud.status === 'working' && (
            <button type="button" className="rg-btn" onClick={() => void cancelCurrent()}>
              Cancel
            </button>
          )}
          {hud.status !== 'working' && (
            <button type="button" className="rg-icon-btn" aria-label="Dismiss" onClick={() => closeRadial({ restoreFocus: false })}>
              <Icon name="X" size={13} />
            </button>
          )}
        </div>
      </div>

      {hud.status === 'done' && actions.length > 0 && (
        <div className="rg-hud-foot">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="rg-btn rg-btn-sm"
              data-primary={a.primary ? 'true' : undefined}
              onClick={() => void Promise.resolve(a.run()).catch(() => undefined)}
            >
              <Icon name={a.icon} size={12} />
              {a.label}
            </button>
          ))}
        </div>
      )}

      {hud.status === 'working' && (
        <div className="rg-progress" data-indeterminate={progress === null} style={{ margin: '10px 0 0' }}>
          <i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
        </div>
      )}

      {hud.status === 'done' && hud.result?.snippet && (
        <div className="rg-hud-snippet selectable">{hud.result.snippet}</div>
      )}

      {hud.status === 'error' && hud.fix && (
        <div className="rg-hud-fix">
          <code className="selectable">{hud.fix.command}</code>
          <button
            type="button"
            className="rg-btn"
            onClick={() => {
              void copyText(hud.fix?.command ?? '');
              setCopied(true);
            }}
          >
            <Icon name={copied ? 'Check' : 'Copy'} size={13} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
