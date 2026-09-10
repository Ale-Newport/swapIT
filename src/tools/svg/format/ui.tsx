import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { asToolboxError } from '@/core/bridge';
import { useDropTarget } from '@/core/dnd';
import { basename, formatBytes } from '@/core/format';
import { saveTextAs } from '@/core/save';
import { ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  IconButton,
  Section,
  Segmented,
  Textarea,
} from '@/components/ui';
import {
  SAMPLE_SVG,
  byteLength,
  countLines,
  findPreservedSpans,
  formatSvg,
  type IndentStyle,
  type PreservedSpan,
} from './logic';

/** "<text> and <tspan>" — the elements the formatter deliberately left alone. */
function describePreserved(spans: PreservedSpan[]): string {
  const tags = [...new Set(spans.map((s) => `<${s.tag}>`))];
  if (tags.length === 1) return tags[0];
  if (tags.length === 2) return `${tags[0]} and ${tags[1]}`;
  return `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}`;
}

export default function SvgFormatter() {
  const [input, setInput] = useState('');
  const [indent, setIndent] = useState<IndentStyle>('2');
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPath = useCallback(async (path: string) => {
    try {
      const text = await readTextFile(path);
      setInput(text);
      setFileName(basename(path));
      setLoadError(null);
    } catch (err) {
      setLoadError(`“${basename(path)}” could not be read as text. ${asToolboxError(err).message}`);
    }
  }, []);

  const openFile = async () => {
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'SVG files', extensions: ['svg'] }],
      });
      if (typeof picked === 'string') await loadPath(picked);
    } catch (err) {
      setLoadError(`The file picker could not be opened. ${asToolboxError(err).message}`);
    }
  };

  const { ref: dropRef, isOver } = useDropTarget((paths) => {
    if (paths[0]) void loadPath(paths[0]);
  }, { priority: 6 });

  // A file handed over by the Home drop zone or the quick-action menu arrives in
  // the route state; load it instead of opening an empty formatter.
  const location = useLocation();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const first = (location.state as { files?: string[] } | null)?.files?.[0];
    if (!first || consumed.current === first) return;
    consumed.current = first;
    void loadPath(first);
  }, [location.state, loadPath]);

  const result = useMemo(() => {
    const empty = { output: '', preserved: [] as PreservedSpan[], error: null as string | null };
    if (!input.trim()) return empty;
    try {
      return {
        output: formatSvg(input, { indent }),
        preserved: findPreservedSpans(input.trim()),
        error: null as string | null,
      };
    } catch (err) {
      return { ...empty, error: err instanceof Error ? err.message : String(err) };
    }
  }, [input, indent]);

  const saveOutput = async () => {
    if (!result.output) return;
    const stem = fileName ? fileName.replace(/\.svg$/i, '') : 'formatted';
    try {
      await saveTextAs(result.output, `${stem}-formatted.svg`);
      setSaveError(null);
    } catch (err) {
      setSaveError(asToolboxError(err).message);
    }
  };

  return (
    <ToolShell
      main={
        <>
          {loadError && (
            <Alert tone="danger" title="Could not open that file">
              {loadError}
            </Alert>
          )}
          {saveError && (
            <Alert tone="danger" title="The formatted file was not saved">
              {saveError}
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section
              title="SVG source"
              dense
              actions={
                <>
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
                      setSaveError(null);
                    }}
                  />
                </>
              }
            >
              <div ref={dropRef} className={isOver ? 'rounded-lg ring-2 ring-accent/40' : ''}>
                <Textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setFileName(null);
                  }}
                  placeholder={isOver ? 'Release to load this file' : '<svg xmlns="http://www.w3.org/2000/svg" …'}
                  rows={18}
                  className="w-full"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {input.length.toLocaleString()} characters · drop an .svg file here to load it
              </p>
            </Section>

            <Section
              title="Formatted"
              dense
              actions={
                <>
                  <CopyButton value={() => result.output} size="sm" variant="ghost" disabled={!result.output} />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="Download"
                    disabled={!result.output}
                    onClick={() => void saveOutput()}
                  >
                    Save as…
                  </Button>
                </>
              }
            >
              {result.error ? (
                <Alert tone="danger" title="Could not format this markup">
                  {result.error}
                </Alert>
              ) : (
                <Textarea
                  value={result.output}
                  readOnly
                  rows={18}
                  placeholder="The indented markup appears here"
                  className="w-full bg-canvas"
                />
              )}
              {!result.error && result.output && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge>{countLines(result.output).toLocaleString()} lines</Badge>
                  <Badge>{formatBytes(byteLength(result.output))}</Badge>
                  <Badge>
                    {byteLength(result.output) >= byteLength(input) ? '+' : '−'}
                    {formatBytes(Math.abs(byteLength(result.output) - byteLength(input)))} vs input
                  </Badge>
                </div>
              )}
              {!result.error && result.preserved.length > 0 && (
                <Alert tone="info" className="mt-2">
                  {describePreserved(result.preserved)} {result.preserved.length === 1 ? 'was' : 'were'} left exactly as
                  written. Whitespace inside a text element — and anywhere under{' '}
                  <code className="font-mono">{'xml:space="preserve"'}</code> — is content rather than layout, so indenting
                  it would change what the file renders.
                </Alert>
              )}
            </Section>
          </div>
        </>
      }
      aside={
        <Section title="Formatting">
          <div className="space-y-3">
            <Field label="Indent" hint="Two spaces is the convention for SVG and XML.">
              <Segmented
                value={indent}
                onChange={setIndent}
                options={[
                  { value: '2', label: '2 spaces' },
                  { value: '4', label: '4 spaces' },
                  { value: 'tab', label: 'Tab' },
                ]}
                className="w-full"
              />
            </Field>

            <Field label="Source file" hint="Or drop one onto the editor.">
              <Button full size="sm" icon="FolderOpen" onClick={() => void openFile()}>
                Open .svg
              </Button>
            </Field>

            {fileName && (
              <Badge>
                <Icon name="FileCode2" size={12} />
                {fileName}
              </Badge>
            )}
          </div>
        </Section>
      }
    />
  );
}
