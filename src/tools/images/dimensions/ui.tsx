import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import { Badge, CopyButton, Icon, Section, Stat } from '@/components/ui';
import {
  humanColorType,
  nextSort,
  orientation,
  sortRows,
  toCsv,
  totals,
  type ImageInfoRow,
  type SortDirection,
  type SortKey,
} from './logic';

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'right' }> = [
  { key: 'name', label: 'Name' },
  { key: 'width', label: 'Dimensions', align: 'right' },
  { key: 'megapixels', label: 'MP', align: 'right' },
  { key: 'aspect', label: 'Aspect' },
  { key: 'color', label: 'Colour' },
  { key: 'alpha', label: 'Alpha' },
  { key: 'size', label: 'Size', align: 'right' },
];

export default function ImageDimensions() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images' });
  const run = useToolRun('images/dimensions', 'Image Dimensions');
  const [rows, setRows] = useState<ImageInfoRow[] | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });

  const selectionKey = files.paths.join('|');
  // A changed selection invalidates the table rather than showing stale numbers.
  useEffect(() => {
    setRows(null);
  }, [selectionKey]);

  const execute = async () => {
    if (files.isEmpty) return;
    const result = await run.executeRaw<ImageInfoRow[]>({
      command: 'image_info',
      total: files.files.length,
      inputs: files.paths,
      label: `Read ${files.files.length} image${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: files.paths },
    });
    setRows(Array.isArray(result) ? result : null);
  };

  const sorted = useMemo(() => (rows ? sortRows(rows, sort.key, sort.direction) : []), [rows, sort]);
  const summary = useMemo(() => totals(rows ?? []), [rows]);

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images here"
            hint="Hundreds at a time — folders are expanded automatically"
            allowFolders
            compact={!files.isEmpty}
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}

          {rows && rows.length > 0 && (
            <Section
              title="Dimensions"
              description={`${summary.count} image${summary.count === 1 ? '' : 's'} · click a column to sort`}
              actions={<CopyButton size="sm" label="Copy CSV" value={() => toCsv(sorted)} />}
              dense
            >
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas">
                      {COLUMNS.map((column) => {
                        const active = sort.key === column.key;
                        return (
                          <th
                            key={column.key}
                            scope="col"
                            className={`px-2.5 py-1.5 font-medium ${
                              column.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSort((current) => nextSort(current, column.key))}
                              className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                                active ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
                              }`}
                            >
                              {column.label}
                              {active && (
                                <Icon
                                  name="ChevronDown"
                                  size={12}
                                  className={sort.direction === 'asc' ? 'rotate-180' : ''}
                                />
                              )}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row) => (
                      <tr key={row.path} className="border-b border-line last:border-0 hover:bg-canvas">
                        <td className="max-w-[22ch] truncate px-2.5 py-1.5 text-ink" title={row.path}>
                          {row.name}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-mono text-ink selectable">
                          {row.width} × {row.height}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-ink-soft">
                          {row.megapixels.toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-ink-soft">
                          <span className="font-mono">{row.aspectRatio}</span>
                          <span className="ml-1.5 text-[11px] text-ink-faint">{orientation(row)}</span>
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-ink-soft">
                          {humanColorType(row.colorType)}
                        </td>
                        <td className="px-2.5 py-1.5">
                          {row.hasAlpha ? <Badge tone="accent">Yes</Badge> : <Badge>No</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-ink-soft">
                          {formatBytes(row.size)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line-strong bg-canvas font-medium text-ink">
                      <td className="px-2.5 py-1.5">{summary.count} total</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right" colSpan={2}>
                        {(summary.pixels / 1_000_000).toFixed(2)} MP
                      </td>
                      <td className="px-2.5 py-1.5 text-ink-faint" colSpan={3}>
                        {summary.pixels.toLocaleString()} pixels
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                        {formatBytes(summary.bytes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Section>
          )}

          {rows && rows.length === 0 && (
            <Section title="Dimensions" dense>
              <p className="py-4 text-center text-[12.5px] text-ink-faint">
                None of those files could be read as an image.
              </p>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Selection">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Files" value={files.files.length} />
              <Stat label="On disk" value={formatBytes(files.totalSize)} />
              {rows && rows.length > 0 && (
                <>
                  <Stat label="Total pixels" value={`${(summary.pixels / 1_000_000).toFixed(1)} MP`} />
                  <Stat
                    label="Largest"
                    value={`${sortRows(rows, 'megapixels', 'desc')[0].megapixels.toFixed(1)} MP`}
                    hint={sortRows(rows, 'megapixels', 'desc')[0].name}
                  />
                </>
              )}
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Read dimensions"
            icon="Ruler"
            disabled={files.isEmpty}
            disabledReason="Add at least one image first."
          />
        </>
      }
    />
  );
}
