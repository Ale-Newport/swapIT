import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { saveTextAs } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { ErrorDisplay, FileDropZone, ImagePreview, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  CopyButton,
  Field,
  Section,
  Segmented,
  Spinner,
  Stat,
  Textarea,
} from '@/components/ui';
import type { ToolboxError } from '@/core/types';
import {
  cssSnippet,
  decodedByteLength,
  encodedFilename,
  htmlSnippet,
  INLINE_WARNING_BYTES,
  MAX_TEXTAREA_CHARS,
  splitDataUrl,
  truncateForDisplay,
} from './logic';

/** Snippets stay readable; the copy buttons still hand over the whole string. */
const SNIPPET_URL_CHARS = 160;

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'ico', 'svg', 'tif', 'tiff', 'heic'];

export default function ImageToBase64() {
  const files = useToolFiles({
    kinds: ['image', 'svg'],
    extensions: EXTENSIONS,
    filterName: 'Images',
    multiple: false,
  });

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'dataurl' | 'raw'>('dataurl');
  const [saved, setSaved] = useState<string | null>(null);

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;

  // One backend call covers both modes: the raw payload is the data URL minus
  // its prefix, so there is nothing to re-encode when the toggle flips.
  useEffect(() => {
    setSaved(null);
    if (!path) {
      setDataUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    call<string>('image_to_base64', { input: path, asDataUrl: true })
      .then((result) => {
        if (!cancelled) setDataUrl(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setDataUrl(null);
          setError(asToolboxError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const parts = useMemo(() => (dataUrl ? splitDataUrl(dataUrl) : null), [dataUrl]);
  const output = mode === 'dataurl' ? (dataUrl ?? '') : (parts?.payload ?? '');
  const shown = useMemo(() => truncateForDisplay(output, MAX_TEXTAREA_CHARS), [output]);
  const snippetUrl = useMemo(() => {
    if (!dataUrl) return '';
    const short = truncateForDisplay(dataUrl, SNIPPET_URL_CHARS);
    return short.hidden ? `${short.text}…` : short.text;
  }, [dataUrl]);
  const decoded = parts ? decodedByteLength(parts.payload) : 0;
  const oversized = decoded > INLINE_WARNING_BYTES;
  const growth = file?.size ? ((dataUrl?.length ?? 0) / file.size - 1) * 100 : 0;

  const saveToFile = async () => {
    if (!output || !file) return;
    const result = await saveTextAs(output, encodedFilename(file.name));
    setSaved(result ? result.name : null);
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image here"
            hint="PNG, JPEG, SVG, WebP, GIF — small icons and logos are what inlining is for"
          />

          {error && <ErrorDisplay error={error} />}

          {loading && (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-ink-faint">
              <Spinner /> Encoding {file?.name}…
            </div>
          )}

          {dataUrl && parts && !loading && (
            <>
              {oversized && (
                <Alert tone="warn" title="This image is too big to inline sensibly.">
                  {formatBytes(decoded)} becomes {(dataUrl.length / 1000).toFixed(0)}k characters of text that
                  cannot be cached separately, and every page using it downloads the whole thing again. Link to
                  the file instead, or shrink it first with Resize or Compress.
                </Alert>
              )}

              <Section
                title="Encoded"
                description={`${output.length.toLocaleString()} characters`}
                actions={
                  <>
                    <Segmented
                      value={mode}
                      onChange={setMode}
                      size="sm"
                      options={[
                        { value: 'dataurl', label: 'Data URL' },
                        { value: 'raw', label: 'Base64 only' },
                      ]}
                    />
                    <CopyButton value={output} label="Copy" size="sm" />
                  </>
                }
              >
                <div className="space-y-3">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <ImagePreview path={path} className="h-24 w-full shrink-0 sm:w-32" alt={file?.name ?? ''} />
                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <Stat label="Type" value={parts.mime} />
                      <Stat label="On disk" value={formatBytes(file?.size)} />
                      <Stat label="Encoded" value={`${(output.length / 1000).toFixed(1)}k chars`} />
                      <Stat
                        label="Overhead"
                        value={`+${growth.toFixed(0)}%`}
                        hint="Base64 always grows a file"
                      />
                    </div>
                  </div>

                  <Textarea value={shown.text} readOnly rows={6} className="max-h-56" />
                  {shown.hidden > 0 && (
                    <p className="text-[11.5px] text-ink-faint">
                      Showing the first {MAX_TEXTAREA_CHARS.toLocaleString()} characters —{' '}
                      {shown.hidden.toLocaleString()} more are in the copy and in the saved file.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" icon="Download" onClick={() => void saveToFile()}>
                      Save as .txt
                    </Button>
                    {saved && <span className="text-[11.5px] text-success">Saved {saved}</span>}
                  </div>
                </div>
              </Section>

              <Section
                title="Ready to paste"
                description="The data URL is shortened here for reading — Copy gives the complete snippet."
              >
                <div className="space-y-3">
                  <Field label="CSS">
                    <div className="relative">
                      <pre className="selectable overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-2.5 pr-24 font-mono text-[11.5px] leading-[1.55] text-ink">
                        {cssSnippet(snippetUrl)}
                      </pre>
                      <CopyButton
                        value={() => cssSnippet(dataUrl)}
                        label="Copy CSS"
                        size="sm"
                        className="absolute right-2 top-2"
                      />
                    </div>
                  </Field>
                  <Field label="HTML">
                    <div className="relative">
                      <pre className="selectable overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-canvas p-2.5 pr-24 font-mono text-[11.5px] leading-[1.55] text-ink">
                        {htmlSnippet(snippetUrl, file?.name ?? '')}
                      </pre>
                      <CopyButton
                        value={() => htmlSnippet(dataUrl, file?.name ?? '')}
                        label="Copy HTML"
                        size="sm"
                        className="absolute right-2 top-2"
                      />
                    </div>
                  </Field>
                </div>
              </Section>
            </>
          )}
        </>
      }
    />
  );
}
