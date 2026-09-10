import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useMemo, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { saveText } from '@/core/save';
import type { BatchResult, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Icon, IconButton, Section, Spinner } from '@/components/ui';
import {
  alphaOf,
  extractColors,
  formatColor,
  readableInk,
  replaceColors,
  rgbOf,
  type FoundColor,
} from './logic';

/** Live preview of SVG source. Rendered through an <img>, so no script inside the file can run. */
function SvgPreview({ svg, label, height = 'h-72' }: { svg: string | null; label: string; height?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
    if (!svg) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [svg]);

  return (
    <figure className="space-y-1.5">
      <div className={`checkerboard flex ${height} items-center justify-center overflow-hidden rounded-lg border border-line p-3`}>
        {!url ? (
          <Spinner />
        ) : broken ? (
          <p className="text-[11.5px] text-ink-faint">This file is not valid SVG, so it cannot be previewed.</p>
        ) : (
          <img src={url} alt={label} onError={() => setBroken(true)} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <figcaption className="text-[11.5px] text-ink-faint">{label}</figcaption>
    </figure>
  );
}

function ColorRow({
  color,
  value,
  onChange,
  onReset,
}: {
  color: FoundColor;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const changed = value.toLowerCase() !== formatColor(color.normalized).toLowerCase();
  const alpha = alphaOf(color.normalized);
  return (
    <li className="flex items-center gap-1.5 py-1">
      <span
        className="checkerboard relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line"
        title={color.notations.join(', ')}
      >
        <span className="absolute inset-0" style={{ background: formatColor(color.normalized) }} />
      </span>
      <Icon name="ArrowRight" size={12} className="shrink-0 text-ink-faint" />
      <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          aria-label={`Replacement for ${color.normalized}`}
          value={rgbOf(value.startsWith('#') ? value : color.normalized)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={value}>
        {changed ? value : color.normalized}
      </span>
      {alpha < 1 && <Badge>{Math.round(alpha * 100)}%</Badge>}
      <span className="shrink-0 text-[11px] text-ink-faint">×{color.count}</span>
      {changed && <IconButton icon="RotateCcw" label="Undo this colour" size="sm" onClick={onReset} />}
    </li>
  );
}

export default function SvgColorReplacer() {
  const files = useToolFiles({ extensions: ['svg'], kinds: ['svg'], filterName: 'SVG files', multiple: false });
  const { spec, update } = useOutputSpec({ suffix: '-recoloured' });

  const [source, setSource] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [monochrome, setMonochrome] = useState('#111111');

  // The save happens in the frontend, so this stands in for `useToolRun` and
  // keeps the standard action row, error panel and result panel.
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;

  useEffect(() => {
    let alive = true;
    setSource(null);
    setReadError(null);
    setReplacements({});
    setResult(null);
    setError(null);
    if (!path) return;
    readTextFile(path)
      .then((text) => {
        if (alive) setSource(text);
      })
      .catch(() => {
        if (alive) setReadError('That file could not be read as text. An SVG is XML — a binary or damaged file cannot be edited here.');
      });
    return () => {
      alive = false;
    };
  }, [path]);

  const colors = useMemo(() => (source ? extractColors(source) : []), [source]);
  const applied = useMemo(() => (source ? replaceColors(source, replacements) : null), [source, replacements]);
  const output = applied?.svg ?? source;
  const changed = applied?.changed ?? 0;

  const run: ToolRun = {
    running: saving,
    progress: null,
    done: 0,
    total: 0,
    currentFile: null,
    result,
    raw: null,
    error,
    taskId: null,
    execute: async () => null,
    executeRaw: async () => null,
    cancel: () => setSaving(false),
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  const execute = async () => {
    if (!path || !file || !output || changed === 0) return;
    setSaving(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      const saved = await saveText(output, { source: path, output: spec, ext: 'svg' });
      setResult({
        results: [{ ...saved, sourceSize: file.size, note: `${changed} colour${changed === 1 ? '' : 's'} rewritten` }],
        failures: [],
        cancelled: false,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setSaving(false);
    }
  };

  const setOne = (normalized: string, value: string) =>
    setReplacements((current) => ({ ...current, [normalized]: value }));

  const resetOne = (normalized: string) =>
    setReplacements((current) => {
      const next = { ...current };
      delete next[normalized];
      return next;
    });

  const applyMonochrome = () =>
    setReplacements(Object.fromEntries(colors.map((c) => [c.normalized, monochrome])));

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an SVG here"
            hint="Every fill, stroke and gradient stop is scanned — including the ones inside a <style> block"
          />
          {readError && <Alert tone="danger">{readError}</Alert>}
          {source && (
            <Section title="Preview" description={changed > 0 ? `${changed} colour reference${changed === 1 ? '' : 's'} rewritten` : 'Pick a replacement colour to see the change'}>
              <div className="grid gap-3 sm:grid-cols-2">
                <SvgPreview svg={source} label="Original" />
                <SvgPreview svg={output} label="Result" />
              </div>
            </Section>
          )}
          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="SVG saved" />}
        </>
      }
      aside={
        <>
          <Section
            title="Colours in this file"
            description={source ? `${colors.length} distinct colour${colors.length === 1 ? '' : 's'}` : 'Add an SVG to read its palette'}
            actions={
              Object.keys(replacements).length > 0 ? (
                <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => setReplacements({})}>
                  Reset
                </Button>
              ) : undefined
            }
          >
            {!source ? (
              <p className="text-[12.5px] text-ink-faint">Nothing loaded yet.</p>
            ) : colors.length === 0 ? (
              <Alert tone="info" title="No literal colours found">
                This SVG paints with gradients, <code className="font-mono">currentColor</code> or nothing at all, so
                there is no fixed colour to swap.
              </Alert>
            ) : (
              <div className="space-y-3">
                <ul className="max-h-[320px] divide-y divide-line overflow-y-auto">
                  {colors.map((color) => (
                    <ColorRow
                      key={color.normalized}
                      color={color}
                      value={replacements[color.normalized] ?? formatColor(color.normalized)}
                      onChange={(value) => setOne(color.normalized, value)}
                      onReset={() => resetOne(color.normalized)}
                    />
                  ))}
                </ul>
                <div className="rounded-lg border border-line bg-canvas p-2.5">
                  <p className="text-[12px] font-medium text-ink">Make it one colour</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    Flattens every colour above — how a multi-colour logo becomes a monochrome icon.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <label
                      className="relative h-8 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line"
                      style={{ background: monochrome }}
                    >
                      <input
                        type="color"
                        aria-label="Single colour"
                        value={monochrome}
                        onChange={(e) => setMonochrome(e.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                      />
                    </label>
                    <span
                      className="rounded-md px-2 py-1 font-mono text-[11.5px]"
                      style={{ background: monochrome, color: readableInk(monochrome) }}
                    >
                      {monochrome}
                    </span>
                    <Button size="sm" className="ml-auto" icon="Palette" onClick={applyMonochrome}>
                      Apply to all
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Save recoloured SVG"
            icon="Download"
            disabled={!source || changed === 0}
            disabledReason={
              !source ? 'Add an SVG first.' : 'Change at least one colour — nothing would be different otherwise.'
            }
          />
        </>
      }
    />
  );
}
