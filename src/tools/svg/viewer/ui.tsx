import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { FileDropZone, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Icon,
  Section,
  Segmented,
  Slider,
  Spinner,
  Stat,
  Textarea,
} from '@/components/ui';
import { analyzeSvg } from './logic';

/** Above this the textarea becomes sluggish, so only the head is shown. */
const SOURCE_LIMIT = 400_000;

type ZoomMode = 'fit' | 'custom';

/**
 * Renders SVG markup through a blob URL in an <img>. Images are drawn in the
 * browser's secure static mode: scripts never run and external resources are
 * never fetched, so an untrusted file is safe to look at.
 */
function useSvgUrl(svg: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!svg) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [svg]);
  return url;
}

export default function SvgViewer() {
  const files = useToolFiles({ extensions: ['svg'], filterName: 'SVG files', multiple: false });
  const file = files.files[0] ?? null;

  const [source, setSource] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [zoom, setZoom] = useState(100);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  const path = file?.path ?? null;
  useEffect(() => {
    let cancelled = false;
    setNatural(null);
    setZoomMode('fit');
    setZoom(100);
    if (!path) {
      setSource('');
      setReadError(null);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const text = await readTextFile(path);
        if (cancelled) return;
        setSource(text);
        setReadError(null);
      } catch (err) {
        if (cancelled) return;
        setSource('');
        setReadError(
          `That file could not be read as text. ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const report = useMemo(() => (source ? analyzeSvg(source) : null), [source]);
  const url = useSvgUrl(report?.ok ? source : null);

  const baseWidth = report?.renderWidth ?? natural?.width ?? 300;
  const baseHeight = report?.renderHeight ?? natural?.height ?? 150;
  const scale = zoom / 100;
  const byteSize = useMemo(() => new TextEncoder().encode(source).byteLength, [source]);
  const truncated = source.length > SOURCE_LIMIT;

  const warnings: Array<{ tone: 'danger' | 'warn' | 'info'; title: string; body: string }> = [];
  if (report?.scripts) {
    warnings.push({
      tone: 'danger',
      title: `Contains ${report.scripts} <script> element${report.scripts === 1 ? '' : 's'}`,
      body:
        'This file carries executable code. The preview above renders it as a plain image, so nothing runs here — but do not paste this markup straight into a web page or open it in a browser tab without reading it first.',
    });
  }
  if (report?.eventHandlers) {
    warnings.push({
      tone: 'warn',
      title: `${report.eventHandlers} inline event handler${report.eventHandlers === 1 ? '' : 's'}`,
      body: 'Attributes such as onclick or onload run code when the SVG is embedded in a page.',
    });
  }
  if (report?.externalRefs.length) {
    warnings.push({
      tone: 'warn',
      title: `Loads ${report.externalRefs.length} external reference${report.externalRefs.length === 1 ? '' : 's'}`,
      body: `This file points at resources on the network, so it is not self-contained: ${report.externalRefs
        .slice(0, 3)
        .join(', ')}${report.externalRefs.length > 3 ? '…' : ''}`,
    });
  }
  if (report?.linkedImages) {
    warnings.push({
      tone: 'warn',
      title: `${report.linkedImages} linked image${report.linkedImages === 1 ? '' : 's'}`,
      body: 'These <image> elements reference a file rather than embedding it, so they will be blank wherever that file is missing.',
    });
  }
  if (report?.foreignObjects) {
    warnings.push({
      tone: 'info',
      title: `${report.foreignObjects} <foreignObject> element${report.foreignObjects === 1 ? '' : 's'}`,
      body: 'HTML embedded in the vector. Many renderers, including most SVG-to-PNG converters, ignore it.',
    });
  }

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an SVG here"
            hint="One file at a time — it is previewed as an image, never executed"
            compact={!files.isEmpty}
          />

          {readError && <Alert tone="danger" title="Could not open this file">{readError}</Alert>}
          {report && !report.ok && <Alert tone="danger" title="Not a readable SVG">{report.error}</Alert>}

          <Section
            title="Preview"
            description={
              report?.ok && report.renderWidth && report.renderHeight
                ? `${Math.round(report.renderWidth)} × ${Math.round(report.renderHeight)} px at 100%`
                : 'Zoom and pan the artwork'
            }
            actions={
              <Segmented
                size="sm"
                value={zoomMode}
                onChange={(mode) => {
                  setZoomMode(mode);
                  if (mode === 'custom') setZoom(100);
                }}
                options={[
                  { value: 'fit', label: 'Fit', title: 'Scale the artwork to fill the panel' },
                  {
                    value: 'custom',
                    label: zoomMode === 'custom' ? `${zoom}%` : '100%',
                    title: 'Zoom to a set percentage of the real size',
                  },
                ]}
              />
            }
            dense
          >
            <div className="checkerboard relative h-[380px] overflow-auto rounded-lg border border-line">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner />
                </div>
              )}
              {url ? (
                <div className="flex h-full w-full min-w-fit items-center justify-center p-3">
                  <img
                    src={url}
                    alt={file?.name ?? 'SVG preview'}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
                    }}
                    className={zoomMode === 'fit' ? 'max-h-full max-w-full object-contain' : 'max-w-none'}
                    style={
                      zoomMode === 'fit'
                        ? undefined
                        : { width: Math.max(1, baseWidth * scale), height: Math.max(1, baseHeight * scale) }
                    }
                  />
                </div>
              ) : (
                !loading && (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-[12.5px] text-ink-faint">
                      {files.isEmpty ? 'Add an SVG to see it here' : 'Nothing to preview'}
                    </p>
                  </div>
                )
              )}
            </div>

            {zoomMode === 'custom' && (
              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="Minus"
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(10, Math.round(z / 1.25)))}
                >
                  Out
                </Button>
                <Slider min={10} max={800} step={5} value={zoom} onChange={setZoom} className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="Plus"
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(800, Math.round(z * 1.25)))}
                >
                  In
                </Button>
                <span className="w-14 shrink-0 text-right font-mono text-[12px] text-ink-soft">{zoom}%</span>
              </div>
            )}
          </Section>

          <Section
            title="Source"
            description={truncated ? `Showing the first ${SOURCE_LIMIT.toLocaleString()} characters` : undefined}
            actions={<CopyButton value={() => source} label="Copy source" size="sm" disabled={!source} />}
            dense
          >
            <Textarea
              readOnly
              value={truncated ? `${source.slice(0, SOURCE_LIMIT)}\n…` : source}
              rows={14}
              placeholder="The markup appears here"
              className="bg-canvas"
            />
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Image">
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Width"
                value={report?.widthAttr ?? (report?.viewBox ? `${report.viewBox.width}` : '—')}
                hint={report?.widthAttr ? undefined : report?.viewBox ? 'from viewBox' : 'not declared'}
              />
              <Stat
                label="Height"
                value={report?.heightAttr ?? (report?.viewBox ? `${report.viewBox.height}` : '—')}
                hint={report?.heightAttr ? undefined : report?.viewBox ? 'from viewBox' : 'not declared'}
              />
              <Stat label="viewBox" value={report?.viewBoxAttr ?? '—'} hint={report?.viewBoxAttr ? undefined : 'missing'} />
              <Stat label="Aspect ratio" value={report?.aspect ?? '—'} />
              <Stat label="File size" value={file ? formatBytes(file.size) : '—'} hint={source ? `${formatBytes(byteSize)} of markup` : undefined} />
              <Stat label="Title" value={report?.title ?? '—'} />
            </div>
            {report?.ok && !report.viewBox && (
              <Alert tone="warn" className="mt-3">
                No viewBox, so this image cannot scale — it renders at a fixed size wherever it is used.
              </Alert>
            )}
          </Section>

          <Section title="Structure" description={report?.ok ? `${report.elementTotal} elements · ${report.nodeTotal} nodes · ${report.maxDepth} levels deep` : undefined}>
            {report?.ok && report.elements.length > 0 ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {report.elements.map((e) => (
                  <li key={e.tag} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[12px] text-ink-soft">&lt;{e.tag}&gt;</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-ink">{e.count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-faint">Add an SVG to see what it is made of.</p>
            )}
          </Section>

          {report?.ok && (
            <Section title="Content">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={report.scripts ? 'danger' : 'neutral'}>
                  <Icon name="Code2" size={12} />
                  {report.scripts} script{report.scripts === 1 ? '' : 's'}
                </Badge>
                <Badge tone={report.embeddedImages ? 'warn' : 'neutral'}>
                  <Icon name="Image" size={12} />
                  {report.embeddedImages} embedded raster{report.embeddedImages === 1 ? '' : 's'}
                </Badge>
                <Badge tone={report.linkedImages ? 'warn' : 'neutral'}>
                  {report.linkedImages} linked image{report.linkedImages === 1 ? '' : 's'}
                </Badge>
                <Badge tone={report.externalRefs.length ? 'warn' : 'neutral'}>
                  {report.externalRefs.length} external ref{report.externalRefs.length === 1 ? '' : 's'}
                </Badge>
                <Badge>{report.styleElements} &lt;style&gt;</Badge>
                <Badge>{report.styleAttributes} style attributes</Badge>
                <Badge>{report.ids} ids</Badge>
              </div>
              {report.embeddedImages > 0 && (
                <p className="mt-3 text-[11.5px] text-ink-faint">
                  Embedded rasters are stored as base64 inside the file. They keep it self-contained but stop it
                  scaling like true vector artwork.
                </p>
              )}
            </Section>
          )}

          {warnings.map((w) => (
            <Alert key={w.title} tone={w.tone} title={w.title}>
              {w.body}
            </Alert>
          ))}
        </>
      }
    />
  );
}
