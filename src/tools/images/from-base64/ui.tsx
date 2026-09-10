import { useEffect, useMemo, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { saveAs } from '@/core/save';
import { ToolShell } from '@/components/tool';
import { Alert, Button, EmptyState, Field, Section, Spinner, Stat, Textarea } from '@/components/ui';
import type { FileResult } from '@/core/types';
import { decodeImageData, suggestedFilename, type DecodedImage } from './logic';

const SAMPLE =
  'data:image/gif;base64,R0lGODlhEAAQAMQAAORHHOVSKudfOulrSOp3WOyDZu6QdvCchPGolfO0o/XBs/fNwfjZ0frl3/zy7////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH5BAkAABAALAAAAAAQABAAAAVVICSOZGlCQAosJ6mu7fiyZeKqNKToQGDsM8hBADgUXoGAiqhSvp5QAnQKGIgUhwFUYLCVDFCrKUE1lBavAViFIDlTImbKC5Gm2hB0SlBCBMQiB0UjIQA7';

export default function Base64ToImage() {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clipboardNote, setClipboardNote] = useState<string | null>(null);

  // Decoding a multi-megabyte paste is fast, but not fast enough to do on every
  // keystroke while someone edits the string by hand.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 150);
    return () => clearTimeout(timer);
  }, [text]);

  const { decoded, error } = useMemo((): { decoded: DecodedImage | null; error: string | null } => {
    if (!debounced.trim()) return { decoded: null, error: null };
    try {
      return { decoded: decodeImageData(debounced), error: null };
    } catch (err) {
      return { decoded: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [debounced]);

  useEffect(() => {
    setDimensions(null);
    setRenderFailed(false);
    setSaved(null);
    setSaveError(null);
  }, [decoded?.dataUrl]);

  const pending = text.trim() !== debounced.trim();

  const pasteFromClipboard = async () => {
    setClipboardNote(null);
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) setText(clip);
      else setClipboardNote('The clipboard is empty.');
    } catch {
      setClipboardNote('The clipboard could not be read — paste into the box with ⌘V instead.');
    }
  };

  const save = async () => {
    if (!decoded) return;
    setSaveError(null);
    try {
      const result = await saveAs(decoded.bytes, suggestedFilename(decoded.extension));
      setSaved(result);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Base64 or data URL"
            description="Paste the encoded string — it is decoded here on your Mac, nothing is uploaded."
            actions={
              <>
                <Button size="sm" icon="ClipboardPaste" onClick={() => void pasteFromClipboard()}>
                  Paste
                </Button>
                {text && (
                  <Button size="sm" variant="ghost" icon="X" onClick={() => setText('')}>
                    Clear
                  </Button>
                )}
              </>
            }
          >
            <div className="space-y-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg…"
                rows={7}
                className="max-h-64"
              />
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11.5px] text-ink-faint">
                  {text.length.toLocaleString()} characters
                </span>
                {!text && (
                  <button
                    type="button"
                    onClick={() => setText(SAMPLE)}
                    className="text-[11.5px] text-accent underline underline-offset-2"
                  >
                    Try an example
                  </button>
                )}
                {pending && <Spinner size={13} />}
              </div>
              {clipboardNote && <Alert tone="info">{clipboardNote}</Alert>}
              {error && <Alert tone="danger" title="That string could not be decoded.">{error}</Alert>}
            </div>
          </Section>

          <Section title="Preview">
            {decoded ? (
              <div className="space-y-3">
                <div className="checkerboard flex max-h-[55vh] items-center justify-center overflow-hidden rounded-lg border border-line p-2">
                  <img
                    src={decoded.dataUrl}
                    alt="The decoded image"
                    onLoad={(e) =>
                      setDimensions({
                        width: e.currentTarget.naturalWidth,
                        height: e.currentTarget.naturalHeight,
                      })
                    }
                    onError={() => setRenderFailed(true)}
                    className="max-h-[50vh] max-w-full object-contain"
                  />
                </div>
                {renderFailed && (
                  <Alert tone="warn" title="The bytes decoded, but this image will not display.">
                    The string is probably truncated or belongs to a format the preview cannot draw. Saving it
                    still writes exactly the bytes that were decoded.
                  </Alert>
                )}
              </div>
            ) : (
              <EmptyState
                icon="ImageDown"
                title="Nothing decoded yet"
                description="Paste a Base64 string or a full data: URL above and the image appears here."
              />
            )}
          </Section>
        </>
      }
      aside={
        decoded ? (
          <>
            <Section title="Decoded image">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat
                  label="Format"
                  value={decoded.extension.toUpperCase()}
                  hint={decoded.detectedFrom === 'signature' ? 'From the file signature' : 'From the data URL'}
                />
                <Stat label="Type" value={decoded.mime} />
                <Stat label="Size" value={formatBytes(decoded.bytes.byteLength)} />
                <Stat
                  label="Dimensions"
                  value={dimensions ? `${dimensions.width} × ${dimensions.height}` : renderFailed ? '—' : '…'}
                />
              </div>
            </Section>

            <Section title="Save">
              <div className="space-y-2.5">
                <Field label="Filename" hint="You choose the folder in the next dialog.">
                  <p className="font-mono text-[12.5px] text-ink selectable">
                    {suggestedFilename(decoded.extension)}
                  </p>
                </Field>
                <Button variant="primary" size="lg" icon="Download" full onClick={() => void save()}>
                  Save image…
                </Button>
                {saved && (
                  <Alert
                    tone="success"
                    title={`Saved ${saved.name}`}
                    action={
                      <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(saved.path)}>
                        Reveal
                      </Button>
                    }
                  >
                    {formatBytes(saved.size)}
                  </Alert>
                )}
                {saveError && <Alert tone="danger" title="The file could not be written.">{saveError}</Alert>}
              </div>
            </Section>
          </>
        ) : undefined
      }
    />
  );
}
