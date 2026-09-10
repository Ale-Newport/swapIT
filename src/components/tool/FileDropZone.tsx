import clsx from 'clsx';
import { useDropTarget } from '@/core/dnd';
import { formatBytes, shortenPath } from '@/core/format';
import type { ToolFiles } from '@/core/useToolFiles';
import { QuickActionMenu, useQuickActionMenu } from '@/components/QuickActionMenu';
import { Alert, Badge, Button, Icon, IconButton } from '@/components/ui';

const KIND_ICONS: Record<string, string> = {
  image: 'Image',
  svg: 'PenTool',
  video: 'Video',
  audio: 'AudioLines',
  pdf: 'FileText',
  document: 'FileType',
  archive: 'FileArchive',
  text: 'FileText',
  data: 'Braces',
  code: 'FileCode2',
  font: 'Type',
  folder: 'Folder',
  other: 'File',
};

export function kindIcon(kind: string): string {
  return KIND_ICONS[kind] ?? 'File';
}

/**
 * The standard input surface for a tool: a large drop area when empty, a compact
 * reorderable list once files are chosen.
 */
export function FileDropZone({
  files,
  label = 'Drop files here',
  hint,
  accept,
  allowFolders,
  reorderable,
  compact,
  className,
}: {
  files: ToolFiles;
  label?: string;
  hint?: string;
  accept?: string;
  allowFolders?: boolean;
  reorderable?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { ref, isOver } = useDropTarget((paths) => void files.add(paths), { priority: 5 });
  const menu = useQuickActionMenu();

  if (files.isEmpty) {
    return (
      <div className={className}>
        <div
          ref={ref}
          className={clsx(
            'flex flex-col items-center justify-center rounded-card border border-dashed text-center transition-colors',
            compact ? 'gap-2 px-4 py-7' : 'gap-2.5 px-6 py-12',
            isOver ? 'border-accent bg-accent-soft' : 'border-line-strong bg-panel',
          )}
        >
          <div
            className={clsx(
              'flex items-center justify-center rounded-full transition-colors',
              compact ? 'h-9 w-9' : 'h-11 w-11',
              isOver ? 'bg-accent/12 text-accent' : 'bg-ink/5 text-ink-faint',
            )}
          >
            <Icon name={isOver ? 'Download' : 'Upload'} size={compact ? 16 : 19} />
          </div>
          <div>
            <p className="text-[13.5px] font-medium text-ink">{isOver ? 'Release to add' : label}</p>
            {hint && !isOver && <p className="mt-0.5 text-[12px] text-ink-faint">{hint}</p>}
          </div>
          {!isOver && (
            <div className="mt-1 flex items-center gap-2">
              <Button size="sm" icon="FolderOpen" onClick={() => void files.browse()}>
                Browse files
              </Button>
              {allowFolders && (
                <Button size="sm" variant="ghost" icon="Folder" onClick={() => void files.browseFolder()}>
                  Choose folder
                </Button>
              )}
            </div>
          )}
          {accept && !isOver && <p className="text-[11px] text-ink-faint">{accept}</p>}
        </div>
        {files.error && (
          <Alert tone="warn" className="mt-2">
            {files.error}
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={ref}
        className={clsx(
          'rounded-card border bg-panel transition-colors',
          isOver ? 'border-accent ring-2 ring-accent/15' : 'border-line',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12.5px] font-medium text-ink">
              {files.files.length} file{files.files.length === 1 ? '' : 's'}
            </span>
            <Badge>{formatBytes(files.totalSize)}</Badge>
            {files.loading && <span className="text-[11.5px] text-ink-faint">Reading…</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon="Plus" onClick={() => void files.browse()}>
              Add
            </Button>
            <IconButton icon="Trash2" label="Remove all files" size="sm" onClick={files.clear} />
          </div>
        </header>
        <ul className="max-h-56 overflow-y-auto py-1">
          {files.files.map((file, index) => (
            <li
              key={file.path}
              className="group flex items-center gap-2.5 px-3 py-1.5 hover:bg-canvas"
              onContextMenu={(e) => menu.openFor(e, file)}
              draggable={reorderable}
              onDragStart={(e) => {
                if (!reorderable) return;
                e.dataTransfer.setData('text/plain', String(index));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => reorderable && e.preventDefault()}
              onDrop={(e) => {
                if (!reorderable) return;
                e.preventDefault();
                const from = Number(e.dataTransfer.getData('text/plain'));
                if (!Number.isNaN(from)) files.reorder(from, index);
              }}
            >
              {reorderable && (
                <Icon name="GripVertical" size={13} className="shrink-0 cursor-grab text-ink-faint" />
              )}
              <Icon name={kindIcon(file.kind)} size={14} className="shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={file.path}>
                {file.name}
              </span>
              <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(file.size)}</span>
              <span className="hidden shrink-0 text-[11px] text-ink-faint lg:inline" title={file.path}>
                {shortenPath(file.path.split('/').slice(0, -1).join('/'), 2)}
              </span>
              <IconButton
                icon="X"
                label={`Remove ${file.name}`}
                size="sm"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => files.remove(file.path)}
              />
            </li>
          ))}
        </ul>
      </div>
      {files.error && (
        <Alert tone="warn" className="mt-2">
          {files.error}
        </Alert>
      )}
      <QuickActionMenu
        file={menu.file}
        position={menu.position}
        onClose={menu.close}
        extra={
          menu.file
            ? [
                {
                  label: 'Remove from list',
                  icon: 'X',
                  run: () => files.remove(menu.file!.path),
                },
              ]
            : undefined
        }
      />
    </div>
  );
}
