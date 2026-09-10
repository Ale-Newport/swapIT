import { readImage } from '@tauri-apps/plugin-clipboard-manager';
import { useCallback, useEffect, useRef, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { canvasToBytes, saveAs } from '@/core/save';
import type { BatchResult, ToolboxError } from '@/core/types';
import { ErrorDisplay, ResultPanel, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  NumberInput,
  Section,
  Segmented,
  Slider,
  Spinner,
  Switch,
} from '@/components/ui';
import { MAX_WIDTH, MIN_WIDTH, type Size, megapixels, scaledSize, suggestImageName } from './logic';

const NO_IMAGE =
  'There is no image on the clipboard. Copy a picture, or take a screenshot to the clipboard with ⌘⇧⌃4, then read the clipboard again.';

export default function SaveClipboardImage() {
  const source = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);

  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [quality, setQuality] = useState(90);
  const [resize, setResize] = useState(false);
  const [targetWidth, setTargetWidth] = useState(1200);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<BatchResult | null>(null);

  const readClipboardImage = useCallback(async () => {
    setReading(true);
    setError(null);
    setSaved(null);
    try {
      const image = await readImage();
      const [rgba, dims] = await Promise.all([image.rgba(), image.size()]);
      if (!dims.width || !dims.height) throw new Error('The clipboard image has no pixels.');
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This Mac could not open a canvas to read the clipboard image.');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), dims.width, dims.height), 0, 0);
      source.current = canvas;
      setSize(dims);
      setPreview(canvas.toDataURL('image/png'));
      setTargetWidth((current) => (current && current <= dims.width ? current : dims.width));
      setProblem(null);
    } catch {
      // readImage rejects whenever the clipboard holds text, files or nothing.
      source.current = null;
      setSize(null);
      setPreview(null);
      setProblem(NO_IMAGE);
    } finally {
      setReading(false);
    }
  }, []);

  useEffect(() => {
    void readClipboardImage();
  }, [readClipboardImage]);

  const outputSize = size ? (resize ? scaledSize(size, targetWidth) : size) : null;

  const save = async () => {
    const canvas = source.current;
    if (!canvas || !size || !outputSize) return;
    setSaving(true);
    setError(null);
    try {
      const target = document.createElement('canvas');
      target.width = outputSize.width;
      target.height = outputSize.height;
      const ctx = target.getContext('2d');
      if (!ctx) throw new Error('This Mac could not open a canvas to write the image.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (format === 'jpg') {
        // JPEG has no transparency; without this, clear pixels turn black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, target.width, target.height);
      }
      ctx.drawImage(canvas, 0, 0, target.width, target.height);
      const bytes = await canvasToBytes(
        target,
        format === 'png' ? 'image/png' : 'image/jpeg',
        format === 'jpg' ? quality / 100 : undefined,
      );
      const written = await saveAs(bytes, suggestImageName(new Date(), format));
      if (written) setSaved({ results: [written], failures: [], cancelled: false, elapsedMs: 0 });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setSaving(false);
    }
  };

  const resized = Boolean(size && outputSize && outputSize.width !== size.width);

  return (
    <ToolShell
      main={
        <>
          <Section
            title="On the clipboard"
            description={
              size
                ? `${size.width} × ${size.height} pixels · ${megapixels(size).toFixed(1)} megapixels`
                : 'Nothing read yet'
            }
            actions={
              <Button size="sm" icon="RefreshCw" loading={reading} onClick={() => void readClipboardImage()}>
                Read clipboard
              </Button>
            }
          >
            {reading && !preview ? (
              <div className="flex items-center gap-2 py-10 text-[12.5px] text-ink-faint">
                <Spinner /> Reading the clipboard…
              </div>
            ) : preview ? (
              <div className="space-y-2">
                <div className="checkerboard flex max-h-[26rem] items-center justify-center overflow-hidden rounded-lg border border-line">
                  <img src={preview} alt="The image on the clipboard" className="max-h-[26rem] max-w-full object-contain" />
                </div>
                {outputSize && (
                  <p className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-faint">
                    <Badge tone={resized ? 'accent' : 'neutral'}>
                      Saving {outputSize.width} × {outputSize.height}
                    </Badge>
                    <span>as {format === 'png' ? 'PNG' : `JPEG at quality ${quality}`}</span>
                    {format === 'png' && <span>· transparency is kept</span>}
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                icon="Image"
                title="No image on the clipboard"
                description="Anything copied as a picture — a screenshot, an image from a web page, a diagram from another app — can be saved here as a PNG or a JPEG."
                action={
                  <Button icon="RefreshCw" loading={reading} onClick={() => void readClipboardImage()}>
                    Read clipboard
                  </Button>
                }
              />
            )}
            {problem && !preview && !reading && (
              <Alert tone="info" className="mt-2">
                {problem}
              </Alert>
            )}
          </Section>

          {error && <ErrorDisplay error={error} onRetry={() => void save()} />}
          {saved && <ResultPanel result={saved} title="Image saved" onProcessAgain={() => setSaved(null)} />}
        </>
      }
      aside={
        <>
          <Section title="Image format">
            <div className="space-y-3">
              <Segmented
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'png', label: 'PNG', title: 'Lossless, keeps transparency' },
                  { value: 'jpg', label: 'JPEG', title: 'Smaller, no transparency' },
                ]}
                className="w-full"
              />
              {format === 'jpg' ? (
                <Field label={`Quality — ${quality}`} hint="Lower makes a smaller file with softer detail.">
                  <Slider min={40} max={100} value={quality} onChange={setQuality} />
                </Field>
              ) : (
                <p className="text-[11.5px] text-ink-faint">
                  PNG keeps every pixel exactly and supports transparency — the right choice for
                  screenshots and diagrams.
                </p>
              )}
            </div>
          </Section>

          <Section title="Size">
            <div className="space-y-3">
              <Field inline label="Resize before saving" hint="Set a width; the height follows">
                <Switch checked={resize} onCheckedChange={setResize} label="Resize before saving" disabled={!size} />
              </Field>
              {resize && size && (
                <>
                  <Field label="Width">
                    <NumberInput
                      value={targetWidth}
                      onValueChange={setTargetWidth}
                      min={MIN_WIDTH}
                      max={Math.min(MAX_WIDTH, size.width * 4)}
                      step={10}
                      suffix="px"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {[2048, 1600, 1200, 800, 400]
                      .filter((w) => w < size.width)
                      .map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setTargetWidth(w)}
                          className={
                            targetWidth === w
                              ? 'rounded-lg border border-ink bg-ink px-2.5 py-1 text-[12px] font-medium text-panel'
                              : 'rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:border-line-strong hover:text-ink'
                          }
                        >
                          {w} px
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setTargetWidth(size.width)}
                      className={
                        targetWidth === size.width
                          ? 'rounded-lg border border-ink bg-ink px-2.5 py-1 text-[12px] font-medium text-panel'
                          : 'rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:border-line-strong hover:text-ink'
                      }
                    >
                      Original
                    </button>
                  </div>
                  {outputSize && targetWidth > size.width && (
                    <Alert tone="warn">
                      Enlarging past {size.width} px cannot add detail — the result will look soft.
                    </Alert>
                  )}
                </>
              )}
            </div>
          </Section>

          <Button
            full
            variant="primary"
            size="lg"
            icon="ImageDown"
            loading={saving}
            disabled={!preview}
            title={preview ? undefined : 'Copy an image first.'}
            onClick={() => void save()}
          >
            Save as {format.toUpperCase()}
          </Button>
          {saved?.results[0] && (
            <p className="text-[11.5px] text-ink-faint">
              Last file: {saved.results[0].name} · {formatBytes(saved.results[0].size)}
            </p>
          )}
        </>
      }
    />
  );
}
