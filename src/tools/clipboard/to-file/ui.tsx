import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { appPaths, asToolboxError, type AppPaths } from '@/core/bridge';
import { shortenPath } from '@/core/format';
import { saveText, saveTextAs } from '@/core/save';
import type { BatchResult, OutputSpec, ToolboxError } from '@/core/types';
import { ErrorDisplay, ResultPanel, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Field,
  Icon,
  Input,
  NumberInput,
  Section,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import {
  type ClipFormat,
  FORMATS,
  analyseCsv,
  detectFormat,
  looksLikeHtml,
  prepare,
  suggestFilename,
} from './logic';

const NO_TEXT =
  'There is no text on the clipboard right now. Copy something, then read the clipboard again.';

export default function ClipboardToFile() {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ClipFormat>('txt');
  const [formatTouched, setFormatTouched] = useState(false);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [indent, setIndent] = useState(2);
  const [wrapHtml, setWrapHtml] = useState(true);
  const [dir, setDir] = useState<string | null>(null);
  const [places, setPlaces] = useState<AppPaths | null>(null);
  const [collision, setCollision] = useState<OutputSpec['collision']>('rename');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const [saved, setSaved] = useState<BatchResult | null>(null);

  const readClipboard = useCallback(async () => {
    setReading(true);
    setError(null);
    setSaved(null);
    try {
      const value = await readText();
      setText(value ?? '');
      setProblem(value ? null : NO_TEXT);
      if (value) {
        // Detect once: on a large clipboard this parses the whole text.
        const guessed = detectFormat(value);
        if (!formatTouched) setFormat(guessed);
        if (!nameTouched) setName(suggestFilename(value, guessed));
      }
    } catch {
      setProblem(NO_TEXT);
    } finally {
      setReading(false);
    }
  }, [formatTouched, nameTouched]);

  // Read once when the tool opens; after that it is an explicit action.
  useEffect(() => {
    void readClipboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let stale = false;
    void appPaths()
      .then((p) => {
        if (stale) return;
        setPlaces(p);
        setDir((current) => current ?? p.documents);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, []);

  const prepared = useMemo(() => {
    try {
      return {
        content: prepare(text, format, { indent, wrapHtml, title: name || 'Clipboard' }),
        problem: null as string | null,
      };
    } catch (err) {
      return { content: '', problem: err instanceof Error ? err.message : String(err) };
    }
  }, [text, format, indent, wrapHtml, name]);

  // detectFormat parses the whole clipboard, so it must not run on every keystroke.
  const detected = useMemo(() => (text.trim() ? detectFormat(text) : null), [text]);
  const csv = useMemo(() => (format === 'csv' && text.trim() ? analyseCsv(text) : null), [format, text]);
  const stem = (name.trim() || 'clipboard').replace(/\.[a-z0-9]+$/i, '');
  const canSave = Boolean(prepared.content) && !prepared.problem;

  const finish = (result: BatchResult) => {
    setSaved(result);
    setError(null);
  };

  const save = async () => {
    if (!dir) {
      setError({ message: 'Choose a folder to save into first.', details: null, kind: 'invalid_input' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const written = await saveText(prepared.content, {
        source: null,
        output: { mode: 'custom', dir, suffix: null, collision, filename: stem },
        ext: format,
      });
      finish({ results: [written], failures: [], cancelled: false, elapsedMs: 0 });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setSaving(false);
    }
  };

  const saveElsewhere = async () => {
    setSaving(true);
    setError(null);
    try {
      const written = await saveTextAs(prepared.content, `${stem}.${format}`);
      if (written) finish({ results: [written], failures: [], cancelled: false, elapsedMs: 0 });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setSaving(false);
    }
  };

  const formatHint = FORMATS.find((f) => f.value === format)?.hint ?? '';

  return (
    <ToolShell
      main={
        <>
          <Section
            title="On the clipboard"
            description={`${text.length.toLocaleString()} characters`}
            actions={
              <>
                {detected && <Badge tone="accent">Looks like {detected.toUpperCase()}</Badge>}
                <Button size="sm" icon="RefreshCw" loading={reading} onClick={() => void readClipboard()}>
                  Read clipboard
                </Button>
              </>
            }
          >
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setProblem(null);
                setSaved(null);
              }}
              rows={9}
              aria-label="Text from the clipboard"
              placeholder="Copy some text, or paste it here directly…"
            />
            {problem && !text && (
              <Alert tone="info" className="mt-2">
                {problem}
              </Alert>
            )}
          </Section>

          <Section
            title="What will be written"
            description={
              csv
                ? `${csv.rows.toLocaleString()} rows · ${csv.columns} columns · “${csv.delimiter}” separated`
                : `${stem}.${format} · ${prepared.content.length.toLocaleString()} characters`
            }
          >
            {prepared.problem ? (
              <Alert tone={text.trim() ? 'danger' : 'info'} title={prepared.problem}>
                {format === 'json' && text.trim()
                  ? 'Plain text (.txt) saves the same clipboard content without checking it.'
                  : null}
              </Alert>
            ) : (
              <>
                <Textarea
                  value={prepared.content}
                  readOnly
                  rows={9}
                  aria-label="File preview"
                  className="min-h-40"
                />
                {csv?.ragged && (
                  <Alert tone="warn" className="mt-2" title="The rows do not all have the same number of columns.">
                    The file is still saved exactly as copied — check it in a spreadsheet before relying on it.
                  </Alert>
                )}
              </>
            )}
          </Section>

          {error && <ErrorDisplay error={error} />}
          {saved && <ResultPanel result={saved} title="File saved" onProcessAgain={() => setSaved(null)} />}
        </>
      }
      aside={
        <>
          <Section title="Format">
            <div className="space-y-3">
              <Field label="Save as" hint={formatHint}>
                <Select
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as ClipFormat);
                    setFormatTouched(true);
                  }}
                  options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
                />
              </Field>
              {format === 'json' && (
                <Field label="Indent" hint="0 writes the JSON on a single line.">
                  <NumberInput value={indent} onValueChange={setIndent} min={0} max={8} suffix="sp" />
                </Field>
              )}
              {format === 'html' && !looksLikeHtml(text) && (
                <Field
                  inline
                  label="Wrap in a page"
                  hint="Adds doctype, head and paragraphs around the text"
                >
                  <Switch checked={wrapHtml} onCheckedChange={setWrapHtml} label="Wrap in a page" />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <div className="space-y-3">
              <Field label="File name">
                <div className="flex items-center gap-2">
                  <Input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameTouched(true);
                    }}
                    placeholder="clipboard"
                  />
                  <span className="shrink-0 text-[12.5px] text-ink-faint">.{format}</span>
                </div>
              </Field>

              <div className="flex items-center gap-2">
                <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                  <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                  <span className="truncate text-[12.5px] text-ink-soft" title={dir ?? ''}>
                    {dir ? shortenPath(dir, 3) : 'No folder chosen'}
                  </span>
                </div>
                <Button size="sm" onClick={async () => {
                  const picked = await open({ directory: true, multiple: false });
                  if (typeof picked === 'string') setDir(picked);
                }}>
                  Browse
                </Button>
              </div>

              {places && (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { label: 'Documents', value: places.documents },
                      { label: 'Desktop', value: places.desktop },
                      { label: 'Downloads', value: places.downloads },
                    ] as const
                  ).map((place) => (
                    <button
                      key={place.label}
                      type="button"
                      onClick={() => setDir(place.value)}
                      className={
                        dir === place.value
                          ? 'rounded-lg border border-ink bg-ink px-2.5 py-1 text-[12px] font-medium text-panel'
                          : 'rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:border-line-strong hover:text-ink'
                      }
                    >
                      {place.label}
                    </button>
                  ))}
                </div>
              )}

              <Field label="If the file exists">
                <Select
                  value={collision}
                  onChange={(e) => setCollision(e.target.value as OutputSpec['collision'])}
                  options={[
                    { value: 'rename', label: 'Keep both (file_1)' },
                    { value: 'overwrite', label: 'Replace it' },
                  ]}
                />
              </Field>
            </div>
          </Section>

          <div className="space-y-2">
            <Button
              full
              variant="primary"
              size="lg"
              icon="FileDown"
              loading={saving}
              disabled={!canSave}
              title={canSave ? undefined : 'There is nothing to save yet.'}
              onClick={() => void save()}
            >
              Save {stem}.{format}
            </Button>
            <Button full icon="FolderOpen" disabled={!canSave} onClick={() => void saveElsewhere()}>
              Save as…
            </Button>
          </div>
        </>
      }
    />
  );
}
