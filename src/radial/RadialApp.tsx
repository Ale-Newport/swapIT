import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useEffect, useMemo } from 'react';
import { bindProgressEvents } from '@/core/tasks';
import { dropPoint } from '@/core/dropPoint';
import { useSettings } from '@/core/settings';
import { useAppearance } from './appearance';
import { Ring } from './Ring';
import {
  activate,
  back,
  dropOnRing,
  openSession,
  setHoverFromPoint,
  setQuery,
  step,
} from './session';
import { closeRadial, loadBins, resetAfterHide } from './runner';
import { onRadialDragEnded, onRadialHidden, onRadialOpen, onRadialReleased, onRadialWatch, radialLastOpen } from './native';
import { handleWatchEvent } from './watch';
import { radial, useRadial } from './store';
import { CoreView } from './ui/CoreView';
import { Hud } from './ui/Hud';
import { NewFileCard } from './ui/NewFileCard';
import { RecorderCard } from './ui/RecorderCard';
import { searchItems, visibleItems } from './menu';
import './glass.css';
import './cards.css';

/** Hold-to-select: a key held shorter than this is a tap, which leaves the ring open. */
const HOLD_MS = 260;

function useNativeWiring(): void {
  useEffect(() => {
    document.documentElement.classList.add('radial-root');
    bindProgressEvents();
    void useSettings.getState().load();
    // Probing helper programs is slow; do it now, while nobody is waiting.
    void loadBins();

    const unlisten: Array<() => void> = [];
    let disposed = false;
    const keep = (p: Promise<() => void>) => {
      void p.then((fn) => (disposed ? fn() : unlisten.push(fn))).catch(() => undefined);
    };

    keep(onRadialOpen((payload) => void openSession(payload)));
    // Cold start: the first show can fire before this webview finished loading.
    void radialLastOpen()
      .then((payload) => {
        if (payload && radial.get().phase === 'idle') void openSession(payload);
      })
      .catch(() => undefined);
    keep(onRadialWatch((event) => void handleWatchEvent(event)));
    keep(onRadialHidden(() => resetAfterHide()));
    keep(onRadialDragEnded(() => resetAfterHide()));
    keep(
      onRadialReleased(() => {
        const s = radial.get();
        if (!s.session?.holdKey || s.phase !== 'ring') return;
        if (performance.now() - s.openedAt < HOLD_MS) return;
        if (s.hover !== null) activate(s.hover);
        else if (s.dragging === false && s.hover === null) {
          /* released in the middle: keep the ring open, the user is still deciding */
        }
      }),
    );

    // Files dragged onto the ring: hover follows the pointer, a drop runs the petal.
    void (async () => {
      try {
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          const p = event.payload;
          const point = 'position' in p ? dropPoint(p.position) : null;
          if (p.type === 'enter' || p.type === 'over') {
            radial.patch({ dragging: true });
            // The ring is centred in the window; the webview origin is the window origin.
            setHoverFromPoint(point);
          } else if (p.type === 'drop') {
            radial.patch({ dragging: false });
            void dropOnRing(p.paths ?? [], point);
          } else {
            radial.patch({ dragging: false, hover: null });
          }
        });
        if (disposed) stop();
        else unlisten.push(stop);
      } catch {
        /* running in a plain browser */
      }
    })();

    return () => {
      disposed = true;
      unlisten.forEach((fn) => fn());
    };
  }, []);
}

function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = radial.get();
      if (s.phase === 'idle' || s.phase === 'loading') return;
      if (s.phase === 'hud') {
        if (e.key === 'Escape') closeRadial({ restoreFocus: false });
        return;
      }
      if (s.phase !== 'ring') return; // cards own their keys
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'c' && s.query === '') return;
        return;
      }
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          // One step out at a time: search, then each sub-ring, then the ring itself.
          if (!back()) closeRadial();
          return;
        case 'ArrowRight':
        case 'ArrowDown':
        case 'Tab':
          e.preventDefault();
          step(e.shiftKey && e.key === 'Tab' ? -1 : 1);
          return;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          step(-1);
          return;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (e.key === ' ' && !s.query && s.hover === null) return;
          activate(null);
          return;
        case 'Backspace':
          e.preventDefault();
          if (s.query) setQuery(s.query.slice(0, -1));
          else back();
          return;
      }
      if (/^[1-6]$/.test(e.key) && !s.query) {
        e.preventDefault();
        activate(Number(e.key) - 1);
        return;
      }
      if (e.key.length === 1 && /\S| /.test(e.key)) {
        e.preventDefault();
        setQuery(s.query + e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function RadialApp() {
  useNativeWiring();
  useKeyboard();

  const phase = useRadial((s) => s.phase);
  const closing = useRadial((s) => s.closing);
  const files = useRadial((s) => s.files);
  const folder = useRadial((s) => s.folder);
  const root = useRadial((s) => s.root);
  const pool = useRadial((s) => s.pool);
  const stack = useRadial((s) => s.stack);
  const hover = useRadial((s) => s.hover);
  const pressed = useRadial((s) => s.pressed);
  const dragging = useRadial((s) => s.dragging);
  const query = useRadial((s) => s.query);
  const card = useRadial((s) => s.card);
  const hud = useRadial((s) => s.hud);
  const permissionNote = useRadial((s) => s.permissionNote);
  const appearance = useAppearance();

  const items = useMemo(
    () => visibleItems(root, stack, query.trim() ? searchItems(pool, query) : null),
    [root, stack, pool, query],
  );
  const hovered = hover !== null ? (items[hover] ?? null) : null;
  const menuKey = `${stack.map((i) => i.id).join('>')}|${query ? 'q' : ''}|${files.length}`;

  return (
    <div
      className="rg-root"
      data-theme={appearance.theme}
      style={{ ['--rg-accent' as string]: appearance.accent, ['--rg-tint' as string]: appearance.opacity }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {phase === 'ring' && items.length > 0 && (
        <Ring
          items={items}
          hover={hover}
          pressed={pressed}
          closing={closing}
          dragging={dragging}
          showKeys={false}
          menuKey={menuKey}
          onPoint={(p) => {
            if (radial.get().dragging) return;
            setHoverFromPoint(p);
          }}
          onPress={(p) => radial.patch({ pressed: p })}
          onSelect={(i) => activate(i)}
          onCoreClick={() => void back()}
          onDismiss={() => closeRadial()}
          footer={
            <div className="rg-hint" aria-hidden="true">
              <span>
                <kbd>type</kbd> to search
              </span>
              <span>
                <kbd>esc</kbd> {stack.length > 0 || query ? 'back' : 'close'}
              </span>
            </div>
          }
        >
          <CoreView
            files={files}
            folder={folder}
            stack={stack}
            count={items.length}
            hovered={hovered}
            query={query}
            dragging={dragging}
          />
        </Ring>
      )}

      {phase === 'ring' && items.length === 0 && (
        <div className="rg-panel rg-card" style={{ inset: 120 }}>
          <div className="rg-card-body" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div className="rg-card-title">Nothing to offer</div>
            <div className="rg-card-sub">{permissionNote ?? 'Select a file in Finder, then press the shortcut again.'}</div>
          </div>
        </div>
      )}

      {phase === 'card' && card && (
        <div className="rg-panel-host" data-closing={closing}>
          {card.kind === 'new-file' && (
            <NewFileCard key={card.type} typeId={card.type} folder={folder ?? ''} />
          )}
          {card.kind === 'recorder' && <RecorderCard folder={folder ?? ''} />}
        </div>
      )}

      {phase === 'hud' && hud && <Hud hud={hud} />}

      {phase === 'ring' && permissionNote && items.length > 0 && (
        <button
          type="button"
          className="rg-banner"
          onClick={() => void import('./native').then((m) => m.openPrivacyPane('automation'))}
        >
          Finder selection unavailable — allow Toolbox under Privacy › Automation
        </button>
      )}
    </div>
  );
}

