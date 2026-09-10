import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { openPath, revealInFinder } from '@/core/bridge';
import { toolsForFile } from '@/core/registry';
import type { FileInfo } from '@/core/types';
import { Icon } from '@/components/ui';

interface MenuPosition {
  x: number;
  y: number;
}

/**
 * Right-click menu for a file inside the app: the tools that accept it, plus the
 * Finder actions people expect from a native app.
 */
export function useQuickActionMenu() {
  const [file, setFile] = useState<FileInfo | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const openFor = (event: React.MouseEvent, target: FileInfo) => {
    event.preventDefault();
    event.stopPropagation();
    setFile(target);
    setPosition({ x: event.clientX, y: event.clientY });
  };

  const close = () => {
    setFile(null);
    setPosition(null);
  };

  return { file, position, openFor, close };
}

export function QuickActionMenu({
  file,
  position,
  onClose,
  extra,
}: {
  file: FileInfo | null;
  position: MenuPosition | null;
  onClose: () => void;
  extra?: Array<{ label: string; icon: string; run: () => void }>;
}) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState<MenuPosition | null>(position);

  useEffect(() => {
    if (!position) {
      setAdjusted(null);
      return;
    }
    // Keep the menu inside the window.
    const width = 232;
    const height = 320;
    setAdjusted({
      x: Math.min(position.x, window.innerWidth - width - 8),
      y: Math.min(position.y, window.innerHeight - height - 8),
    });
  }, [position]);

  useEffect(() => {
    if (!file) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [file, onClose]);

  if (!file || !adjusted) return null;

  const tools = toolsForFile(file).slice(0, 7);

  const Item = ({ icon, children, onClick }: { icon: string; children: ReactNode; onClick: () => void }) => (
    <button
      type="button"
      onClick={() => {
        onClick();
        onClose();
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-ink/8"
    >
      <Icon name={icon} size={13} className="shrink-0 text-ink-faint" />
      <span className="truncate">{children}</span>
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: adjusted.x, top: adjusted.y }}
      className="animate-pop fixed z-50 w-58 rounded-xl border border-line bg-panel p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-[11px] text-ink-faint" title={file.path}>
        {file.name}
      </p>
      {tools.length > 0 && (
        <>
          {tools.map((tool) => (
            <Item
              key={tool.id}
              icon={tool.icon}
              onClick={() => navigate(`/t/${tool.id}`, { state: { files: [file.path] } })}
            >
              {tool.quickLabel ?? tool.name}
            </Item>
          ))}
          <div className="my-1 border-t border-line" />
        </>
      )}
      {extra?.map((action) => (
        <Item key={action.label} icon={action.icon} onClick={action.run}>
          {action.label}
        </Item>
      ))}
      <Item icon="ExternalLink" onClick={() => void openPath(file.path)}>
        Open
      </Item>
      <Item icon="FolderOpen" onClick={() => void revealInFinder(file.path)}>
        Reveal in Finder
      </Item>
      <Item icon="Copy" onClick={() => void navigator.clipboard.writeText(file.path)}>
        Copy path
      </Item>
    </div>
  );
}
