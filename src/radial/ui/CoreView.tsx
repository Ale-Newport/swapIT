import { convertFileSrc } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { fileIcon } from '@/core/quick';
import type { FileInfo } from '@/core/types';
import { describeSelection, describeSize } from '../catalog/util';
import type { RadialItem } from '../model';
import { folderName } from '../system';

/** Image formats WebKit can paint directly through the asset protocol. */
const PAINTABLE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic', 'heif', 'tif', 'tiff']);

interface Preview {
  src: string;
  photo: boolean;
}

/** A picture for the first file: the photo itself when it can be painted, otherwise Finder's icon. */
function usePreview(file: FileInfo | undefined): Preview | null {
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    setPreview(null);
    if (!file) return;
    let cancelled = false;
    const demo = Boolean((window as unknown as { __RADIAL_DEMO__?: boolean }).__RADIAL_DEMO__);
    if (!demo && (file.kind === 'image' || file.kind === 'svg')) {
      if (PAINTABLE.has(file.extension.toLowerCase())) {
        setPreview({ src: convertFileSrc(file.path), photo: file.kind !== 'svg' });
        return;
      }
    }
    fileIcon(file.path, 64)
      .then((src) => {
        if (!cancelled) setPreview({ src, photo: false });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file]);
  return preview;
}

export interface CoreViewProps {
  files: FileInfo[];
  folder: string | null;
  /** The sub-rings opened so far; empty on the first ring. */
  stack: RadialItem[];
  /** How many petals are on screen. */
  count: number;
  hovered: RadialItem | null;
  query: string;
  dragging: boolean;
}

/** The glass disc in the middle: what you are acting on, what the hovered petal will do, or the way back. */
export function CoreView({ files, folder, stack, count, hovered, query, dragging }: CoreViewProps) {
  const preview = usePreview(files[0]);
  const createMode = files.length === 0;
  const parent = stack[stack.length - 1];

  if (query) {
    return (
      <>
        <div className="rg-core-eyebrow">Search</div>
        <div className="rg-query">
          <span>{query}</span>
          <span className="rg-caret" />
        </div>
        <div className="rg-core-sub">{count > 0 ? 'Enter runs the first' : 'Nothing matches'}</div>
      </>
    );
  }

  if (hovered) {
    return (
      <>
        <div className="rg-core-eyebrow">{dragging ? 'Release to' : parent ? parent.label : ' '}</div>
        <div className="rg-core-visual" style={{ background: 'transparent' }}>
          {hovered.glyph ? (
            <span className="rg-glyph" data-long={hovered.glyph.length > 3}>
              {hovered.glyph}
            </span>
          ) : (
            <Icon name={hovered.icon} size={28} strokeWidth={1.6} />
          )}
        </div>
        <div className="rg-core-title">{hovered.title}</div>
        <div className="rg-core-sub" title={hovered.unavailable ?? hovered.hint}>
          {hovered.unavailable ?? hovered.hint}
        </div>
      </>
    );
  }

  if (parent) {
    // Inside a sub-ring the middle is the way back.
    return (
      <>
        <div className="rg-core-eyebrow rg-back">
          <Icon name="ChevronLeft" size={11} strokeWidth={2.6} /> Back
        </div>
        <div className="rg-core-visual" style={{ background: 'transparent' }}>
          {parent.glyph ? <span className="rg-glyph">{parent.glyph}</span> : <Icon name={parent.icon} size={28} strokeWidth={1.6} />}
        </div>
        <div className="rg-core-title">{parent.label}</div>
        <div className="rg-core-sub">{parent.hint}</div>
      </>
    );
  }

  return (
    <>
      <div className="rg-core-eyebrow">{createMode ? 'Create' : 'Choose'}</div>
      <div className="rg-core-visual" data-photo={preview?.photo || undefined}>
        {createMode ? (
          <Icon name="FolderOpen" size={28} strokeWidth={1.5} />
        ) : preview ? (
          <img src={preview.src} alt="" draggable={false} />
        ) : (
          <Icon name="File" size={26} strokeWidth={1.4} />
        )}
      </div>
      <div className="rg-core-title">{createMode ? folderName(folder) : describeSelection(files)}</div>
      <div className="rg-core-sub">
        {createMode ? 'in this folder' : [files.length > 1 ? `${files.length} items` : files[0]?.kind, describeSize(files)].filter(Boolean).join(' · ')}
      </div>
    </>
  );
}
