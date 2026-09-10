import { convertFileSrc } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { formatBytes } from '@/core/format';
import type { FileInfo } from '@/core/types';
import { Icon, Spinner } from '@/components/ui';

/** Local file URL usable in <img>/<video>, via Tauri's asset protocol. */
export function assetUrl(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return '';
  }
}

/** Cache-busting URL for files Toolbox just rewrote. */
export function assetUrlFresh(path: string, token: unknown): string {
  const base = assetUrl(path);
  if (!base) return '';
  return `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(token))}`;
}

export function ImagePreview({
  path,
  className,
  alt = '',
  checkered = true,
  contain = true,
}: {
  path: string | null;
  className?: string;
  alt?: string;
  checkered?: boolean;
  contain?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [path]);

  if (!path) {
    return (
      <div className={clsx('flex items-center justify-center rounded-lg border border-line bg-canvas', className)}>
        <Icon name="Image" size={20} className="text-ink-faint" />
      </div>
    );
  }
  return (
    <div
      className={clsx(
        'relative flex items-center justify-center overflow-hidden rounded-lg border border-line',
        checkered ? 'checkerboard' : 'bg-canvas',
        className,
      )}
    >
      {!loaded && !failed && <Spinner className="absolute" />}
      {failed ? (
        <div className="flex flex-col items-center gap-1 p-4 text-center">
          <Icon name="FileWarning" size={18} className="text-ink-faint" />
          <p className="text-[11.5px] text-ink-faint">No preview for this format</p>
        </div>
      ) : (
        <img
          src={assetUrl(path)}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={clsx('max-h-full max-w-full', contain ? 'object-contain' : 'object-cover', !loaded && 'opacity-0')}
        />
      )}
    </div>
  );
}

/** Side-by-side original vs. result, the shape the compression tools use. */
export function BeforeAfter({
  beforePath,
  afterPath,
  beforeSize,
  afterSize,
  height = 'h-64',
  afterToken,
}: {
  beforePath: string | null;
  afterPath: string | null;
  beforeSize?: number;
  afterSize?: number;
  height?: string;
  afterToken?: unknown;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <figure className="space-y-1.5">
        <ImagePreview path={beforePath} className={height} alt="Original" />
        <figcaption className="flex items-center justify-between text-[11.5px] text-ink-faint">
          <span>Original</span>
          {beforeSize !== undefined && <span>{formatBytes(beforeSize)}</span>}
        </figcaption>
      </figure>
      <figure className="space-y-1.5">
        {afterPath ? (
          <div
            className={clsx(
              'relative flex items-center justify-center overflow-hidden rounded-lg border border-line checkerboard',
              height,
            )}
          >
            <img
              src={afterToken !== undefined ? assetUrlFresh(afterPath, afterToken) : assetUrl(afterPath)}
              alt="Result"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className={clsx('flex items-center justify-center rounded-lg border border-dashed border-line bg-canvas', height)}>
            <p className="text-[11.5px] text-ink-faint">Result appears here</p>
          </div>
        )}
        <figcaption className="flex items-center justify-between text-[11.5px] text-ink-faint">
          <span>Result</span>
          {afterSize !== undefined && <span>{formatBytes(afterSize)}</span>}
        </figcaption>
      </figure>
    </div>
  );
}

export function FileSummary({ file }: { file: FileInfo }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-ink-faint">
      <span className="truncate text-ink" title={file.path}>
        {file.name}
      </span>
      <span>·</span>
      <span>{formatBytes(file.size)}</span>
      {file.extension && (
        <>
          <span>·</span>
          <span className="uppercase">{file.extension}</span>
        </>
      )}
    </div>
  );
}
