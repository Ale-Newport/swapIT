import { useState } from 'react';
import { openPath, revealInFinder } from '@/core/bridge';
import { formatBytes, sizeDelta } from '@/core/format';
import type { BatchResult, ToolboxError } from '@/core/types';
import { Alert, Badge, Button, Card, Icon, IconButton, Section } from '@/components/ui';

export function ErrorDisplay({ error, onRetry }: { error: ToolboxError; onRetry?: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const tone = error.kind === 'missing_dependency' ? 'warn' : 'danger';
  return (
    <Alert tone={tone} title={error.message} action={onRetry ? <Button size="sm" onClick={onRetry}>Retry</Button> : undefined}>
      {error.details && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[11.5px] underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            <Icon name={showDetails ? 'ChevronDown' : 'ChevronRight'} size={12} />
            Technical details
          </button>
          {showDetails && (
            <pre className="selectable mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/5 p-2 font-mono text-[11px] leading-[1.5]">
              {error.details}
            </pre>
          )}
        </>
      )}
    </Alert>
  );
}

/** The "Completed" screen: what was produced, how big it is, and what to do next. */
export function ResultPanel({
  result,
  onProcessAgain,
  title = 'Completed',
}: {
  result: BatchResult;
  onProcessAgain?: () => void;
  title?: string;
}) {
  const { results, failures, cancelled, elapsedMs } = result;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? results : results.slice(0, 8);

  const totalBefore = results.reduce((sum, r) => sum + (r.sourceSize ?? 0), 0);
  const totalAfter = results.reduce((sum, r) => sum + r.size, 0);
  const hasSizes = totalBefore > 0 && results.some((r) => r.sourceSize);
  const delta = hasSizes ? sizeDelta(totalBefore, totalAfter) : null;
  const firstDir = results[0]?.path.split('/').slice(0, -1).join('/');

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Icon
            name={cancelled ? 'CircleSlash' : failures.length && !results.length ? 'CircleAlert' : 'CircleCheck'}
            size={15}
            className={cancelled ? 'text-ink-faint' : failures.length && !results.length ? 'text-danger' : 'text-success'}
          />
          {cancelled ? 'Cancelled' : title}
        </span>
      }
      description={
        <>
          {results.length} file{results.length === 1 ? '' : 's'} produced
          {elapsedMs > 0 && ` · ${(elapsedMs / 1000).toFixed(elapsedMs < 10000 ? 2 : 1)}s`}
          {failures.length > 0 && ` · ${failures.length} failed`}
        </>
      }
      actions={
        <>
          {firstDir && (
            <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(results[0].path)}>
              Reveal in Finder
            </Button>
          )}
          {onProcessAgain && (
            <Button size="sm" variant="ghost" icon="RotateCcw" onClick={onProcessAgain}>
              Process again
            </Button>
          )}
        </>
      }
    >
      {delta && (
        <Card className="mb-3 flex items-center justify-between gap-4 bg-canvas" padded={false}>
          <div className="flex flex-1 items-center gap-6 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Original</p>
              <p className="text-[14px] font-medium text-ink">{formatBytes(totalBefore)}</p>
            </div>
            <Icon name="ArrowRight" size={14} className="text-ink-faint" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Result</p>
              <p className="text-[14px] font-medium text-ink">{formatBytes(totalAfter)}</p>
            </div>
            <Badge tone={delta.smaller ? 'success' : 'warn'} className="ml-auto">
              {delta.label}
            </Badge>
          </div>
        </Card>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {visible.map((r) => {
          const d = r.sourceSize ? sizeDelta(r.sourceSize, r.size) : null;
          return (
            <li key={r.path} className="group flex items-center gap-2.5 bg-panel px-3 py-2">
              <Icon name="FileCheck2" size={14} className="shrink-0 text-success" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={r.path}>
                {r.name}
              </span>
              {r.note && <Badge>{r.note}</Badge>}
              {r.disposition === 'skipped' && <Badge tone="warn">Skipped</Badge>}
              {r.disposition === 'renamed' && <Badge>Renamed</Badge>}
              <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(r.size)}</span>
              {d && (
                <span className={`shrink-0 text-[11.5px] ${d.smaller ? 'text-success' : 'text-ink-faint'}`}>
                  {d.smaller ? '−' : '+'}
                  {Math.abs(d.percent).toFixed(0)}%
                </span>
              )}
              <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton icon="ExternalLink" label="Open" size="sm" onClick={() => void openPath(r.path)} />
                <IconButton icon="FolderOpen" label="Reveal in Finder" size="sm" onClick={() => void revealInFinder(r.path)} />
                <IconButton
                  icon="Copy"
                  label="Copy path"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(r.path)}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {results.length > visible.length && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setExpanded(true)}>
          Show {results.length - visible.length} more
        </Button>
      )}

      {failures.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {failures.slice(0, 5).map((f) => (
            <Alert key={f.path + f.message} tone="danger" title={f.name}>
              {f.message}
            </Alert>
          ))}
          {failures.length > 5 && (
            <p className="text-[12px] text-ink-faint">…and {failures.length - 5} more failures.</p>
          )}
        </div>
      )}
    </Section>
  );
}
