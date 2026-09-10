import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDropTarget } from '@/core/dnd';
import { basename, formatBytes } from '@/core/format';
import { saveTextAs } from '@/core/save';
import { OptionsGrid } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Field,
  Icon,
  IconButton,
  Slider,
  Switch,
  Textarea,
} from '@/components/ui';
import { DEFAULT_MINIFY, SAMPLE_SVG, byteLength, minifySvg, type MinifyOptions } from './logic';

export default function SvgMinifier() {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<MinifyOptions>(DEFAULT_MINIFY);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const set = <K extends keyof MinifyOptions>(key: K, value: MinifyOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  const loadPath = useCallback(async (path: string) => {
    try {
      const text = await readTextFile(path);
      setInput(text);
      setFileName(basename(path));
      setLoadError(null);
    } catch (err) {
      setLoadError(
        `“${basename(path)}” could not be read as text. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, []);

  const openFile = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'SVG files', extensions: ['svg'] }],
    });
    if (typeof picked === 'string') await loadPath(picked);
  };

  const { ref: dropRef, isOver } = useDropTarget((paths) => {
    if (paths[0]) void loadPath(paths[0]);
  }, { priority: 6 });

  // A file handed over by the Home quick actions or the right-click menu arrives
  // in the route state; load it instead of opening an empty editor.
  const location = useLocation();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const first = (location.state as { files?: string[] } | null)?.files?.[0];
    if (!first || consumed.current === first) return;
    consumed.current = first;
    void loadPath(first);
  }, [location.state, loadPath]);

  const result = useMemo(() => {
    if (!input.trim()) return { data: '', before: 0, after: 0, saved: 0, percent: 0, error: null as string | null };
    try {
      return { ...minifySvg(input, options), error: null as string | null };
    } catch (err) {
      return {
        data: '',
        before: byteLength(input),
        after: 0,
        saved: 0,
        percent: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [input, options]);

  const saveOutput = async () => {
    if (!result.data) return;
    const stem = fileName ? fileName.replace(/\.svg$/i, '') : 'minified';
    await saveTextAs(result.data, `${stem}-min.svg`);
  };

  const hasResult = Boolean(result.data) && !result.error;

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-panel p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Field
              label={`Coordinate precision — ${options.precision} decimal${options.precision === 1 ? '' : 's'}`}
              hint="Fewer decimals means a smaller file and slightly softer curves."
              className="min-w-[200px] flex-1"
            >
              <Slider min={0} max={3} value={options.precision} onChange={(v) => set('precision', v)} />
            </Field>
            <div className="flex items-center gap-2">
              {fileName && (
                <Badge>
                  <Icon name="FileCode2" size={12} />
                  {fileName}
                </Badge>
              )}
              <Button size="sm" icon="FolderOpen" onClick={() => void openFile()}>
                Open .svg
              </Button>
            </div>
          </div>
          <OptionsGrid>
            <Field inline label="Titles and descriptions" hint="Removes <title> and <desc>">
              <Switch checked={options.removeTitles} onCheckedChange={(v) => set('removeTitles', v)} />
            </Field>
            <Field inline label="Reuse repeated paths" hint="Identical shapes become one <use>">
              <Switch checked={options.reusePaths} onCheckedChange={(v) => set('reusePaths', v)} />
            </Field>
            <Field inline label="Drop width and height" hint="Keeps the viewBox so CSS sets the size">
              <Switch checked={options.removeDimensions} onCheckedChange={(v) => set('removeDimensions', v)} />
            </Field>
            <Field inline label="Remove scripts" hint="Interactive SVGs need theirs">
              <Switch checked={options.removeScripts} onCheckedChange={(v) => set('removeScripts', v)} />
            </Field>
          </OptionsGrid>
        </div>
      </div>

      {loadError && (
        <Alert tone="danger" title="Could not open that file">
          {loadError}
        </Alert>
      )}

      {hasResult && (
        <Card className="bg-canvas" padded={false}>
          <div className="flex flex-wrap items-center gap-6 px-4 py-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Before</p>
              <p className="text-[15px] font-medium text-ink">{formatBytes(result.before)}</p>
            </div>
            <Icon name="ArrowRight" size={14} className="text-ink-faint" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">After</p>
              <p className="text-[15px] font-medium text-ink">{formatBytes(result.after)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Saved</p>
              <p className="text-[15px] font-medium text-ink">{formatBytes(Math.abs(result.saved))}</p>
            </div>
            <Badge tone={result.saved > 0 ? 'success' : 'warn'} className="ml-auto">
              {result.saved > 0
                ? `${result.percent.toFixed(1)}% smaller`
                : `${Math.abs(result.percent).toFixed(1)}% larger`}
            </Badge>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-ink-soft">SVG source</label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setInput(SAMPLE_SVG);
                  setFileName(null);
                }}
              >
                Sample
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="ClipboardPaste"
                onClick={async () => {
                  try {
                    setInput(await navigator.clipboard.readText());
                    setFileName(null);
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
                  setFileName(null);
                  setLoadError(null);
                }}
              />
            </div>
          </div>
          <div ref={dropRef} className={isOver ? 'rounded-lg ring-2 ring-accent/40' : ''}>
            <Textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setFileName(null);
              }}
              placeholder={isOver ? 'Release to load this file' : '<svg xmlns="http://www.w3.org/2000/svg" …'}
              rows={16}
              className="w-full"
            />
          </div>
          <p className="text-[11px] text-ink-faint">
            {input ? `${formatBytes(byteLength(input))} · ` : ''}
            drop an .svg file here to load it
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-ink-soft">Minified</label>
            <div className="flex items-center gap-1">
              <CopyButton value={() => result.data} size="sm" variant="ghost" disabled={!hasResult} />
              <Button
                size="sm"
                variant="ghost"
                icon="Download"
                disabled={!hasResult}
                onClick={() => void saveOutput()}
              >
                Save as…
              </Button>
            </div>
          </div>
          {result.error ? (
            <Alert tone="danger" title="Could not minify this markup">
              {result.error}
            </Alert>
          ) : (
            <Textarea
              value={result.data}
              readOnly
              rows={16}
              placeholder="The minified markup appears here"
              className="w-full bg-canvas"
            />
          )}
          {hasResult && (
            <p className="text-[11px] text-ink-faint">
              {result.data.length.toLocaleString()} characters on one line
              {/<text[\s>]/i.test(result.data) && ' · spacing inside <text> was left untouched'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
