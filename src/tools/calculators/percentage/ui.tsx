import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Badge, Button, CopyButton, Field, Input, Section, Segmented, Select } from '@/components/ui';
import {
  applyPercent,
  formatNumber,
  formatSigned,
  parseNumber,
  percentChange,
  percentOf,
  reversePercent,
  whatPercent,
} from './logic';

/** A compact inline number field that goes red the moment the text stops parsing. */
function Num({
  value,
  onChange,
  label,
  width = 'w-24',
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  width?: string;
  placeholder?: string;
}) {
  const valid = value.trim() === '' || parseNumber(value) !== null;
  return (
    <div className={width}>
      <Input
        value={value}
        aria-label={label}
        placeholder={placeholder}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={clsx('text-center font-mono', !valid && 'border-danger focus:border-danger')}
      />
    </div>
  );
}

function Row({ children, formula, note }: { children: ReactNode; formula: ReactNode; note?: ReactNode }) {
  return (
    <div className="space-y-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink">{children}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="font-mono text-[11.5px] leading-[1.6] text-ink-faint selectable">{formula}</p>
        {note}
      </div>
    </div>
  );
}

function Result({ value }: { value: string }) {
  return (
    <div className="ml-auto flex items-center gap-1.5">
      <span className="text-[13px] text-ink-faint">=</span>
      <span className="min-w-0 text-[15px] font-semibold text-ink selectable">{value}</span>
      <CopyButton value={value} label="" size="sm" variant="ghost" disabled={value === '—'} />
    </div>
  );
}

const DECIMAL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '0', label: '0 decimals' },
  { value: '1', label: '1 decimal' },
  { value: '2', label: '2 decimals' },
  { value: '3', label: '3 decimals' },
  { value: '4', label: '4 decimals' },
  { value: '6', label: '6 decimals' },
];

export default function PercentageCalculator() {
  const [decimalMode, setDecimalMode] = useState('auto');
  const dp = decimalMode === 'auto' ? null : Number(decimalMode);
  const fmt = (value: number | null) => formatNumber(value, dp);
  const fmtSigned = (value: number | null) => formatSigned(value, dp);

  // 1 — X% of Y
  const [ofPercent, setOfPercent] = useState('15');
  const [ofValue, setOfValue] = useState('200');
  // 2 — X is what % of Y
  const [sharePart, setSharePart] = useState('30');
  const [shareWhole, setShareWhole] = useState('200');
  // 3 — change from X to Y
  const [changeFrom, setChangeFrom] = useState('80');
  const [changeTo, setChangeTo] = useState('100');
  // 4 — add / subtract X% from Y
  const [adjustValue, setAdjustValue] = useState('200');
  const [adjustPercent, setAdjustPercent] = useState('15');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  // 5 — Y is X% of what
  const [reverseResult, setReverseResult] = useState('30');
  const [reversePct, setReversePct] = useState('15');

  const p1 = parseNumber(ofPercent);
  const v1 = parseNumber(ofValue);
  const r1 = p1 !== null && v1 !== null ? percentOf(p1, v1) : null;

  const part2 = parseNumber(sharePart);
  const whole2 = parseNumber(shareWhole);
  const r2 = part2 !== null && whole2 !== null ? whatPercent(part2, whole2) : null;

  const from3 = parseNumber(changeFrom);
  const to3 = parseNumber(changeTo);
  const r3 = from3 !== null && to3 !== null ? percentChange(from3, to3) : null;
  const diff3 = from3 !== null && to3 !== null ? to3 - from3 : null;

  const v4 = parseNumber(adjustValue);
  const p4 = parseNumber(adjustPercent);
  const r4 = v4 !== null && p4 !== null ? applyPercent(v4, p4, direction) : null;
  const delta4 = v4 !== null && p4 !== null ? (p4 / 100) * v4 : null;

  const r5result = parseNumber(reverseResult);
  const p5 = parseNumber(reversePct);
  const r5 = r5result !== null && p5 !== null ? reversePercent(r5result, p5) : null;

  const resetAll = () => {
    setOfPercent('15');
    setOfValue('200');
    setSharePart('30');
    setShareWhole('200');
    setChangeFrom('80');
    setChangeTo('100');
    setAdjustValue('200');
    setAdjustPercent('15');
    setDirection('add');
    setReverseResult('30');
    setReversePct('15');
  };

  return (
    <ToolShell
      main={
        <Section
          title="Calculations"
          description="Every row updates as you type — nothing to press"
          actions={
            <Button size="sm" variant="ghost" icon="RotateCcw" onClick={resetAll}>
              Reset
            </Button>
          }
        >
          <div className="divide-y divide-line">
            <Row
              formula={
                r1 === null
                  ? 'result = percent ÷ 100 × value'
                  : `${formatNumber(p1)} ÷ 100 × ${formatNumber(v1)} = ${fmt(r1)}`
              }
            >
              <span>What is</span>
              <Num value={ofPercent} onChange={setOfPercent} label="Percentage" width="w-20" />
              <span>% of</span>
              <Num value={ofValue} onChange={setOfValue} label="Value" width="w-28" />
              <span>?</span>
              <Result value={fmt(r1)} />
            </Row>

            <Row
              formula={
                whole2 === 0
                  ? 'Nothing can be a share of zero — the division is undefined'
                  : r2 === null
                    ? 'result = part ÷ whole × 100'
                    : `${formatNumber(part2)} ÷ ${formatNumber(whole2)} × 100 = ${fmt(r2)}%`
              }
              note={
                r2 !== null && r2 > 100 ? (
                  <Badge tone="warn">More than the whole</Badge>
                ) : undefined
              }
            >
              <Num value={sharePart} onChange={setSharePart} label="Part" width="w-24" />
              <span>is what percent of</span>
              <Num value={shareWhole} onChange={setShareWhole} label="Whole" width="w-28" />
              <span>?</span>
              <Result value={r2 === null ? '—' : `${fmt(r2)}%`} />
            </Row>

            <Row
              formula={
                from3 === 0
                  ? 'Change from zero has no percentage — every increase would be infinite'
                  : r3 === null
                    ? 'change = (to − from) ÷ from × 100'
                    : `(${formatNumber(to3)} − ${formatNumber(from3)}) ÷ ${formatNumber(from3)} × 100 = ${fmtSigned(r3)}%`
              }
              note={
                r3 === null ? undefined : (
                  <div className="flex items-center gap-2">
                    <Badge tone={r3 > 0 ? 'success' : r3 < 0 ? 'danger' : 'neutral'}>
                      {r3 > 0 ? 'Increase' : r3 < 0 ? 'Decrease' : 'No change'}
                    </Badge>
                    <span className="text-[11.5px] text-ink-faint">
                      difference {fmtSigned(diff3)}
                    </span>
                  </div>
                )
              }
            >
              <span>Change from</span>
              <Num value={changeFrom} onChange={setChangeFrom} label="Start value" width="w-24" />
              <span>to</span>
              <Num value={changeTo} onChange={setChangeTo} label="End value" width="w-24" />
              <Result value={r3 === null ? '—' : `${fmtSigned(r3)}%`} />
            </Row>

            <Row
              formula={
                r4 === null
                  ? 'result = value ± percent ÷ 100 × value'
                  : `${formatNumber(v4)} ${direction === 'add' ? '+' : '−'} (${formatNumber(p4)} ÷ 100 × ${formatNumber(v4)}) = ${formatNumber(v4)} ${direction === 'add' ? '+' : '−'} ${fmt(delta4)} = ${fmt(r4)}`
              }
            >
              <Segmented
                size="sm"
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'add', label: 'Add' },
                  { value: 'subtract', label: 'Subtract' },
                ]}
              />
              <Num value={adjustPercent} onChange={setAdjustPercent} label="Percentage to apply" width="w-20" />
              <span>% {direction === 'add' ? 'to' : 'from'}</span>
              <Num value={adjustValue} onChange={setAdjustValue} label="Base value" width="w-28" />
              <Result value={fmt(r4)} />
            </Row>

            <Row
              formula={
                p5 === 0
                  ? 'Zero percent of anything is zero, so the original value cannot be recovered'
                  : r5 === null
                    ? 'original = result ÷ (percent ÷ 100)'
                    : `${formatNumber(r5result)} ÷ (${formatNumber(p5)} ÷ 100) = ${fmt(r5)}`
              }
            >
              <Num value={reverseResult} onChange={setReverseResult} label="Known result" width="w-24" />
              <span>is</span>
              <Num value={reversePct} onChange={setReversePct} label="Percentage" width="w-20" />
              <span>% of what?</span>
              <Result value={fmt(r5)} />
            </Row>
          </div>
        </Section>
      }
      aside={
        <>
          <Section title="Display">
            <Field label="Rounding" hint="Applies to every result on this page">
              <Select
                value={decimalMode}
                onChange={(e) => setDecimalMode(e.target.value)}
                options={DECIMAL_OPTIONS}
              />
            </Field>
          </Section>

          <Section title="Worth knowing">
            <ul className="space-y-2.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                <span className="font-medium text-ink-soft">Up then down is not a round trip.</span> Add 20% to 100
                and you get 120; take 20% off 120 and you land on 96, not 100. Use the last row to reverse a
                percentage properly.
              </li>
              <li>
                <span className="font-medium text-ink-soft">Percent vs percentage points.</span> Going from 20% to
                25% is a rise of 5 percentage points, but a 25% increase.
              </li>
              <li>
                <span className="font-medium text-ink-soft">Removing tax.</span> A price that already includes 21%
                VAT is 121% of the net price — put the gross in the last row with 121 as the percentage.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
