import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Badge, Icon, Input, Section, Tab, TabList, TabPanel, Tabs } from '@/components/ui';
import { ASCII_ROWS, LATIN1_ROWS, type CharRow, searchRows } from './data';

/** A copyable value in the last columns — the CP-1252 glyph or the HTML entity. */
function CopyChip({
  value,
  title,
  active,
  fontSize,
  onClick,
}: {
  value: string | null;
  title: string;
  active: boolean;
  fontSize: string;
  onClick: () => void;
}) {
  if (!value) return <span className="text-[11px] text-ink-faint">—</span>;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'rounded-md px-1.5 py-[1px] font-mono transition-colors',
        fontSize,
        active ? 'bg-success-soft text-success' : 'bg-ink/6 text-ink-soft hover:bg-ink/10 hover:text-ink',
      )}
    >
      {value}
    </button>
  );
}

function CharTable({
  rows,
  copied,
  onCopy,
  showWindows,
}: {
  rows: CharRow[];
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  /** Adds the CP-1252 column, which only the 128–159 range has anything in. */
  showWindows: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-4 text-[12.5px] text-ink-faint">No character matches that search.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className={showWindows ? 'min-w-[700px]' : 'min-w-[620px]'}>
        <div className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
          <span className="w-10 shrink-0 text-right">Dec</span>
          <span className="w-10 shrink-0 text-right">Hex</span>
          <span className="w-10 shrink-0 text-right">Oct</span>
          <span className="w-[74px] shrink-0 text-right">Binary</span>
          <span className="w-14 shrink-0 text-center">Char</span>
          <span className="min-w-0 flex-1">Name</span>
          {showWindows && <span className="w-[72px] shrink-0">CP-1252</span>}
          <span className="w-[86px] shrink-0">Entity</span>
        </div>
        {rows.map((row) => {
          const key = `${row.code}`;
          return (
            <div
              key={row.code}
              className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0 hover:bg-canvas"
            >
              <button
                type="button"
                title={`Copy the character (code ${row.code})`}
                onClick={() => onCopy(row.char, key)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="w-10 shrink-0 text-right font-mono text-[12px] text-ink tabular-nums">{row.code}</span>
                <span className="w-10 shrink-0 text-right font-mono text-[12px] text-ink-soft">{row.hex}</span>
                <span className="w-10 shrink-0 text-right font-mono text-[12px] text-ink-faint">{row.octal}</span>
                <span className="w-[74px] shrink-0 text-right font-mono text-[11.5px] text-ink-faint">
                  {row.binary}
                </span>
                <span
                  className={clsx(
                    'w-14 shrink-0 text-center font-mono',
                    row.isControl || row.abbr ? 'text-[10.5px] text-ink-faint' : 'text-[14px] text-ink',
                  )}
                >
                  {row.display}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                  {row.name}
                  {row.escape && <span className="ml-1.5 font-mono text-[11px] text-ink-faint">{row.escape}</span>}
                </span>
              </button>
              {showWindows && (
                <span className="w-[72px] shrink-0">
                  <CopyChip
                    value={row.windows1252}
                    title="Copy the Windows-1252 character"
                    active={copied === `${key}-win`}
                    fontSize="text-[12px]"
                    onClick={() => onCopy(row.windows1252 as string, `${key}-win`)}
                  />
                </span>
              )}
              <span className="w-[86px] shrink-0">
                <CopyChip
                  value={row.entity}
                  title="Copy the HTML entity"
                  active={copied === `${key}-entity`}
                  fontSize="text-[11px]"
                  onClick={() => onCopy(row.entity as string, `${key}-entity`)}
                />
              </span>
              <span className="w-4 shrink-0">
                {copied === key && <Icon name="Check" size={12} className="text-success" />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AsciiTable() {
  const [tab, setTab] = useState('ascii');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const ascii = useMemo(() => searchRows(ASCII_ROWS, query), [query]);
  const latin1 = useMemo(() => searchRows(LATIN1_ROWS, query), [query]);

  const onCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <ToolShell
      main={
        <Section
          title="Characters"
          description="Click a row to copy the character, or a chip to copy the entity or CP-1252 glyph"
          actions={<Badge>{tab === 'ascii' ? ascii.length : latin1.length} shown</Badge>}
        >
          <Input
            value={query}
            autoFocus
            spellCheck={false}
            placeholder="Search: 65, 0x41, A, escape, &amp;, carriage return…"
            onChange={(e) => setQuery(e.target.value)}
          />

          <Tabs value={tab} onChange={setTab} className="mt-3">
            <TabList>
              <Tab value="ascii">ASCII 0–127</Tab>
              <Tab value="latin1">Latin-1 128–255</Tab>
            </TabList>
            <TabPanel value="ascii" className="mt-2 overflow-hidden rounded-lg border border-line">
              <CharTable rows={ascii} copied={copied} onCopy={onCopy} showWindows={false} />
            </TabPanel>
            <TabPanel value="latin1" className="mt-2 overflow-hidden rounded-lg border border-line">
              <CharTable rows={latin1} copied={copied} onCopy={onCopy} showWindows />
            </TabPanel>
          </Tabs>
        </Section>
      }
      aside={
        <>
          <Section title="Ranges">
            <div className="space-y-1.5 text-[12px] text-ink-soft">
              {[
                ['0–31', 'C0 control codes'],
                ['32', 'Space'],
                ['33–47', 'Punctuation and symbols'],
                ['48–57', 'Digits 0–9'],
                ['65–90', 'Capital letters A–Z'],
                ['97–122', 'Small letters a–z'],
                ['127', 'Delete'],
                ['128–159', 'C1 controls (CP-1252 glyphs)'],
                ['160–255', 'Latin-1 supplement'],
              ].map(([range, meaning]) => (
                <div key={range} className="flex items-baseline gap-2">
                  <span className="w-[60px] shrink-0 font-mono text-[11.5px] text-ink">{range}</span>
                  <span className="min-w-0 flex-1 text-[11.5px] text-ink-faint">{meaning}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Notes">
            <ul className="space-y-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                Bytes 128–159 are control codes in Latin-1 but printable in Windows-1252 — that is why a stray{' '}
                <span className="font-mono">â€œ</span> appears in mis-decoded text.
              </li>
              <li>
                Copying a control code copies the real character, so pasting code 9 gives a tab and code 27 gives an
                escape.
              </li>
              <li>
                Only five ASCII characters have named HTML entities; everything else is written numerically, e.g.{' '}
                <span className="font-mono">&amp;#65;</span>.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
