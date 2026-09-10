import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import { Badge, Button, CopyButton, Field, Input, Section, Segmented, Select, Stat } from '@/components/ui';
import {
  cropOverflow,
  decimalLabel,
  fitBox,
  letterbox,
  namedFor,
  orientation,
  parsePositive,
  parseRatioText,
  ratioLabel,
  simplify,
  type Ratio,
} from './logic';

type FieldId = 'width' | 'height' | 'ratio';
type Mode = 'solve' | 'fit';

const RATIO_PRESETS: Array<{ label: string; value: string; hint: string }> = [
  { label: '16:9', value: '16:9', hint: 'HD widescreen' },
  { label: '4:3', value: '4:3', hint: 'Classic screen' },
  { label: '21:9', value: '21:9', hint: 'Ultrawide' },
  { label: '1:1', value: '1:1', hint: 'Square' },
  { label: '9:16', value: '9:16', hint: 'Vertical video' },
  { label: '3:2', value: '3:2', hint: '35 mm photo' },
  { label: '2.39:1', value: '2.39:1', hint: 'Anamorphic scope' },
  { label: '16:10', value: '16:10', hint: 'Desktop' },
  { label: '4:5', value: '4:5', hint: 'Instagram portrait' },
];

const SIZE_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160', w: 3840, h: 2160 },
  { label: '1080 × 1350', w: 1080, h: 1350 },
  { label: '1080 × 1920', w: 1080, h: 1920 },
  { label: '1200 × 630', w: 1200, h: 630 },
];

const SNAP_OPTIONS = [
  { value: '1', label: 'Exact pixel' },
  { value: '2', label: 'Even numbers (video)' },
  { value: '4', label: 'Multiple of 4' },
  { value: '8', label: 'Multiple of 8' },
  { value: '16', label: 'Multiple of 16' },
];

/** A rectangle drawn to the real ratio inside a fixed frame. */
function RatioBox({
  decimal,
  caption,
  frameW = 300,
  frameH = 180,
}: {
  decimal: number | null;
  caption: string;
  frameW?: number;
  frameH?: number;
}) {
  if (decimal === null || !Number.isFinite(decimal) || decimal <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-line bg-canvas text-[11.5px] text-ink-faint"
        style={{ height: frameH + 24 }}
      >
        Enter two values to see the shape
      </div>
    );
  }
  let w = frameW;
  let h = frameW / decimal;
  if (h > frameH) {
    h = frameH;
    w = frameH * decimal;
  }
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-line bg-canvas p-3"
      style={{ height: frameH + 24 }}
    >
      <div
        className="flex items-center justify-center rounded-md border border-accent bg-accent-soft text-[11.5px] font-medium text-accent"
        style={{ width: `${w}px`, height: `${h}px` }}
      >
        {w > 70 && h > 20 ? caption : ''}
      </div>
    </div>
  );
}

/** The box, the contained rectangle and the covered rectangle in one picture. */
function FitPreview({
  boxW,
  boxH,
  contain,
  cover,
}: {
  boxW: number;
  boxH: number;
  contain: { width: number; height: number } | null;
  cover: { width: number; height: number } | null;
}) {
  const frameW = 300;
  const frameH = 190;
  // The cover rectangle is deliberately larger than the box, so the frame is
  // scaled to the union of the two — scaling to the box alone would push cover
  // outside the card and over the caption beneath it. A wildly mismatched
  // source would then squash the box to a sliver, so the frame grows to at most
  // 1.6× the box and the card clips whatever still hangs over.
  const maxSpan = 1.6;
  const spanW = Math.min(Math.max(boxW, cover?.width ?? 0), boxW * maxSpan);
  const spanH = Math.min(Math.max(boxH, cover?.height ?? 0), boxH * maxSpan);
  const scale = Math.min(frameW / spanW, frameH / spanH);
  const bw = boxW * scale;
  const bh = boxH * scale;
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas p-4"
      style={{ height: frameH + 32 }}
    >
      <div className="relative" style={{ width: `${bw}px`, height: `${bh}px` }}>
        {cover && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-dashed border-warn"
            style={{ width: `${cover.width * scale}px`, height: `${cover.height * scale}px` }}
          />
        )}
        <div className="absolute inset-0 rounded-[3px] border border-line-strong bg-panel" />
        {contain && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-accent bg-accent-soft"
            style={{ width: `${contain.width * scale}px`, height: `${contain.height * scale}px` }}
          />
        )}
      </div>
    </div>
  );
}

function px(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} px`;
}

export default function AspectRatioCalculator() {
  const [mode, setMode] = useState<Mode>('solve');

  // ---- solve mode: the least recently touched field is the computed one.
  const [order, setOrder] = useState<FieldId[]>(['width', 'height', 'ratio']);
  const [widthText, setWidthText] = useState('1920');
  const [heightText, setHeightText] = useState('1080');
  const [ratioText, setRatioText] = useState('16:9');
  const target = order[2];

  const touch = (field: FieldId) => setOrder((prev) => [field, ...prev.filter((f) => f !== field)] as FieldId[]);

  const typedWidth = parsePositive(widthText);
  const typedHeight = parsePositive(heightText);
  const typedRatio = parseRatioText(ratioText);

  const solved = useMemo(() => {
    if (target === 'ratio') {
      if (typedWidth === null || typedHeight === null) return null;
      return { width: typedWidth, height: typedHeight, ratio: typedWidth / typedHeight };
    }
    if (target === 'height') {
      if (typedWidth === null || typedRatio === null) return null;
      return { width: typedWidth, height: typedWidth / typedRatio, ratio: typedRatio };
    }
    if (typedHeight === null || typedRatio === null) return null;
    return { width: typedHeight * typedRatio, height: typedHeight, ratio: typedRatio };
  }, [target, typedWidth, typedHeight, typedRatio]);

  const exact: Ratio | null = solved ? simplify(solved.width, solved.height) : null;
  const named = solved ? namedFor(solved.ratio) : null;

  const displayFor = (field: FieldId): string => {
    if (field !== target) {
      return field === 'width' ? widthText : field === 'height' ? heightText : ratioText;
    }
    if (!solved) return '';
    if (field === 'ratio') return exact ? ratioLabel(exact) : decimalLabel(solved.ratio);
    const value = field === 'width' ? solved.width : solved.height;
    return String(Math.round(value));
  };

  const inexact =
    solved && target !== 'ratio'
      ? Math.abs((target === 'width' ? solved.width : solved.height) % 1) > 1e-9
      : false;
  const exactValue = solved ? (target === 'width' ? solved.width : solved.height) : 0;

  const solveFormula = (): string => {
    if (!solved) return 'Fill in any two of the three fields';
    if (target === 'ratio') {
      return `${decimalLabel(solved.width, 0)} ÷ ${decimalLabel(solved.height, 0)} = ${decimalLabel(solved.ratio)} → ${ratioLabel(exact)}`;
    }
    if (target === 'height') {
      return `height = width ÷ ratio = ${decimalLabel(solved.width, 0)} ÷ ${decimalLabel(solved.ratio)} = ${decimalLabel(solved.height, 2)}`;
    }
    return `width = height × ratio = ${decimalLabel(solved.height, 0)} × ${decimalLabel(solved.ratio)} = ${decimalLabel(solved.width, 2)}`;
  };

  // ---- fit mode
  const [srcW, setSrcW] = useState('4032');
  const [srcH, setSrcH] = useState('3024');
  const [boxW, setBoxW] = useState('1920');
  const [boxH, setBoxH] = useState('1080');
  const [snap, setSnap] = useState('1');

  const sw = parsePositive(srcW);
  const sh = parsePositive(srcH);
  const bw = parsePositive(boxW);
  const bh = parsePositive(boxH);
  const step = Number(snap);

  const contain = sw && sh && bw && bh ? fitBox(sw, sh, bw, bh, 'contain', step) : null;
  const cover = sw && sh && bw && bh ? fitBox(sw, sh, bw, bh, 'cover', step) : null;
  const bars = contain && bw && bh ? letterbox(contain, bw, bh) : null;
  const crop = cover && bw && bh ? cropOverflow(cover, bw, bh) : null;

  const modeBar = (
    <div className="flex items-center justify-between gap-3">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'solve', label: 'Solve a size' },
          { value: 'fit', label: 'Fit within a box' },
        ]}
      />
      {mode === 'solve' && solved && (
        <CopyButton
          size="sm"
          value={`${Math.round(solved.width)}×${Math.round(solved.height)} (${ratioLabel(exact)})`}
          label="Copy size"
        />
      )}
    </div>
  );

  return (
    <ToolShell
      main={
        <>
          {modeBar}

          {mode === 'solve' ? (
            <>
              <Section
                title="Width, height, ratio"
                description="Type in any two — the third is calculated and marked"
              >
                <OptionsGrid cols={3}>
                  {(['width', 'height', 'ratio'] as FieldId[]).map((field) => {
                    const isTarget = field === target;
                    const label = field === 'ratio' ? 'Ratio' : field === 'width' ? 'Width' : 'Height';
                    const raw = displayFor(field);
                    const invalid =
                      !isTarget &&
                      raw.trim() !== '' &&
                      (field === 'ratio' ? parseRatioText(raw) === null : parsePositive(raw) === null);
                    return (
                      <Field
                        key={field}
                        label={
                          <span className="flex items-center gap-1.5">
                            {label}
                            {isTarget && <Badge tone="accent">calculated</Badge>}
                          </span>
                        }
                        hint={field === 'ratio' ? '16:9, 16/9 or 1.85' : 'pixels'}
                      >
                        <Input
                          value={raw}
                          aria-label={label}
                          inputMode={field === 'ratio' ? 'text' : 'numeric'}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(e) => {
                            if (field === 'width') setWidthText(e.target.value);
                            else if (field === 'height') setHeightText(e.target.value);
                            else setRatioText(e.target.value);
                            touch(field);
                          }}
                          className={clsx(
                            'font-mono',
                            isTarget && 'bg-canvas',
                            invalid && 'border-danger focus:border-danger',
                          )}
                        />
                      </Field>
                    );
                  })}
                </OptionsGrid>

                <p className="mt-3 font-mono text-[11.5px] leading-[1.6] text-ink-faint selectable">
                  {solveFormula()}
                </p>
                {inexact && (
                  <p className="mt-1 text-[11.5px] text-warn">
                    Exact value is {decimalLabel(exactValue, 3)} px — shown rounded, so the ratio is very slightly
                    off.
                  </p>
                )}
              </Section>

              <Section title="Result">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Stat
                    label="Simplified"
                    value={ratioLabel(exact)}
                    hint={named ? named.note : 'reduced with the gcd'}
                  />
                  <Stat
                    label="Decimal"
                    value={solved ? `${decimalLabel(solved.ratio)} : 1` : '—'}
                    hint="width ÷ height"
                  />
                  <Stat label="Orientation" value={solved ? orientation(solved.ratio) : '—'} />
                  <Stat
                    label="Megapixels"
                    value={solved ? `${((solved.width * solved.height) / 1e6).toFixed(2)} MP` : '—'}
                    hint={solved ? `${px(solved.width)} × ${px(solved.height)}` : undefined}
                  />
                </div>
                <div className="mt-4">
                  <RatioBox
                    decimal={solved ? solved.ratio : null}
                    caption={solved ? `${Math.round(solved.width)} × ${Math.round(solved.height)}` : ''}
                  />
                </div>
              </Section>
            </>
          ) : (
            <>
              <Section title="Source and target" description="Scale a picture into a box without distorting it">
                <OptionsGrid cols={2}>
                  <Field label="Source width" hint="pixels">
                    <Input
                      value={srcW}
                      aria-label="Source width"
                      inputMode="numeric"
                      onChange={(e) => setSrcW(e.target.value)}
                      className={clsx('font-mono', srcW.trim() && sw === null && 'border-danger')}
                    />
                  </Field>
                  <Field label="Source height" hint="pixels">
                    <Input
                      value={srcH}
                      aria-label="Source height"
                      inputMode="numeric"
                      onChange={(e) => setSrcH(e.target.value)}
                      className={clsx('font-mono', srcH.trim() && sh === null && 'border-danger')}
                    />
                  </Field>
                  <Field label="Box width" hint="pixels">
                    <Input
                      value={boxW}
                      aria-label="Box width"
                      inputMode="numeric"
                      onChange={(e) => setBoxW(e.target.value)}
                      className={clsx('font-mono', boxW.trim() && bw === null && 'border-danger')}
                    />
                  </Field>
                  <Field label="Box height" hint="pixels">
                    <Input
                      value={boxH}
                      aria-label="Box height"
                      inputMode="numeric"
                      onChange={(e) => setBoxH(e.target.value)}
                      className={clsx('font-mono', boxH.trim() && bh === null && 'border-danger')}
                    />
                  </Field>
                </OptionsGrid>
                <div className="mt-3">
                  <Field label="Round results to" hint="Encoders reject odd dimensions; 16 suits some hardware">
                    <Select
                      value={snap}
                      onChange={(e) => setSnap(e.target.value)}
                      options={SNAP_OPTIONS}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Contain and cover">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-medium text-ink">Contain</p>
                      <Badge tone="accent">no crop</Badge>
                    </div>
                    <p className="mt-1.5 text-[15px] font-semibold text-ink selectable">
                      {contain ? `${contain.width} × ${contain.height}` : '—'}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-faint">
                      {contain && bars
                        ? bars.x > 0.5 && bars.y > 0.5
                          ? `Bars ${Math.round(bars.x)} px left and right, ${Math.round(bars.y)} px top and bottom`
                          : bars.x > 0.5
                            ? `Pillarbox bars ${Math.round(bars.x)} px on the left and right`
                            : bars.y > 0.5
                              ? `Letterbox bars ${Math.round(bars.y)} px on the top and bottom`
                              : 'Fills the box exactly — same ratio'
                        : 'Fill in all four sizes'}
                    </p>
                    <p className="mt-2 font-mono text-[11px] leading-[1.6] text-ink-faint selectable">
                      {contain && sw && sh && bw && bh
                        ? `scale = min(${bw}÷${sw}, ${bh}÷${sh}) = ${contain.scale.toFixed(4)}`
                        : 'scale = min(box W ÷ src W, box H ÷ src H)'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-medium text-ink">Cover</p>
                      <Badge tone="warn">crops</Badge>
                    </div>
                    <p className="mt-1.5 text-[15px] font-semibold text-ink selectable">
                      {cover ? `${cover.width} × ${cover.height}` : '—'}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-faint">
                      {cover && crop
                        ? crop.x > 0.5 && crop.y > 0.5
                          ? `Loses ${Math.round(crop.x)} px from each side and ${Math.round(crop.y)} px from the top and bottom`
                          : crop.x > 0.5
                            ? `Loses ${Math.round(crop.x)} px from each side`
                            : crop.y > 0.5
                              ? `Loses ${Math.round(crop.y)} px from the top and bottom`
                              : 'Nothing is cropped — same ratio'
                        : 'Fill in all four sizes'}
                    </p>
                    <p className="mt-2 font-mono text-[11px] leading-[1.6] text-ink-faint selectable">
                      {cover && sw && sh && bw && bh
                        ? `scale = max(${bw}÷${sw}, ${bh}÷${sh}) = ${cover.scale.toFixed(4)}`
                        : 'scale = max(box W ÷ src W, box H ÷ src H)'}
                    </p>
                  </div>
                </div>

                {bw && bh && (
                  <div className="mt-3">
                    <FitPreview boxW={bw} boxH={bh} contain={contain} cover={cover} />
                    <p className="mt-2 text-[11.5px] text-ink-faint">
                      Solid outline is the box, blue is contain, dashed amber is cover.
                    </p>
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      }
      aside={
        mode === 'solve' ? (
          <>
            <Section title="Ratio presets" description="Sets the ratio and recalculates the other dimension">
              <PresetRow
                presets={RATIO_PRESETS}
                // The ratio field shows the calculated label once width and
                // height are the inputs, so highlight what is on screen rather
                // than the text last typed into it.
                active={displayFor('ratio')}
                onSelect={(value) => {
                  setRatioText(value);
                  setOrder((prev) => {
                    const withoutRatio = prev.filter((f) => f !== 'ratio');
                    // Keep whichever dimension was touched most recently as the input.
                    return ['ratio', withoutRatio[0], withoutRatio[1]] as FieldId[];
                  });
                }}
              />
            </Section>

            <Section title="Common sizes" description="Sets width and height, ratio follows">
              <div className="flex flex-wrap gap-1.5">
                {SIZE_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    onClick={() => {
                      setWidthText(String(p.w));
                      setHeightText(String(p.h));
                      setOrder(['width', 'height', 'ratio']);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title="Worth knowing">
              <p className="text-[11.5px] leading-[1.6] text-ink-faint">
                A ratio only exists as an exact integer pair when both sides divide cleanly — 1920×1080 reduces to
                16:9, but 1919×1080 stays 1919:1080. When a calculated side lands between pixels it is rounded, which
                is why exporters sometimes give you a size one pixel off the ratio you asked for.
              </p>
            </Section>
          </>
        ) : (
          <>
            <Section title="Source presets">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'iPhone 4:3 (4032×3024)', w: 4032, h: 3024 },
                  { label: 'Full frame 3:2 (6000×4000)', w: 6000, h: 4000 },
                  { label: '4K 16:9 (3840×2160)', w: 3840, h: 2160 },
                  { label: 'Vertical (1080×1920)', w: 1080, h: 1920 },
                ].map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    onClick={() => {
                      setSrcW(String(p.w));
                      setSrcH(String(p.h));
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title="Box presets">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '1920 × 1080', w: 1920, h: 1080 },
                  { label: '1080 × 1080', w: 1080, h: 1080 },
                  { label: '1200 × 630', w: 1200, h: 630 },
                  { label: '1080 × 1920', w: 1080, h: 1920 },
                  { label: '800 × 800', w: 800, h: 800 },
                ].map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    onClick={() => {
                      setBoxW(String(p.w));
                      setBoxH(String(p.h));
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title="Contain or cover">
              <p className="text-[11.5px] leading-[1.6] text-ink-faint">
                Contain keeps every pixel of the source and leaves bars where the ratios disagree. Cover fills the
                box completely and throws away whatever hangs over the edges. Neither ever stretches the picture —
                that would need width and height scaled by different factors.
              </p>
            </Section>
          </>
        )
      }
    />
  );
}
