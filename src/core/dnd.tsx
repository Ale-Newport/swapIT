import { getCurrentWebview } from '@tauri-apps/api/webview';
import { dropPoint } from './dropPoint';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type DropHandler = (paths: string[]) => void;

interface DropTarget {
  id: string;
  element: HTMLElement;
  onDrop: DropHandler;
  priority: number;
}

interface DndContextValue {
  register: (target: DropTarget) => () => void;
  /** Id of the target currently under the pointer, or 'window' for the fallback. */
  hoverId: string | null;
  dragging: boolean;
  setFallback: (handler: DropHandler | null) => void;
}

const DndContext = createContext<DndContextValue | null>(null);

/**
 * Tauri delivers file drops as a window-level event with a physical position —
 * the DOM never sees a DataTransfer with real paths. This provider keeps a
 * registry of drop targets and routes each drop to the top-most one under the
 * cursor, falling back to the app-wide handler (the Home quick drop).
 */
export function DndProvider({ children }: { children: ReactNode }) {
  const targets = useRef<Map<string, DropTarget>>(new Map());
  const fallback = useRef<DropHandler | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const register = useCallback((target: DropTarget) => {
    targets.current.set(target.id, target);
    return () => {
      targets.current.delete(target.id);
    };
  }, []);

  const setFallback = useCallback((handler: DropHandler | null) => {
    fallback.current = handler;
  }, []);

  const findTarget = useCallback((clientX: number, clientY: number): DropTarget | null => {
    let best: DropTarget | null = null;
    for (const target of targets.current.values()) {
      if (!target.element.isConnected) continue;
      const rect = target.element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      // Deeper / higher-priority targets win over the page-level ones.
      if (!best || target.priority >= best.priority) best = target;
    }
    return best;
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'over') {
            setDragging(true);
            const { x, y } = dropPoint(payload.position);
            const target = findTarget(x, y);
            setHoverId(target ? target.id : 'window');
            return;
          }
          if (payload.type === 'drop') {
            setDragging(false);
            setHoverId(null);
            const paths = (payload.paths ?? []).filter(Boolean);
            if (paths.length === 0) return;
            const at = dropPoint(payload.position);
            const target = findTarget(at.x, at.y);
            if (target) target.onDrop(paths);
            else fallback.current?.(paths);
            return;
          }
          setDragging(false);
          setHoverId(null);
        });
        if (cancelled) stop();
        else unlisten = stop;
      } catch {
        // Not running inside Tauri (e.g. plain `vite dev` in a browser tab).
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [findTarget]);

  const value = useMemo<DndContextValue>(
    () => ({ register, hoverId, dragging, setFallback }),
    [register, hoverId, dragging, setFallback],
  );
  return <DndContext.Provider value={value}>{children}</DndContext.Provider>;
}

export function useDnd(): DndContextValue {
  const ctx = useContext(DndContext);
  if (!ctx) {
    // Keeps tools renderable in tests without the provider.
    return { register: () => () => undefined, hoverId: null, dragging: false, setFallback: () => undefined };
  }
  return ctx;
}

let dropIdSeq = 0;

/**
 * Register an element as a drop target. Returns a ref to attach plus whether a
 * drag is currently hovering it.
 */
export function useDropTarget(onDrop: DropHandler, options: { priority?: number; disabled?: boolean } = {}) {
  const { register, hoverId, dragging } = useDnd();
  const ref = useRef<HTMLDivElement | null>(null);
  const idRef = useRef<string>(`drop_${++dropIdSeq}`);
  const handlerRef = useRef(onDrop);
  handlerRef.current = onDrop;
  const { priority = 1, disabled = false } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;
    return register({
      id: idRef.current,
      element,
      priority,
      onDrop: (paths) => handlerRef.current(paths),
    });
  }, [register, priority, disabled]);

  return {
    ref,
    isOver: !disabled && hoverId === idRef.current,
    dragging,
  };
}

/** Register the app-wide handler used when a drop lands outside every target. */
export function useDropFallback(handler: DropHandler | null): void {
  const { setFallback } = useDnd();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!handler) return;
    setFallback((paths) => handlerRef.current?.(paths));
    return () => setFallback(null);
    // Only re-run when the presence of a handler changes, not on every render.
  }, [setFallback, handler === null]); // eslint-disable-line react-hooks/exhaustive-deps
}
