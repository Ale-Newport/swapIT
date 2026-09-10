import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, CopyButton, Field, Input, Section, Slider } from '@/components/ui';
import {
  type HSL,
  type RGBA,
  contrastReport,
  formatCmyk,
  formatHsl,
  formatHsla,
  formatHsv,
  formatRgb,
  formatRgba,
  hslToRgb,
  nearestNamed,
  parseColor,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  shades,
  tints,
  toCss,
  toHex,
  toHexAlpha,
  type WcagVerdict,
} from './logic';

type FieldId = 'hex' | 'rgb' | 'rgba' | 'hsl' | 'hsla' | 'hsv' | 'cmyk' | 'name';

interface State {
  rgba: RGBA;
  hsl: HSL;
}

const PRESETS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#111827', '#e5e7eb'];

function fromRgba(rgba: RGBA): State {
  return { rgba, hsl: rgbToHsl(rgba) };
}

function fromHsl(hsl: HSL, a: number): State {
  return { rgba: { ...hslToRgb(hsl), a }, hsl };
}

/** Each field accepts its own bare syntax as well as the full CSS function. */
function parseField(field: FieldId, text: string): RGBA {
  const raw = text.trim();
  if (!raw) throw new Error('Type a colour value.');
  if (raw.includes('(') || field === 'hex' || field === 'name' || raw.startsWith('#')) return parseColor(raw);
  switch (field) {
    case 'rgb':
    case 'rgba':
      return parseColor(`rgb(${raw})`);
    case 'hsl':
    case 'hsla':
      return parseColor(`hsl(${raw})`);
    case 'hsv':
      return parseColor(`hsv(${raw})`);
    case 'cmyk':
      return parseColor(`cmyk(${raw})`);
    default:
      return parseColor(raw);
  }
}

function Verdict({ label, verdict }: { label: string; verdict: WcagVerdict }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-ink-soft">{label}</p>
        <p className="font-mono text-[15px] font-semibold text-ink tabular-nums">{verdict.ratio.toFixed(2)}:1</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone={verdict.aaNormal ? 'success' : 'danger'}>AA text {verdict.aaNormal ? '✓' : '✗'}</Badge>
        <Badge tone={verdict.aaLarge ? 'success' : 'danger'}>AA large {verdict.aaLarge ? '✓' : '✗'}</Badge>
        <Badge tone={verdict.aaaNormal ? 'success' : 'danger'}>AAA text {verdict.aaaNormal ? '✓' : '✗'}</Badge>
        <Badge tone={verdict.aaaLarge ? 'success' : 'danger'}>AAA large {verdict.aaaLarge ? '✓' : '✗'}</Badge>
      </div>
    </div>
  );
}

function Swatch({ percent, hex }: { percent: number; hex: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      title={`${percent}% · click to copy ${hex}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(hex);
          setCopied(true);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="min-w-0 text-left"
    >
      <span
        className="relative flex h-10 items-center justify-center rounded-lg border border-line"
        style={{ background: hex }}
      >
        {copied && (
          <span className="rounded bg-panel px-1 py-[1px] text-[10px] font-medium text-ink">Copied</span>
        )}
      </span>
      <span className="mt-1 block truncate text-center font-mono text-[10.5px] text-ink-faint">{hex}</span>
    </button>
  );
}

function Ramp({ label, stops }: { label: string; stops: Array<{ percent: number; hex: string }> }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-ink-soft">{label}</p>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {stops.map((stop) => (
          <Swatch key={stop.percent} percent={stop.percent} hex={stop.hex} />
        ))}
      </div>
    </div>
  );
}

export default function ColorConverter() {
  const [state, setState] = useState<State>(() => fromRgba({ r: 59, g: 130, b: 246, a: 1 }));
  const [draft, setDraft] = useState<{ field: FieldId; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { rgba, hsl } = state;
  const hsv = useMemo(() => rgbToHsv(rgba), [rgba]);
  const cmyk = useMemo(() => rgbToCmyk(rgba), [rgba]);
  const named = useMemo(() => nearestNamed(rgba), [rgba]);
  const contrast = useMemo(() => contrastReport(rgba), [rgba]);

  const canonical = (field: FieldId): string => {
    switch (field) {
      case 'hex':
        return rgba.a >= 1 ? toHex(rgba) : toHexAlpha(rgba);
      case 'rgb':
        return formatRgb(rgba);
      case 'rgba':
        return formatRgba(rgba);
      case 'hsl':
        return formatHsl(hsl);
      case 'hsla':
        return formatHsla(hsl, rgba.a);
      case 'hsv':
        return formatHsv(hsv);
      case 'cmyk':
        return formatCmyk(cmyk);
      case 'name':
        return named.name;
    }
  };

  const shown = (field: FieldId): string => (draft?.field === field ? draft.text : canonical(field));

  const onFieldChange = (field: FieldId, text: string) => {
    setDraft({ field, text });
    try {
      setState(fromRgba(parseField(field, text)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const setHslChannel = (patch: Partial<HSL>) => {
    setDraft(null);
    setError(null);
    setState(fromHsl({ ...hsl, ...patch }, rgba.a));
  };

  const FIELDS: Array<{ id: FieldId; label: string; hint?: string }> = [
    { id: 'hex', label: 'HEX' },
    { id: 'rgb', label: 'RGB' },
    { id: 'rgba', label: 'RGBA' },
    { id: 'hsl', label: 'HSL' },
    { id: 'hsla', label: 'HSLA' },
    { id: 'hsv', label: 'HSV' },
    { id: 'cmyk', label: 'CMYK' },
    { id: 'name', label: 'CSS name', hint: named.exact ? 'exact match' : `nearest · Δ${named.distance}` },
  ];

  return (
    <ToolShell
      main={
        <>
          <Section title="Colour" description="Every field is editable — the rest follow">
            <div className="mb-4 flex flex-wrap items-stretch gap-3">
              <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-card border border-line">
                <span className="absolute inset-0 checkerboard" />
                <span className="absolute inset-0" style={{ background: toCss(rgba) }} />
              </div>
              <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-2">
                <div
                  className="flex flex-col items-center justify-center rounded-lg border border-line"
                  style={{ background: '#ffffff' }}
                >
                  <span className="text-[19px] font-semibold" style={{ color: toHex(rgba) }}>
                    Aa
                  </span>
                  <span className="mt-0.5 text-[11px]" style={{ color: 'rgba(0,0,0,0.55)' }}>
                    on white · {contrast.white.ratio.toFixed(2)}:1
                  </span>
                </div>
                <div
                  className="flex flex-col items-center justify-center rounded-lg border border-line"
                  style={{ background: '#000000' }}
                >
                  <span className="text-[19px] font-semibold" style={{ color: toHex(rgba) }}>
                    Aa
                  </span>
                  <span className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    on black · {contrast.black.ratio.toFixed(2)}:1
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {FIELDS.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <div className="w-[92px] shrink-0">
                    <p className="text-[12.5px] font-medium text-ink">{f.label}</p>
                    {f.hint && <p className="text-[11px] text-ink-faint">{f.hint}</p>}
                  </div>
                  <Input
                    value={shown(f.id)}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => onFieldChange(f.id, e.target.value)}
                    onBlur={() => {
                      setDraft(null);
                      setError(null);
                    }}
                    className={clsx('font-mono', draft?.field === f.id && error && 'border-danger focus:border-danger')}
                  />
                  <CopyButton value={() => canonical(f.id)} size="sm" variant="ghost" className="w-[84px] shrink-0" />
                </div>
              ))}
            </div>

            {error && (
              <Alert tone="danger" className="mt-3" title="That value could not be read as a colour">
                {error}
              </Alert>
            )}
          </Section>

          <Section
            title="Contrast"
            description="WCAG 2.1 — 4.5:1 for body text, 3:1 for large text (18pt or 14pt bold)"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Verdict label="Against white" verdict={contrast.white} />
              <Verdict label="Against black" verdict={contrast.black} />
            </div>
            <p className="mt-3 text-[11.5px] text-ink-faint">
              Best on <span className="font-medium text-ink-soft">{contrast.bestOn}</span> ·{' '}
              {contrast.bestOn === 'white' ? contrast.white.grade : contrast.black.grade}. Alpha is ignored — contrast is
              measured on the opaque colour.
            </p>
          </Section>

          <Section title="Tints and shades" description="10% steps toward white and black">
            <div className="space-y-4">
              <Ramp label="Tints (toward white)" stops={tints(rgba)} />
              <Ramp label="Shades (toward black)" stops={shades(rgba)} />
            </div>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Adjust">
            <div className="space-y-3.5">
              <Field label={`Hue · ${Math.round(hsl.h)}°`}>
                <Slider value={hsl.h} min={0} max={360} step={1} onChange={(h) => setHslChannel({ h })} />
              </Field>
              <Field label={`Saturation · ${Math.round(hsl.s)}%`}>
                <Slider value={hsl.s} min={0} max={100} step={1} onChange={(s) => setHslChannel({ s })} />
              </Field>
              <Field label={`Lightness · ${Math.round(hsl.l)}%`}>
                <Slider value={hsl.l} min={0} max={100} step={1} onChange={(l) => setHslChannel({ l })} />
              </Field>
              <Field label={`Alpha · ${Math.round(rgba.a * 100)}%`}>
                <Slider
                  value={Math.round(rgba.a * 100)}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(a) => {
                    setDraft(null);
                    setError(null);
                    setState({ ...state, rgba: { ...rgba, a: a / 100 } });
                  }}
                />
              </Field>
            </div>
          </Section>

          <Section title="Presets">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                    setState(fromRgba(parseColor(hex)));
                  }}
                  className="h-7 w-7 rounded-lg border border-line transition-transform hover:scale-110"
                  style={{ background: hex }}
                />
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
              Paste any CSS notation into a field: <span className="font-mono">#3b82f6</span>,{' '}
              <span className="font-mono">rgb(59 130 246 / 50%)</span>, <span className="font-mono">hsl(217, 91%, 60%)</span>,{' '}
              <span className="font-mono">hsv()</span>, <span className="font-mono">cmyk()</span> or a colour name.
            </p>
          </Section>
        </>
      }
    />
  );
}
