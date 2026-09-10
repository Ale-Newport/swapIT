import { useState } from 'react';
import clsx from 'clsx';
import { OptionsGrid, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Select, Slider, Stat } from '@/components/ui';
import {
  PNG_PROFILES,
  SIZE_PRESETS,
  decodedBytes,
  estimateFormats,
  formatSize,
  jpegBpp,
  megapixels,
  parsePositive,
  pngProfile,
  trim,
  uncompressedBytes,
  type PngContent,
} from './logic';

const DEPTH_OPTIONS = [
  { value: '8', label: '8 bits per channel — standard' },
  { value: '16', label: '16 bits per channel — raw, HDR' },
  { value: '32', label: '32 bits per channel — float / EXR' },
];

const CHANNEL_OPTIONS = [
  { value: '1', label: '1 — greyscale' },
  { value: '2', label: '2 — greyscale + alpha' },
  { value: '3', label: '3 — RGB' },
  { value: '4', label: '4 — RGBA / CMYK' },
];

export default function ImageSizeCalculator() {
  const [widthText, setWidthText] = useState('4032');
  const [heightText, setHeightText] = useState('3024');
  const [depth, setDepth] = useState('8');
  const [channels, setChannels] = useState('3');
  const [quality, setQuality] = useState(85);
  const [pngContent, setPngContent] = useState<PngContent>('photo');

  const width = parsePositive(widthText);
  const height = parsePositive(heightText);
  const bits = Number(depth);
  const chans = Number(channels);

  const mp = width && height ? megapixels(width, height) : null;
  const raw = width && height ? uncompressedBytes(width, height, bits, chans) : null;
  const decoded8 = width && height ? decodedBytes(width, height, 4) : null;
  const decodedNative = width && height ? decodedBytes(width, height, Math.max(1, (bits / 8) * 4)) : null;
  const profile = pngProfile(pngContent);

  const rows =
    width && height
      ? estimateFormats({
          width,
          height,
          bitsPerChannel: bits,
          channels: chans,
          jpegQuality: quality,
          pngContent,
        })
      : [];

  const summary = () => {
    if (!rows.length || raw === null) return '';
    const lines = [
      `${width} × ${height} px · ${trim(mp, 2)} MP · ${bits}-bit × ${chans} channels`,
      `Uncompressed   ${formatSize(raw)}`,
      `Decoded (RGBA8) ${formatSize(decoded8)}`,
      '',
    ];
    for (const row of rows) lines.push(`${row.label.padEnd(26)} ${formatSize(row.bytes)}  (${trim(row.ratio, 1)}:1)`);
    return lines.join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Pixels and format" description="Sizes update as you type">
            <OptionsGrid cols={2}>
              <Field label="Width" hint="pixels">
                <Input
                  value={widthText}
                  aria-label="Width"
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => setWidthText(e.target.value)}
                  className={clsx('font-mono', widthText.trim() !== '' && width === null && 'border-danger')}
                />
              </Field>
              <Field label="Height" hint="pixels">
                <Input
                  value={heightText}
                  aria-label="Height"
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => setHeightText(e.target.value)}
                  className={clsx('font-mono', heightText.trim() !== '' && height === null && 'border-danger')}
                />
              </Field>
              <Field label="Bit depth">
                <Select value={depth} onChange={(e) => setDepth(e.target.value)} options={DEPTH_OPTIONS} />
              </Field>
              <Field label="Channels">
                <Select value={channels} onChange={(e) => setChannels(e.target.value)} options={CHANNEL_OPTIONS} />
              </Field>
            </OptionsGrid>
          </Section>

          <Section
            title="Exact figures"
            description="These are arithmetic, not estimates"
            actions={<CopyButton size="sm" value={summary} label="Copy" disabled={!summary()} />}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Stat label="Megapixels" value={mp === null ? '—' : `${trim(mp, 2)} MP`} />
              <Stat
                label="Uncompressed"
                value={formatSize(raw)}
                hint={raw === null ? undefined : `${trim(raw, 0)} bytes`}
              />
              <Stat label="Decoded in RAM" value={formatSize(decoded8)} hint="8-bit RGBA, what apps allocate" />
              <Stat
                label="At this bit depth"
                value={formatSize(decodedNative)}
                hint={`${bits}-bit × 4 channels in memory`}
              />
            </div>

            <p className="mt-4 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
              {raw === null
                ? 'bytes = width × height × channels × bit depth ÷ 8'
                : `${trim(width, 0)} × ${trim(height, 0)} × ${chans} × ${bits} ÷ 8 = ${trim(raw, 0)} bytes`}
              <br />
              {decoded8 === null
                ? 'decoded = width × height × 4 bytes'
                : `${trim(width, 0)} × ${trim(height, 0)} × 4 = ${trim(decoded8, 0)} bytes in memory`}
            </p>

            {decoded8 !== null && (
              <Alert tone="info" className="mt-3">
                The memory figure is the one that bites. However little this image weighs compressed on disk, it
                expands to roughly {formatSize(decoded8)} the moment it is decoded — a dozen open at once needs about{' '}
                {formatSize(decoded8 * 12)} of RAM.
              </Alert>
            )}
          </Section>

          <Section title="Compressed estimates" description="Modelled from typical content — real files vary">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`JPEG quality — ${quality}`}
                hint={`${jpegBpp(quality).toFixed(2)} bits per pixel on photographic content`}
              >
                <div className="pt-2">
                  <Slider value={quality} onChange={setQuality} min={10} max={100} step={1} />
                </div>
              </Field>
              <Field label="PNG content" hint={profile.note}>
                <Select
                  value={pngContent}
                  onChange={(e) => setPngContent(e.target.value as PngContent)}
                  options={PNG_PROFILES.map((p) => ({ value: p.id, label: p.label }))}
                />
              </Field>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="py-1.5 pr-3 font-medium">Format</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Estimated size</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Ratio</th>
                    <th className="py-1.5 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 text-ink-faint">
                        Enter a width and height to see estimates.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-3 text-ink">{row.label}</td>
                        <td className="py-2 pr-3 text-right font-mono text-ink selectable">{formatSize(row.bytes)}</td>
                        <td className="py-2 pr-3 text-right">
                          <Badge tone="neutral">{trim(row.ratio, 1)}:1</Badge>
                        </td>
                        <td className="py-2 text-[11.5px] text-ink-faint">{row.note}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-3 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
              {rows.length && width && height
                ? `jpeg = ${trim(width * height, 0)} px × ${jpegBpp(quality).toFixed(2)} bpp ÷ 8 × channel factor = ${formatSize(rows[0].bytes)}`
                : 'estimated bytes = pixels × bits per pixel ÷ 8, adjusted for channels and depth'}
              <br />
              {rows.length && width && height
                ? `png  = ${trim(width * height, 0)} px × ${profile.bpp} bpp ÷ 8 × channel and depth factors = ${formatSize(rows[1].bytes)}`
                : 'png bits per pixel depends on how repetitive the picture is'}
            </p>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Common sizes">
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  onClick={() => {
                    setWidthText(String(p.width));
                    setHeightText(String(p.height));
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Where the numbers come from">
            <ul className="space-y-2 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                <span className="font-medium text-ink-soft">Uncompressed and memory</span> are exact — pure
                multiplication, no guessing involved.
              </li>
              <li>
                <span className="font-medium text-ink-soft">JPEG</span> is interpolated along a curve anchored on the
                familiar case: a 12 MP photo at quality 85 lands near 4 MB.
              </li>
              <li>
                <span className="font-medium text-ink-soft">PNG</span> depends entirely on content, which is why it
                is picked here rather than guessed. Photographs barely compress; flat graphics collapse.
              </li>
              <li>
                A specific image can miss any of these by half. Noise, film grain and fine texture cost far more than
                the model expects; blur and flat sky cost far less.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
