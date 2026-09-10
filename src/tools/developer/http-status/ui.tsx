import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Badge, Icon, Input, Section, Segmented } from '@/components/ui';
import {
  CACHE_LABELS,
  CLASS_LABELS,
  STATUS_CODES,
  type StatusClass,
  searchStatuses,
  statusClass,
} from './data';

const FILTERS: Array<{ value: StatusClass | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: '1xx', label: '1xx' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' },
];

const TONE: Record<StatusClass, 'neutral' | 'accent' | 'success' | 'warn' | 'danger'> = {
  '1xx': 'neutral',
  '2xx': 'success',
  '3xx': 'accent',
  '4xx': 'warn',
  '5xx': 'danger',
};

export default function HttpStatusCodes() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusClass | 'all'>('all');
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  const results = useMemo(() => searchStatuses(query, filter), [query, filter]);

  const counts = useMemo(() => {
    const map = new Map<StatusClass, number>();
    for (const status of STATUS_CODES) {
      const key = statusClass(status.code);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, []);

  const copy = async (code: number, name: string) => {
    try {
      await navigator.clipboard.writeText(`${code} ${name}`);
      setCopied(code);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <ToolShell
      main={
        <Section
          title="Status codes"
          description="Click a row to copy it"
          actions={<Badge>{results.length} shown</Badge>}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              autoFocus
              spellCheck={false}
              placeholder="Search by code, name or meaning — 404, teapot, rate limit…"
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-[220px] flex-1"
            />
            <Segmented value={filter} onChange={setFilter} options={FILTERS} />
          </div>

          {results.length === 0 ? (
            <p className="mt-4 text-[12.5px] text-ink-faint">
              Nothing matches “{query}”. Try a number like 429, or a phrase like “redirect”.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              {results.map((status) => {
                const cls = statusClass(status.code);
                return (
                  <button
                    key={status.code}
                    type="button"
                    onClick={() => void copy(status.code, status.name)}
                    className="flex w-full items-start gap-3 border-b border-line px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-canvas"
                  >
                    <span
                      className={clsx(
                        'w-11 shrink-0 font-mono text-[13px] font-semibold tabular-nums',
                        cls === '2xx' && 'text-success',
                        cls === '4xx' && 'text-warn',
                        cls === '5xx' && 'text-danger',
                        cls === '3xx' && 'text-accent',
                        cls === '1xx' && 'text-ink-soft',
                      )}
                    >
                      {status.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-medium text-ink">{status.name}</span>
                        <Badge tone={TONE[cls]}>{CLASS_LABELS[cls]}</Badge>
                        {!status.body && <Badge>no body</Badge>}
                        {status.cacheable === 'default' && <Badge tone="accent">cacheable</Badge>}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-[1.5] text-ink-faint">{status.meaning}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-faint">
                        {CACHE_LABELS[status.cacheable]} · {status.body ? 'may have a body' : 'must not have a body'} ·{' '}
                        {status.spec}
                      </span>
                    </span>
                    <span className="w-14 shrink-0 pt-0.5 text-right text-[11px] text-ink-faint">
                      {copied === status.code ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Icon name="Check" size={12} /> Copied
                        </span>
                      ) : (
                        <Icon name="Copy" size={12} className="opacity-40" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Section>
      }
      aside={
        <>
          <Section title="Classes">
            <div className="space-y-2">
              {(Object.keys(CLASS_LABELS) as StatusClass[]).map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setFilter(filter === cls ? 'all' : cls)}
                  className={clsx(
                    'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                    filter === cls ? 'border-ink bg-canvas' : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-ink">{cls}</span>
                    <span className="text-[12px] text-ink-soft">{CLASS_LABELS[cls]}</span>
                  </span>
                  <Badge tone={TONE[cls]}>{counts.get(cls) ?? 0}</Badge>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Reading the badges">
            <ul className="space-y-1.5 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                <span className="font-medium text-ink-soft">no body</span> — the response must not include content;
                sending one breaks clients and proxies.
              </li>
              <li>
                <span className="font-medium text-ink-soft">cacheable</span> — caches may store it even without
                Cache-Control, so use it deliberately (RFC 9110 §15.1).
              </li>
              <li>
                Everything else is cacheable only when you send explicit freshness headers.
              </li>
            </ul>
          </Section>
        </>
      }
    />
  );
}
