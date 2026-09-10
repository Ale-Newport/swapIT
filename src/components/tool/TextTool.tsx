import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { useDropTarget } from '@/core/dnd';
import { Alert, Badge, Button, CopyButton, Icon, IconButton, Textarea } from '@/components/ui';

export interface TextTransformResult {
  output: string;
  /** Shown as a warning above the output without blocking it. */
  warning?: string;
  /** Small facts shown under the output, e.g. "142 lines removed". */
  stats?: Array<{ label: string; value: string }>;
}

export type TextTransform = (input: string) => string | TextTransformResult;

/**
 * Input → transform → output, with drag-and-drop of text files, copy, save and
 * live error reporting. Most text and developer tools are just a transform
 * function plus a couple of option controls.
 */
export function TextTool({
  transform,
  options,
  placeholder = 'Paste or type text here…',
  outputLabel = 'Result',
  inputLabel = 'Input',
  monoOutput = true,
  sampleText,
  live = true,
  actionLabel = 'Run',
  saveExtension = 'txt',
  renderOutput,
  minRows = 12,
}: {
  transform: TextTransform;
  options?: ReactNode;
  placeholder?: string;
  outputLabel?: string;
  inputLabel?: string;
  monoOutput?: boolean;
  sampleText?: string;
  live?: boolean;
  actionLabel?: string;
  saveExtension?: string;
  /** Replace the output textarea entirely (previews, diffs, tables). */
  renderOutput?: (output: string, input: string) => ReactNode;
  minRows?: number;
}) {
  const [input, setInput] = useState('');
  const [manualOutput, setManualOutput] = useState<TextTransformResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadFile = useCallback(async (path: string) => {
    try {
      setInput(await readTextFile(path));
      setLoadedFrom(path);
      setError(null);
    } catch {
      setError('That file could not be read as text.');
    }
  }, []);

  // Files handed over by the Home quick actions or the right-click menu land in
  // route state; without this a text tool opened from a dropped file starts empty.
  const location = useLocation();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const incoming = (location.state as { files?: string[] } | null)?.files;
    const first = incoming?.[0];
    if (!first || consumed.current === first) return;
    consumed.current = first;
    void loadFile(first);
  }, [location.state, loadFile]);

  const computed = useMemo(() => {
    if (!live) return null;
    if (!input) return { output: '' } as TextTransformResult;
    try {
      const result = transform(input);
      return typeof result === 'string' ? { output: result } : result;
    } catch (err) {
      return { output: '', warning: undefined, error: err instanceof Error ? err.message : String(err) } as
        TextTransformResult & { error: string };
    }
  }, [input, live, transform]);

  useEffect(() => {
    if (!live) return;
    const err = (computed as { error?: string } | null)?.error;
    setError(err ?? null);
  }, [computed, live]);

  const result = live ? computed : manualOutput;
  const output = result?.output ?? '';

  const runManual = useCallback(() => {
    try {
      const r = transform(input);
      setManualOutput(typeof r === 'string' ? { output: r } : r);
      setError(null);
    } catch (err) {
      setManualOutput(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [input, transform]);

  const { ref: dropRef, isOver } = useDropTarget(
    (paths) => {
      const first = paths[0];
      if (first) void loadFile(first);
    },
    { priority: 6 },
  );

  const browseForFile = useCallback(async () => {
    const picked = await openDialog({ multiple: false, directory: false });
    if (typeof picked === 'string') await loadFile(picked);
  }, [loadFile]);

  const saveOutput = async () => {
    if (!output) return;
    const target = await save({ defaultPath: `output.${saveExtension}` });
    if (!target) return;
    await writeTextFile(target, output);
  };

  const stats = result?.stats ?? [];

  return (
    <div className="space-y-4">
      {options && <div className="rounded-card border border-line bg-panel p-4">{options}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-ink-soft">{inputLabel}</label>
            <div className="flex items-center gap-1">
              {sampleText && (
                <Button size="sm" variant="ghost" onClick={() => setInput(sampleText)}>
                  Sample
                </Button>
              )}
              <Button size="sm" variant="ghost" icon="FolderOpen" onClick={() => void browseForFile()}>
                Open file
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="ClipboardPaste"
                onClick={async () => {
                  try {
                    setInput(await navigator.clipboard.readText());
                  } catch {
                    /* clipboard unavailable */
                  }
                }}
              >
                Paste
              </Button>
              <IconButton
                icon="X"
                label="Clear input"
                size="sm"
                onClick={() => {
                  setInput('');
                  setLoadedFrom(null);
                }}
              />
            </div>
          </div>
          <div ref={dropRef} className={isOver ? 'rounded-lg ring-2 ring-accent/40' : ''}>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isOver ? 'Release to load this file' : placeholder}
              rows={minRows}
              className="w-full"
            />
          </div>
          <p className="truncate text-[11px] text-ink-faint">
            {input.length.toLocaleString()} characters ·{' '}
            {loadedFrom ? `loaded from ${loadedFrom.split('/').pop()}` : 'drop a text file to load it'}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-ink-soft">{outputLabel}</label>
            <div className="flex items-center gap-1">
              {!live && (
                <Button size="sm" icon="Play" onClick={runManual}>
                  {actionLabel}
                </Button>
              )}
              <CopyButton value={() => output} size="sm" variant="ghost" disabled={!output} />
              <Button size="sm" variant="ghost" icon="Download" disabled={!output} onClick={() => void saveOutput()}>
                Save
              </Button>
            </div>
          </div>
          {error ? (
            <Alert tone="danger" title="Could not process this input">
              {error}
            </Alert>
          ) : renderOutput ? (
            <div className="min-h-[220px] rounded-lg border border-line bg-panel p-3">{renderOutput(output, input)}</div>
          ) : (
            <Textarea
              value={output}
              readOnly
              rows={minRows}
              placeholder="The result appears here"
              className={monoOutput ? 'w-full bg-canvas' : 'w-full bg-canvas font-sans'}
            />
          )}
          {result?.warning && (
            <Alert tone="warn" className="mt-1.5">
              {result.warning}
            </Alert>
          )}
          {stats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {stats.map((s) => (
                <Badge key={s.label}>
                  <Icon name="Dot" size={12} className="-ml-1" />
                  {s.label}: {s.value}
                </Badge>
              ))}
            </div>
          )}
          {!error && !renderOutput && (
            <p className="text-[11px] text-ink-faint">{output.length.toLocaleString()} characters</p>
          )}
        </div>
      </div>
    </div>
  );
}
