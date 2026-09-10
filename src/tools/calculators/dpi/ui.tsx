import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import { Badge, Button, CopyButton, Field, Input, Section, Segmented, Select, Stat } from '@/components/ui';
import {
  UNIT_SHORT,
  dpiFor,
  fmt,
  fromInches,
  inchesToPixels,
  parsePositive,
  pixelsToInches,
  printQuality,
  screenReport,
  toInches,
  type LengthUnit,
} from './logic';

type Mode = 'to-size' | 'to-pixels' | 'effective' | 'screen';

const DPI_PRESETS = [
  { label: '72', value: '72', hint: 'Legacy web / screen' },
  { label: '96', value: '96', hint: 'Windows screen default' },
  { label: '150', value: '150', hint: 'Draft print, large formats' },
  { label: '300', value: '300', hint: 'Standard print quality' },
  { label: '600', value: '600', hint: 'Fine art and line art' },
];

const UNIT_OPTIONS = [
  { value: 'in', label: 'inches' },
  { value: 'cm', label: 'centimetres' },
  { value: 'mm', label: 'millimetres' },
];

const SCREEN_PRESETS = [
  { label: '13.6" MacBook Air', d: '13.6', w: '2560', h: '1664' },
  { label: '27" 4K monitor', d: '27', w: '3840', h: '2160' },
  { label: '24" 1080p monitor', d: '24', w: '1920', h: '1080' },
  { label: '32" 1440p monitor', d: '32', w: '2560', h: '1440' },
  { label: '6.1" phone', d: '6.1', w: '1179', h: '2556' },
  { label: '11" tablet', d: '11', w: '1668', h: '2388' },
];

function Formula({ children }: { children: ReactNode }) {
  return <p className="mt-3 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">{children}</p>;
}

function NumField({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  const invalid = value.trim() !== '' && parsePositive(value) === null;
  return (
    <Field label={label} hint={hint} error={invalid ? 'Enter a number above zero' : undefined}>
      <div className="relative">
        <Input
          value={value}
          aria-label={label}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={clsx('font-mono', suffix && 'pr-10', invalid && 'border-danger focus:border-danger')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-faint">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export default function DpiCalculator() {
  const [mode, setMode] = useState<Mode>('to-size');
  const [pxW, setPxW] = useState('3000');
  const [pxH, setPxH] = useState('2000');
  const [dpiText, setDpiText] = useState('300');
  const [physW, setPhysW] = useState('10');
  const [physH, setPhysH] = useState('8');
  const [unit, setUnit] = useState<LengthUnit>('in');
  const [diagonal, setDiagonal] = useState('27');
  const [screenW, setScreenW] = useState('3840');
  const [screenH, setScreenH] = useState('2160');

  const w = parsePositive(pxW);
  const h = parsePositive(pxH);
  const dpi = parsePositive(dpiText);
  const pw = parsePositive(physW);
  const ph = parsePositive(physH);

  // --- pixels → physical size
  const sizeInchesW = w !== null && dpi !== null ? pixelsToInches(w, dpi) : null;
  const sizeInchesH = h !== null && dpi !== null ? pixelsToInches(h, dpi) : null;

  // --- physical size → pixels
  const needW = pw !== null && dpi !== null ? inchesToPixels(toInches(pw, unit), dpi) : null;
  const needH = ph !== null && dpi !== null ? inchesToPixels(toInches(ph, unit), dpi) : null;

  // --- effective DPI
  const effW = w !== null && pw !== null ? dpiFor(w, toInches(pw, unit)) : null;
  const effH = h !== null && ph !== null ? dpiFor(h, toInches(ph, unit)) : null;
  const effLow = effW !== null && effH !== null ? Math.min(effW, effH) : (effW ?? effH);
  const verdict = printQuality(effLow ?? 0);

  // --- screen PPI
  const screen = screenReport(
    parsePositive(diagonal) ?? 0,
    parsePositive(screenW) ?? 0,
    parsePositive(screenH) ?? 0,
  );

  const copySummary = () => {
    switch (mode) {
      case 'to-size':
        return sizeInchesW !== null && sizeInchesH !== null
          ? `${w} × ${h} px at ${dpi} DPI = ${fmt(sizeInchesW)} × ${fmt(sizeInchesH)} in (${fmt(fromInches(sizeInchesW, 'cm'))} × ${fmt(fromInches(sizeInchesH, 'cm'))} cm)`
          : '';
      case 'to-pixels':
        return needW !== null && needH !== null
          ? `${physW} × ${physH} ${UNIT_SHORT[unit]} at ${dpi} DPI = ${Math.ceil(needW)} × ${Math.ceil(needH)} px`
          : '';
      case 'effective':
        return effW !== null && effH !== null
          ? `${w} × ${h} px printed at ${physW} × ${physH} ${UNIT_SHORT[unit]} = ${fmt(effW, 1)} × ${fmt(effH, 1)} DPI`
          : '';
      default:
        return screen ? `${fmt(screen.ppi, 2)} PPI · dot pitch ${fmt(screen.dotPitchMm, 4)} mm` : '';
    }
  };

  return (
    <ToolShell
      main={
        <>
          <div className="flex items-center justify-between gap-3">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'to-size', label: 'Pixels → size' },
                { value: 'to-pixels', label: 'Size → pixels' },
                { value: 'effective', label: 'Effective DPI' },
                { value: 'screen', label: 'Screen PPI' },
              ]}
            />
            <CopyButton size="sm" value={copySummary} label="Copy" disabled={!copySummary()} />
          </div>

          {mode === 'to-size' && (
            <Section title="Printed size" description="How big these pixels come out on paper">
              <OptionsGrid cols={3}>
                <NumField label="Width" hint="pixels" value={pxW} onChange={setPxW} suffix="px" />
                <NumField label="Height" hint="pixels" value={pxH} onChange={setPxH} suffix="px" />
                <NumField label="Resolution" hint="dots per inch" value={dpiText} onChange={setDpiText} suffix="dpi" />
              </OptionsGrid>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="py-1.5 pr-3 font-medium">Unit</th>
                      <th className="py-1.5 pr-3 font-medium">Width</th>
                      <th className="py-1.5 pr-3 font-medium">Height</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(['in', 'cm', 'mm'] as LengthUnit[]).map((u) => (
                      <tr key={u}>
                        <td className="py-2 pr-3 text-ink-soft">{UNIT_SHORT[u]}</td>
                        <td className="py-2 pr-3 font-mono text-ink selectable">
                          {sizeInchesW === null ? '—' : `${fmt(fromInches(sizeInchesW, u), u === 'in' ? 3 : 2)}`}
                        </td>
                        <td className="py-2 pr-3 font-mono text-ink selectable">
                          {sizeInchesH === null ? '—' : `${fmt(fromInches(sizeInchesH, u), u === 'in' ? 3 : 2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Formula>
                {sizeInchesW === null
                  ? 'inches = pixels ÷ dpi · cm = inches × 2.54 · mm = inches × 25.4'
                  : `${fmt(w, 0)} px ÷ ${fmt(dpi, 0)} dpi = ${fmt(sizeInchesW, 4)} in → × 25.4 = ${fmt(fromInches(sizeInchesW, 'mm'), 2)} mm`}
              </Formula>
            </Section>
          )}

          {mode === 'to-pixels' && (
            <Section title="Pixels needed" description="The file size a print at this resolution demands">
              <OptionsGrid cols={2}>
                <NumField label="Print width" value={physW} onChange={setPhysW} suffix={UNIT_SHORT[unit]} />
                <NumField label="Print height" value={physH} onChange={setPhysH} suffix={UNIT_SHORT[unit]} />
                <Field label="Units">
                  <Select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as LengthUnit)}
                    options={UNIT_OPTIONS}
                  />
                </Field>
                <NumField label="Resolution" hint="dots per inch" value={dpiText} onChange={setDpiText} suffix="dpi" />
              </OptionsGrid>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Stat label="Width" value={needW === null ? '—' : `${Math.ceil(needW).toLocaleString('en-US')} px`} />
                <Stat label="Height" value={needH === null ? '—' : `${Math.ceil(needH).toLocaleString('en-US')} px`} />
                <Stat
                  label="Megapixels"
                  value={needW === null || needH === null ? '—' : `${((needW * needH) / 1e6).toFixed(2)} MP`}
                />
                <Stat
                  label="At 300 dpi instead"
                  value={
                    pw === null || ph === null
                      ? '—'
                      : `${Math.ceil(toInches(pw, unit) * 300).toLocaleString('en-US')} × ${Math.ceil(toInches(ph, unit) * 300).toLocaleString('en-US')} px`
                  }
                />
              </div>

              <Formula>
                {needW === null
                  ? 'pixels = size in inches × dpi'
                  : `${fmt(pw)} ${UNIT_SHORT[unit]} = ${fmt(toInches(pw!, unit), 4)} in × ${fmt(dpi, 0)} dpi = ${fmt(needW, 1)} px → rounded up ${Math.ceil(needW)}`}
              </Formula>
            </Section>
          )}

          {mode === 'effective' && (
            <Section title="Effective resolution" description="What you really get printing this file at this size">
              <OptionsGrid cols={2}>
                <NumField label="Image width" value={pxW} onChange={setPxW} suffix="px" />
                <NumField label="Image height" value={pxH} onChange={setPxH} suffix="px" />
                <NumField label="Print width" value={physW} onChange={setPhysW} suffix={UNIT_SHORT[unit]} />
                <NumField label="Print height" value={physH} onChange={setPhysH} suffix={UNIT_SHORT[unit]} />
              </OptionsGrid>
              <div className="mt-3">
                <Field label="Units">
                  <Select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as LengthUnit)}
                    options={UNIT_OPTIONS}
                  />
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Stat label="Across the width" value={effW === null ? '—' : `${fmt(effW, 1)} dpi`} />
                <Stat label="Across the height" value={effH === null ? '—' : `${fmt(effH, 1)} dpi`} />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint">Verdict</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone={effLow === null ? 'neutral' : verdict.tone}>
                      {effLow === null ? 'Waiting for numbers' : verdict.label}
                    </Badge>
                    <span className="text-[11.5px] text-ink-faint">{effLow === null ? '' : verdict.note}</span>
                  </div>
                </div>
              </div>

              {effW !== null && effH !== null && Math.abs(effW - effH) / Math.max(effW, effH) > 0.01 && (
                <p className="mt-3 text-[11.5px] text-warn">
                  The two axes disagree, so the print would be stretched. Match the print ratio to the image ratio, or
                  crop first.
                </p>
              )}

              <Formula>
                {effW === null
                  ? 'dpi = pixels ÷ size in inches'
                  : `${fmt(w, 0)} px ÷ ${fmt(toInches(pw!, unit), 4)} in = ${fmt(effW, 2)} dpi`}
              </Formula>
              {w !== null && h !== null && dpi !== null && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  At {fmt(dpi, 0)} dpi this file prints up to {fmt(w / dpi, 2)} × {fmt(h / dpi, 2)} in (
                  {fmt(fromInches(w / dpi, 'cm'), 1)} × {fmt(fromInches(h / dpi, 'cm'), 1)} cm). Change the target with
                  the resolution presets.
                </p>
              )}
            </Section>
          )}

          {mode === 'screen' && (
            <Section title="Screen pixel density" description="From the advertised diagonal and the resolution">
              <OptionsGrid cols={3}>
                <NumField label="Diagonal" hint="inches, as advertised" value={diagonal} onChange={setDiagonal} suffix="in" />
                <NumField label="Horizontal" value={screenW} onChange={setScreenW} suffix="px" />
                <NumField label="Vertical" value={screenH} onChange={setScreenH} suffix="px" />
              </OptionsGrid>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Stat label="Density" value={screen ? `${fmt(screen.ppi, 2)} PPI` : '—'} />
                <Stat label="Dot pitch" value={screen ? `${fmt(screen.dotPitchMm, 4)} mm` : '—'} hint="pixel spacing" />
                <Stat
                  label="Panel size"
                  value={
                    screen
                      ? `${fmt(screen.widthInches, 2)} × ${fmt(screen.heightInches, 2)} in`
                      : '—'
                  }
                  hint={
                    screen
                      ? `${fmt(fromInches(screen.widthInches, 'cm'), 1)} × ${fmt(fromInches(screen.heightInches, 'cm'), 1)} cm`
                      : undefined
                  }
                />
                <Stat
                  label="Total pixels"
                  value={
                    parsePositive(screenW) && parsePositive(screenH)
                      ? `${((parsePositive(screenW)! * parsePositive(screenH)!) / 1e6).toFixed(2)} MP`
                      : '—'
                  }
                />
              </div>

              <Formula>
                {screen
                  ? `√(${fmt(parsePositive(screenW), 0)}² + ${fmt(parsePositive(screenH), 0)}²) = ${fmt(screen.diagonalPixels, 1)} px ÷ ${diagonal} in = ${fmt(screen.ppi, 2)} PPI`
                  : 'ppi = √(width² + height²) ÷ diagonal in inches'}
              </Formula>
              <p className="mt-2 text-[11.5px] leading-[1.6] text-ink-faint">
                Above roughly 220 PPI at normal viewing distance a display is usually called “retina” — text edges
                stop being resolvable. Phones sit at 400–500 PPI because they are held much closer.
              </p>
            </Section>
          )}
        </>
      }
      aside={
        <>
          {mode !== 'screen' && (
            <Section
              title="Resolution presets"
              description={
                mode === 'effective'
                  ? 'Sets the target used for the maximum print size'
                  : 'Sets the resolution field'
              }
            >
              <PresetRow presets={DPI_PRESETS} active={dpiText} onSelect={setDpiText} />
              <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
                DPI is a print measure and PPI a screen one, but every image editor uses the terms interchangeably.
                The number is only metadata — it changes nothing about the pixels until something is printed.
              </p>
            </Section>
          )}

          {mode === 'screen' && (
            <Section title="Screen presets">
              <div className="flex flex-wrap gap-1.5">
                {SCREEN_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    onClick={() => {
                      setDiagonal(p.d);
                      setScreenW(p.w);
                      setScreenH(p.h);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </Section>
          )}

          <Section title="What each resolution is for">
            <ul className="space-y-2 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                <span className="font-medium text-ink-soft">300 dpi</span> — photo books, magazines, anything held in
                the hand.
              </li>
              <li>
                <span className="font-medium text-ink-soft">150 dpi</span> — posters and banners seen from a metre or
                more.
              </li>
              <li>
                <span className="font-medium text-ink-soft">72–96 dpi</span> — screen work. Printing at this density
                looks soft.
              </li>
              <li>
                <span className="font-medium text-ink-soft">600 dpi</span> — line art, engravings and scans of text,
                where edges must stay crisp.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
