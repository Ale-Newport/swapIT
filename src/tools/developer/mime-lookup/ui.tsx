import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Badge, Icon, Input, Section, Segmented, Select } from '@/components/ui';
import {
  CATEGORY_LABELS,
  MIME_TYPES,
  TOTAL_TYPES,
  type MimeCategory,
  type SearchMode,
  searchMimes,
} from './data';

const MODES: Array<{ value: SearchMode; label: string }> = [
  { value: 'any', label: 'Either side' },
  { value: 'extension', label: 'Extension' },
  { value: 'mime', label: 'MIME type' },
];

export default function MimeLookup() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('any');
  const [category, setCategory] = useState<MimeCategory | 'all'>('all');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const results = useMemo(() => searchMimes(query, mode, category), [query, mode, category]);

  const counts = useMemo(() => {
    const map = new Map<MimeCategory, number>();
    for (const entry of MIME_TYPES) map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    return map;
  }, []);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <ToolShell
      main={
        <Section
          title="Lookup"
          description="Type an extension like png, or a media type like image/"
          actions={<Badge>{results.length} of {TOTAL_TYPES}</Badge>}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              autoFocus
              spellCheck={false}
              placeholder="png · .docx · video/mp4 · subtitles"
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-[200px] flex-1"
            />
            <Segmented value={mode} onChange={setMode} options={MODES} />
          </div>

          {results.length === 0 ? (
            <p className="mt-4 text-[12.5px] text-ink-faint">
              Nothing matches “{query}”. Try the extension on its own, or switch the search side.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              {results.map((entry) => (
                <div
                  key={`${entry.mime}-${entry.extensions[0] ?? 'none'}`}
                  className="flex flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-line px-3 py-2.5 last:border-b-0"
                >
                  <button
                    type="button"
                    title="Copy this media type"
                    onClick={() => void copy(entry.mime)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="break-all font-mono text-[12.5px] text-ink">{entry.mime}</span>
                      {copied === entry.mime ? (
                        <Icon name="Check" size={12} className="shrink-0 text-success" />
                      ) : (
                        <Icon name="Copy" size={11} className="shrink-0 opacity-30" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-faint">{entry.label}</span>
                  </button>

                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {entry.extensions.length === 0 ? (
                      <span className="text-[11px] text-ink-faint">no extension</span>
                    ) : (
                      entry.extensions.map((ext) => (
                        <button
                          key={ext}
                          type="button"
                          title={`Copy .${ext}`}
                          onClick={() => void copy(`.${ext}`)}
                          className={clsx(
                            'rounded-md px-1.5 py-[1px] font-mono text-[11px] transition-colors',
                            copied === `.${ext}`
                              ? 'bg-success-soft text-success'
                              : 'bg-ink/6 text-ink-soft hover:bg-ink/10 hover:text-ink',
                          )}
                        >
                          .{ext}
                        </button>
                      ))
                    )}
                    <Badge tone={entry.text ? 'accent' : 'neutral'}>{entry.text ? 'text' : 'binary'}</Badge>
                    <Badge>{CATEGORY_LABELS[entry.category]}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      }
      aside={
        <>
          <Section title="Categories">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as MimeCategory | 'all')}
              options={[
                { value: 'all', label: `All categories (${TOTAL_TYPES})` },
                ...(Object.keys(CATEGORY_LABELS) as MimeCategory[]).map((key) => ({
                  value: key,
                  label: `${CATEGORY_LABELS[key]} (${counts.get(key) ?? 0})`,
                })),
              ]}
            />
            <div className="mt-3 space-y-1">
              {(Object.keys(CATEGORY_LABELS) as MimeCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(category === key ? 'all' : key)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors',
                    category === key ? 'border-ink bg-canvas text-ink' : 'border-line text-ink-soft hover:border-line-strong',
                  )}
                >
                  {CATEGORY_LABELS[key]}
                  <Badge>{counts.get(key) ?? 0}</Badge>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Notes">
            <ul className="space-y-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                One extension can map to several types — <span className="font-mono">.ico</span> and{' '}
                <span className="font-mono">.wav</span> each have a modern and a legacy media type.
              </li>
              <li>
                Types starting with <span className="font-mono">x-</span> are unregistered but widely used; prefer the
                registered form when you control both ends.
              </li>
              <li>
                <span className="font-medium text-ink-soft">text</span> means the payload is human-readable, so a
                charset parameter such as <span className="font-mono">; charset=utf-8</span> belongs on it.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
